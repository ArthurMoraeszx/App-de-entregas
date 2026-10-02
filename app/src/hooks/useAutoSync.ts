/**
 * useAutoSync
 *
 * Escuta estado da rede e do AppState e dispara syncData() automaticamente:
 *  - Na montagem, se já estiver online.
 *  - Ao reconectar (offline → online).
 *  - Ao voltar ao primeiro plano (background → active) com rede disponível.
 *  - Periodicamente a cada 5 minutos enquanto online e em primeiro plano.
 *
 * Regras:
 *  - Só sincroniza se isConnected === true E isInternetReachable !== false.
 *  - Usa o mutex interno do syncService para não criar corridas.
 *  - Expõe `isSyncing` e `lastSyncAt` para uso opcional na UI.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, AppStateStatus, InteractionManager, Platform, ToastAndroid } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { syncData, resetUploadRetries } from '../database/sync/syncService';
import { syncErrorToast, reportError } from '../utils/syncError';
import { flushDiagnosticQueue } from '../utils/diagnostics';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

export function useAutoSync() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
    const [isOnline, setIsOnline] = useState(false);
    const wasOfflineRef = useRef<boolean | null>(null);
    const isOnlineRef = useRef(false);
    const lastErrorToastRef = useRef<number>(0);
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);

    const runSync = useCallback(() => {
        // Aguarda o fim de qualquer interação ativa (tap, animação) antes de iniciar o sync.
        // Sem isso, o processamento do pullChanges na thread JS compete com eventos de toque
        // e causa atraso perceptível em botões e inputs.
        InteractionManager.runAfterInteractions(async () => {
            setIsSyncing(true);
            try {
                await syncData();
                setLastSyncAt(new Date());
            } catch (error) {
                reportError(error, 'auto_sync');
                console.warn('[useAutoSync] Erro ao sincronizar:', error);
                if (Platform.OS === 'android') {
                    const now = Date.now();
                    if (now - lastErrorToastRef.current > 5 * 60 * 1000) {
                        lastErrorToastRef.current = now;
                        ToastAndroid.show(syncErrorToast(error), ToastAndroid.LONG);
                    }
                }
            } finally {
                // Tenta enviar os diagnósticos acumulados independente do sync ter
                // sucesso ou falhado. O endpoint /mobile/diagnostics é leve e não
                // exige autenticação nem o ciclo completo do WatermelonDB — antes,
                // isso só rodava no caminho de sucesso, então um dispositivo com
                // sync quebrado (o cenário que mais precisamos enxergar) nunca
                // reportava nada: mobile_diagnostics ficava em silêncio justamente
                // quando o motorista mais precisava de ajuda.
                flushDiagnosticQueue().catch(() => {});
                setIsSyncing(false);
            }
        });
    }, []);

    // Sync ao montar e ao reconectar
    useEffect(() => {
        const handleNetworkChange = (state: NetInfoState) => {
            const isOnline =
                state.isConnected === true &&
                state.isInternetReachable !== false;

            isOnlineRef.current = isOnline;
            setIsOnline(isOnline);

            if (isOnline) {
                if (wasOfflineRef.current === null || wasOfflineRef.current === true) {
                    // Ao reconectar, zera cooldowns de upload para que fotos pendentes
                    // sejam retentadas imediatamente, sem esperar 30 min de cooldown.
                    if (wasOfflineRef.current === true) {
                        resetUploadRetries().catch(() => {});
                    }
                    runSync();
                }
            }

            wasOfflineRef.current = !isOnline;
        };

        NetInfo.fetch().then(handleNetworkChange);
        const unsubscribe = NetInfo.addEventListener(handleNetworkChange);
        return () => { unsubscribe(); };
    }, [runSync]);

    // Sync ao voltar ao primeiro plano (app minimizado → aberto de novo)
    useEffect(() => {
        const handleAppStateChange = (nextState: AppStateStatus) => {
            const comingToForeground =
                appStateRef.current !== 'active' && nextState === 'active';
            appStateRef.current = nextState;

            if (comingToForeground && isOnlineRef.current) {
                runSync();
            }
        };

        const sub = AppState.addEventListener('change', handleAppStateChange);
        return () => sub.remove();
    }, [runSync]);

    // Sync periódico a cada 5 minutos (só se online e em primeiro plano)
    useEffect(() => {
        const interval = setInterval(() => {
            if (isOnlineRef.current && appStateRef.current === 'active') {
                runSync();
            }
        }, SYNC_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [runSync]);

    return { isSyncing, lastSyncAt, isOnline };
}
