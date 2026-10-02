import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RefreshCw, Wifi, WifiOff, Clock, Info, Zap } from 'lucide-react-native';
import NetInfo from '@react-native-community/netinfo';
import Card from '../components/Card';
import Badge from '../components/Badge';
import Button from '../components/Button';
import GenericModal from '../components/GenericModal';
import { Typography, Spacing, BorderRadius, ThemeColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { Trash2 } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { ScreenProps } from '../../App';
import { useAuth } from '../contexts/AuthContext';
import { authService } from '../services/auth';
import { clearRecentGuias } from '../utils/recentGuias';
import { syncData, getStuckGuiasCount, resetUploadRetries } from '../database/sync/syncService';
import { SafeStorage } from '../utils/safeStorage';
import { Q } from '@nozbe/watermelondb';
import { database } from '../database';
import { classifySyncError, reportError } from '../utils/syncError';
import { flushDiagnosticQueue } from '../utils/diagnostics';

export default function MerendaSyncStatusScreen({ }: ScreenProps<'SyncStatus'>) {
    const { colors } = useTheme();
    const { logout } = useAuth();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const [total, setTotal] = useState(0);
    const [pendentes, setPendentes] = useState(0);
    const [stuck, setStuck] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isOnline, setIsOnline] = useState(false);
    const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

    const loadStats = useCallback(async () => {
        if (!database) return;
        try {
            const [allRecords, pendentesRecords, stuckCount] = await Promise.all([
                database.get('entregas').query().fetchCount(),
                database.get('entregas').query(
                    Q.where('status_sincronizacao', Q.oneOf(['pendente', 'erro']))
                ).fetchCount(),
                getStuckGuiasCount(),
            ]);
            setTotal(allRecords);
            setPendentes(pendentesRecords);
            setStuck(stuckCount);
        } catch (error) {
            console.error('[SyncStatus] Erro ao carregar dados:', error);
            reportError(error, 'sync_status_load');
        } finally {
            setLoading(false);
        }
    }, []);

    // Recarrega ao montar e toda vez que o usuário volta para esta tela
    useFocusEffect(useCallback(() => {
        loadStats();
        SafeStorage.getItem('last_pulled_at').then(val => {
            if (val) {
                const d = new Date(Number(val));
                if (!isNaN(d.getTime())) {
                    setLastSyncAt(d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }));
                }
            }
        });
    }, [loadStats]));

    useEffect(() => {
        NetInfo.fetch().then(s => setIsOnline(!!s.isConnected && s.isInternetReachable !== false));
        return NetInfo.addEventListener(s => {
            setIsOnline(!!s.isConnected && s.isInternetReachable !== false);
        });
    }, []);

    const handleSincronizar = async () => {
        setLoading(true);
        try {
            await syncData();
            const val = await SafeStorage.getItem('last_pulled_at');
            if (val) {
                const d = new Date(Number(val));
                if (!isNaN(d.getTime())) {
                    setLastSyncAt(d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }));
                }
            }
            await loadStats();
        } catch (error) {
            console.error('Falha ao sincronizar:', error);
            reportError(error, 'manual_sync');
            const { title, message } = classifySyncError(error);
            setModalConfig({
                visible: true,
                title,
                message,
                variant: 'error',
                confirmText: 'OK',
                cancelText: '',
                onConfirm: () => setModalConfig(prev => ({ ...prev, visible: false })),
                onCancel: undefined,
            });
        } finally {
            // Mesmo motivo do useAutoSync/Perfil: reportar diagnósticos independente
            // do resultado do sync — este botão é usado justamente quando o motorista
            // já percebeu que algo está errado.
            flushDiagnosticQueue().catch(() => {});
            setLoading(false);
        }
    };

    const [modalConfig, setModalConfig] = useState({
        visible: false,
        title: '',
        message: '',
        variant: 'info' as 'success' | 'error' | 'warning' | 'info',
        confirmText: 'OK',
        cancelText: '',
        onConfirm: () => { },
        onCancel: undefined as (() => void) | undefined
    });

    const handleReset = async () => {
        if (!database) return;
        setModalConfig({
            visible: true,
            title: 'Limpar dados locais',
            message: 'Isso apagará TODOS os dados locais e você precisará fazer login novamente para sincronizar tudo do zero. Deseja continuar?',
            variant: 'warning',
            confirmText: 'Limpar tudo',
            cancelText: 'Cancelar',
            onConfirm: async () => {
                setModalConfig(prev => ({ ...prev, visible: false }));
                setLoading(true);
                try {
                    const db = database!;
                    await db.write(() => db.unsafeResetDatabase());
                    await SafeStorage.removeItem('last_pulled_at');
                    await resetUploadRetries();
                    await clearRecentGuias();
                    await authService.logout();
                    // Voltar para a tela de login — o banco está zerado e
                    // a primeira sync após login baixará tudo do servidor novamente.
                    logout();
                } catch (error) {
                    console.error('Erro ao limpar base:', error);
                    reportError(error, 'reset_local_data');
                    setLoading(false);
                    setTimeout(() => {
                        setModalConfig({
                            visible: true,
                            title: 'Erro',
                            message: 'Não foi possível limpar a base local.',
                            variant: 'error',
                            confirmText: 'OK',
                            cancelText: '',
                            onConfirm: () => setModalConfig(prev => ({ ...prev, visible: false })),
                            onCancel: undefined
                        });
                    }, 300);
                }
            },
            onCancel: () => setModalConfig(prev => ({ ...prev, visible: false }))
        });
    };

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Status Geral */}
                <Card style={styles.statusCard}>
                    <View style={styles.statusHeader}>
                        <RefreshCw color={colors.primary} size={48} style={styles.statusIcon} />
                        <View style={styles.statusInfo}>
                            <Text style={styles.statusTitle}>Status de sincronização</Text>
                            <Text style={styles.statusSubtitle}>
                                {pendentes} entrega(s) aguardando sincronização
                            </Text>
                        </View>
                    </View>

                    <Button
                        title="Sincronizar agora"
                        onPress={handleSincronizar}
                        Icon={Zap}
                        style={styles.syncButton}
                    />
                </Card>

                {/* Manutenção */}
                <Card style={styles.card}>
                    <View style={styles.sectionHeader}>
                        <Trash2 color={colors.error} size={20} />
                        <Text style={styles.sectionTitle}>Manutenção</Text>
                    </View>
                    <Text style={styles.maintainText}>
                        Use esta opção apenas se os dados estiverem inconsistentes ou em caso de erro grave.
                    </Text>
                    <Button
                        title="Limpar dados locais"
                        onPress={handleReset}
                        variant="secondary"
                        style={{ borderColor: colors.error }}
                        textStyle={{ color: colors.error }}
                    />
                </Card>

                {/* Fotos inacessíveis (atingiram limite de tentativas) */}
                {stuck > 0 && (
                    <Card style={[styles.card, { borderColor: colors.warning, borderWidth: 1 }]}>
                        <View style={styles.sectionHeader}>
                            <Info color={colors.warning} size={20} />
                            <Text style={[styles.sectionTitle, { color: colors.warning }]}>
                                {stuck} foto(s) inacessível(is)
                            </Text>
                        </View>
                        <Text style={styles.maintainText}>
                            {stuck === 1
                                ? '1 guia atingiu o limite de tentativas de upload de foto. A foto pode estar inacessível no dispositivo.'
                                : `${stuck} guias atingiram o limite de tentativas de upload de foto.`}
                            {'\n\n'}Toque em "Tentar novamente" para que o sistema tente enviar as fotos na próxima sincronização.
                        </Text>
                        <Button
                            title="Tentar novamente"
                            onPress={async () => {
                                await resetUploadRetries();
                                await loadStats();
                            }}
                            variant="secondary"
                            style={{ borderColor: colors.warning }}
                            textStyle={{ color: colors.warning }}
                        />
                    </Card>
                )}

                {/* Informações de Conexão */}
                <Card style={styles.card}>
                    <View style={styles.sectionHeader}>
                        {isOnline
                            ? <Wifi color={colors.primary} size={20} />
                            : <WifiOff color={colors.error} size={20} />
                        }
                        <Text style={styles.sectionTitle}>Conexão</Text>
                    </View>

                    <View style={styles.connectionRow}>
                        <Text style={styles.connectionLabel}>Status:</Text>
                        <Badge
                            label={isOnline ? 'Online' : 'Sem conexão'}
                            status={isOnline ? 'sincronizado' : 'error'}
                        />
                    </View>

                    <View style={styles.connectionRow}>
                        <Text style={styles.connectionLabel}>Última sincronização:</Text>
                        <View style={styles.lastSync}>
                            <Clock color={colors.textSecondary} size={14} />
                            <Text style={styles.connectionValue}>
                                {lastSyncAt ?? 'Nunca sincronizado'}
                            </Text>
                        </View>
                    </View>
                </Card>

                {/* Entregas Pendentes */}
                <Card style={styles.card}>
                    <View style={styles.sectionHeader}>
                        <Clock color={colors.warning} size={20} />
                        <Text style={styles.sectionTitle}>Aguardando sincronização</Text>
                    </View>

                    {pendentes === 0 ? (
                        <Text style={styles.emptyText}>Nenhuma entrega pendente</Text>
                    ) : (
                        <Text style={styles.emptyText}>{pendentes} entrega(s) aguardando — abra a tela principal para visualizá-las.</Text>
                    )}
                </Card>

                {/* Informações */}
                <Card style={[styles.card, styles.infoCard]}>
                    <View style={styles.sectionHeader}>
                        <Info color={colors.info} size={20} />
                        <Text style={styles.infoTitle}>Como funciona</Text>
                    </View>
                    <Text style={styles.infoText}>
                        • As entregas são salvas localmente no seu celular{'\n'}
                        • Quando houver internet, elas são enviadas automaticamente{'\n'}
                        • Você pode forçar a sincronização a qualquer momento{'\n'}
                        • Entregas com erro precisam ser reenviadas manualmente
                    </Text>
                </Card>
            </ScrollView>

            <GenericModal
                visible={modalConfig.visible}
                title={modalConfig.title}
                message={modalConfig.message}
                variant={modalConfig.variant}
                confirmText={modalConfig.confirmText}
                cancelText={modalConfig.cancelText || undefined}
                onConfirm={modalConfig.onConfirm}
                onCancel={modalConfig.onCancel}
            />
        </SafeAreaView>
    );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    scrollContent: {
        padding: Spacing.xl,
    },
    statusCard: {
        marginBottom: Spacing.lg,
    },
    statusHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    statusIcon: {
        marginRight: Spacing.md,
    },
    statusInfo: {
        flex: 1,
    },
    statusTitle: {
        fontSize: Typography.lg,
        fontWeight: Typography.semibold,
        color: colors.textPrimary,
        marginBottom: Spacing.xs,
    },
    statusSubtitle: {
        fontSize: Typography.sm,
        color: colors.textSecondary,
    },
    syncButton: {
        marginTop: Spacing.md,
    },
    card: {
        marginBottom: Spacing.lg,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginBottom: Spacing.md,
    },
    sectionTitle: {
        fontSize: Typography.md,
        fontWeight: Typography.semibold,
        color: colors.textPrimary,
    },
    connectionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    connectionLabel: {
        fontSize: Typography.sm,
        color: colors.textSecondary,
    },
    connectionValue: {
        fontSize: Typography.sm,
        fontWeight: Typography.medium,
        color: colors.textPrimary,
    },
    lastSync: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    entregaItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: Spacing.md,
        backgroundColor: colors.backgroundDark,
        borderRadius: BorderRadius.md,
        marginBottom: Spacing.sm,
    },
    entregaInfo: {
        flex: 1,
        marginRight: Spacing.md,
    },
    entregaEscola: {
        fontSize: Typography.sm,
        fontWeight: Typography.medium,
        color: colors.textPrimary,
        marginBottom: 2,
    },
    entregaGuia: {
        fontSize: Typography.xs,
        color: colors.textSecondary,
    },
    infoCard: {
        backgroundColor: colors.infoLight,
        borderWidth: 0,
    },
    infoTitle: {
        fontSize: Typography.sm,
        fontWeight: Typography.semibold,
        color: colors.info,
    },
    infoText: {
        fontSize: Typography.xs,
        color: colors.info,
        lineHeight: 18,
        marginTop: Spacing.xs,
    },
    emptyText: {
        textAlign: 'center',
        padding: Spacing.md,
        color: colors.textLight,
        fontSize: Typography.sm,
    },
    maintainText: {
        fontSize: Typography.xs,
        color: colors.textSecondary,
        marginBottom: Spacing.md,
    }
});
