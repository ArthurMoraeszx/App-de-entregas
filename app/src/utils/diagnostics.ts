/**
 * diagnostics — fila offline de eventos de erro do app.
 *
 * Eventos são enfileirados localmente (AsyncStorage) e enviados ao servidor
 * no próximo sincronização bem-sucedida, mesmo que aconteçam sem conexão.
 *
 * Isso permite rastrear o que aconteceu no celular do motorista mesmo quando
 * o erro impede a conexão com o servidor.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/network';
import { getDeviceId } from './deviceId';
import { authService } from '../services/auth';

const QUEUE_KEY = '@rotaescolar:diagnostics_queue_v1';
const MAX_QUEUED = 200;

export type ErrorType = 'network' | 'auth' | 'timeout' | 'server' | 'local_db' | 'unknown';

export interface DiagnosticEvent {
    error_type: ErrorType;
    /** Código do erro: axios error code, HTTP status, ou descrição curta */
    error_code?: string;
    /** Onde o erro aconteceu: 'force_resend', 'auto_sync', 'save_delivery', etc. */
    context: string;
    /** Timestamp em ms (UTC) de quando o erro ocorreu */
    occurred_at: number;
    /** Dados extras: tipo de rede, tentativas, etc. */
    extra?: Record<string, unknown>;
}

interface QueuedEvent extends DiagnosticEvent {
    username: string | null;
    device_id: string | null;
    app_version: string | null;
}

/**
 * Enfileira um evento de erro para ser enviado na próxima sync bem-sucedida.
 * Fire-and-forget: nunca lança exceção.
 */
export async function queueDiagnosticEvent(event: DiagnosticEvent): Promise<void> {
    try {
        const [deviceId, user] = await Promise.all([
            getDeviceId().catch(() => null),
            authService.getUser().catch(() => null),
        ]);

        const raw = await AsyncStorage.getItem(QUEUE_KEY).catch(() => null);
        const queue: QueuedEvent[] = raw ? JSON.parse(raw) : [];

        const queued: QueuedEvent = {
            ...event,
            username: (user as any)?.username ?? null,
            device_id: deviceId,
            app_version: (process.env.EXPO_PUBLIC_APP_VERSION ?? null) as string | null,
        };

        const bounded = [...queue, queued].slice(-MAX_QUEUED);
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(bounded));
    } catch {
        // diagnósticos são best-effort
    }
}

/**
 * Envia todos os eventos enfileirados ao servidor e limpa a fila.
 * Chamado automaticamente após cada sync bem-sucedida.
 * Silencioso: falha no flush não impede nada.
 */
export async function flushDiagnosticQueue(): Promise<void> {
    try {
        const raw = await AsyncStorage.getItem(QUEUE_KEY);
        if (!raw) return;

        const queue: QueuedEvent[] = JSON.parse(raw);
        if (!queue?.length) return;

        await api.post('mobile/diagnostics', queue, { timeout: 10000 });
        await AsyncStorage.removeItem(QUEUE_KEY);
    } catch {
        // Se o flush falhar, mantém a fila para a próxima sync
    }
}
