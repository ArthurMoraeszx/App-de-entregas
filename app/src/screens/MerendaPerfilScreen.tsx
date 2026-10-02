import React, { useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    ClipboardList,
    Settings,
    RefreshCw,
    Info,
    LogOut,
    ChevronRight,
    Moon,
    Sun
} from 'lucide-react-native';
import Card from '../components/Card';
import Button from '../components/Button';
import GenericModal from '../components/GenericModal';
import { Typography, Spacing, BorderRadius, ThemeColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import type { ScreenProps } from '../../App';
import { useAuth } from '../contexts/AuthContext';
import { authService } from '../services/auth';
import { database } from '../database';
import { Q } from '@nozbe/watermelondb';
import { useFocusEffect } from '@react-navigation/native';
import { clearRecentGuias } from '../utils/recentGuias';
import { SafeStorage } from '../utils/safeStorage';
import { resetUploadRetries, getStuckGuiasCount, syncData } from '../database/sync/syncService';
import { classifySyncError, reportError } from '../utils/syncError';
import { flushDiagnosticQueue } from '../utils/diagnostics';
import { Upload } from 'lucide-react-native';

export default function MerendaPerfilScreen({ navigation }: ScreenProps<'Perfil'>) {
    const { logout } = useAuth();
    const { colors, theme, toggleTheme } = useTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);

    // DORMANT: const [stats, setStats] = React.useState({ today: 0, done: 0, pending: 0 });

    const [user, setUser] = React.useState<any>(null);
    const [pendingPhotos, setPendingPhotos] = React.useState(0);
    const [isForcingSend, setIsForcingSend] = React.useState(false);

    useFocusEffect(
        React.useCallback(() => {
            const loadUser = async () => {
                const userData = await authService.getUser();
                setUser(userData);
            };
            loadUser();
        }, [])
    );

    useFocusEffect(
        React.useCallback(() => {
            getStuckGuiasCount().then(setPendingPhotos).catch(() => {});
        }, [])
    );

    const handleForceResend = React.useCallback(async () => {
        setIsForcingSend(true);
        try {
            await resetUploadRetries();
            await syncData();
            const remaining = await getStuckGuiasCount();
            setPendingPhotos(remaining);
            setModalConfig({
                visible: true,
                title: remaining === 0 ? 'Fotos enviadas' : 'Reenvio iniciado',
                message: remaining === 0
                    ? 'Todas as fotos pendentes foram enviadas com sucesso.'
                    : `${remaining} guia(s) ainda com fotos pendentes. Conecte-se ao WiFi e tente novamente.`,
                variant: remaining === 0 ? 'success' : 'warning',
                confirmText: 'OK',
                cancelText: '',
                onConfirm: () => setModalConfig(m => ({ ...m, visible: false })),
                onCancel: undefined,
            });
        } catch (error) {
            reportError(error, 'force_resend');
            const { title, message, isAuthError } = classifySyncError(error);
            setModalConfig({
                visible: true,
                title,
                message: isAuthError
                    ? message + '\n\nSeus dados de entrega estão salvos no celular e não serão perdidos.'
                    : message,
                variant: 'error',
                confirmText: isAuthError ? 'Ir para login' : 'OK',
                cancelText: isAuthError ? 'Agora não' : '',
                onConfirm: isAuthError
                    ? () => { setModalConfig(m => ({ ...m, visible: false })); handleLogout(); }
                    : () => setModalConfig(m => ({ ...m, visible: false })),
                onCancel: isAuthError
                    ? () => setModalConfig(m => ({ ...m, visible: false }))
                    : undefined,
            });
        } finally {
            // Mesmo motivo do useAutoSync: tenta reportar diagnósticos acumulados
            // independente do reenvio ter dado certo ou não — esse é justamente o
            // botão que o motorista aperta quando as coisas não estão indo bem.
            flushDiagnosticQueue().catch(() => {});
            setIsForcingSend(false);
        }
    }, []);

    /* DORMANT: statistics queries — restore Q import + stats state above to re-enable
    const loadStats = React.useCallback(async () => {
        if (!database) return;
        try {
            const entregasCollection = database.get('entregas');
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date();
            endOfDay.setHours(23, 59, 59, 999);
            const [todayCount, doneCount, pendingCount] = await Promise.all([
                entregasCollection.query(Q.or(Q.where('created_at', Q.between(startOfDay.getTime(), endOfDay.getTime())), Q.where('data_hora_entrega', Q.between(startOfDay.getTime(), endOfDay.getTime())))).fetchCount(),
                entregasCollection.query(Q.where('status', 'concluida')).fetchCount(),
                entregasCollection.query(Q.or(Q.where('status', 'pendente'), Q.where('status_sincronizacao', Q.oneOf(['pendente', 'erro'])))).fetchCount()
            ]);
            setStats({ today: todayCount, done: doneCount, pending: pendingCount });
        } catch (error) {
            console.error('Erro ao carregar estatísticas do perfil:', error);
        }
    }, []);
    useFocusEffect(React.useCallback(() => { loadStats(); }, [loadStats]));
    */

    const [modalConfig, setModalConfig] = React.useState({
        visible: false,
        title: '',
        message: '',
        variant: 'info' as 'success' | 'error' | 'warning' | 'info',
        confirmText: 'OK',
        cancelText: '',
        onConfirm: () => { },
        onCancel: undefined as (() => void) | undefined
    });

    const handleResetDatabase = () => {
        setModalConfig({
            visible: true,
            title: 'AVISO CRÍTICO',
            message: 'Isso apagará todos os dados locais e forçará uma nova sincronização do zero. Use apenas se estiver com problemas de dados.\n\nO app será fechado após a limpeza.',
            variant: 'error',
            confirmText: 'Zerar Agora',
            cancelText: 'Cancelar',
            onConfirm: async () => {
                setModalConfig(prev => ({ ...prev, visible: false }));
                try {
                    const db = database;
                    if (db) {
                        await db.write(() => db.unsafeResetDatabase());
                        await clearRecentGuias();
                        await SafeStorage.removeItem('last_pulled_at');
                        await resetUploadRetries();
                        await authService.logout();
                        logout(); // Volta para tela de login — banco zerado + nova sync completa
                    }
                } catch (e) {
                    console.error('Erro ao zerar banco:', e);
                }
            },
            onCancel: () => setModalConfig(prev => ({ ...prev, visible: false }))
        });
    };

    const performLogout = async () => {
        try {
            if (database) {
                await database.write(() => database!.unsafeResetDatabase());
            }
        } catch (e) {
            console.error('Erro ao limpar DB no logout:', e);
        }
        await SafeStorage.removeItem('last_pulled_at');
        await resetUploadRetries();
        await clearRecentGuias();
        await authService.logout();
        logout();
    };

    const handleLogout = () => {
        setModalConfig({
            visible: true,
            title: 'Sair do Sistema',
            message: 'Tem certeza que deseja sair?',
            variant: 'warning',
            confirmText: 'Sair',
            cancelText: 'Cancelar',
            onConfirm: async () => {
                setModalConfig(prev => ({ ...prev, visible: false }));

                let pendingCount = 0;
                if (database) {
                    try {
                        pendingCount = await database.get('entregas')
                            .query(Q.where('_status', Q.oneOf(['created', 'updated'])))
                            .fetchCount();
                    } catch (e) { /* ignora erro de contagem */ }
                }

                if (pendingCount > 0) {
                    setModalConfig({
                        visible: true,
                        title: 'Entregas não enviadas',
                        message: `Você tem ${pendingCount} entrega(s) registrada(s) no celular que ainda não foram enviadas ao servidor.\n\nSincronize antes de sair para não perder os dados.`,
                        variant: 'warning',
                        confirmText: 'Sair mesmo assim',
                        cancelText: 'Cancelar',
                        onConfirm: async () => {
                            setModalConfig(prev => ({ ...prev, visible: false }));
                            await performLogout();
                        },
                        onCancel: () => setModalConfig(prev => ({ ...prev, visible: false }))
                    });
                } else {
                    await performLogout();
                }
            },
            onCancel: () => setModalConfig(prev => ({ ...prev, visible: false }))
        });
    };

    // Tradução do nível para exibição
    const nivelTraduzido = user?.nivel ? (
        {
            admin: 'Administrador',
            manager: 'Gestor',
            user: 'Usuário',
            viewer: 'Visualizador',
            supplier: 'Fornecedor/Distribuidor',
            driver: 'Motorista'
        }[user.nivel as string] || user.nivel
    ) : null;

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Header do Perfil */}
                <View style={styles.header}>
                    <View style={styles.avatarContainer}>
                        <Text style={styles.avatarText}>
                            {user?.nome
                                ? user.nome.trim().split(/\s+/).slice(0, 2).map((n: string) => n[0].toUpperCase()).join('')
                                : 'U'}
                        </Text>
                    </View>
                    <Text style={styles.nome}>{user?.nome || 'Usuário'}</Text>
                    <Text style={styles.cargo}>{nivelTraduzido || 'Colaborador'}</Text>

                    <Button
                        title="Editar Perfil"
                        variant="secondary"
                        onPress={() => navigation.navigate('ProfileEdit', { user })}
                        style={styles.editProfileButton}
                    />
                </View>

                {/* Informações do Motorista */}
                <Card style={styles.card}>
                    <View style={styles.sectionHeader}>
                        <ClipboardList color={colors.primary} size={20} />
                        <Text style={styles.sectionTitle}>Informações</Text>
                    </View>

                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Usuário:</Text>
                        <Text style={styles.infoValue}>{user?.username || '-'}</Text>
                    </View>

                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Email:</Text>
                        <Text style={styles.infoValue}>{user?.email || '-'}</Text>
                    </View>
                </Card>

                {/* DORMANT: statistics card — restore BarChart3 import + stats state + loadStats to re-enable
                <Card style={styles.card}>
                    <View style={styles.sectionHeader}>
                        <BarChart3 color={colors.primary} size={20} />
                        <Text style={styles.sectionTitle}>Estatísticas</Text>
                    </View>
                    <View style={styles.statsContainer}>
                        <View style={styles.statItem}>
                            <Text style={styles.statNumber}>{String(stats?.today || 0)}</Text>
                            <Text style={styles.statLabel}>Hoje</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <Text style={[styles.statNumber, { color: colors.success }]}>{String(stats?.done || 0)}</Text>
                            <Text style={styles.statLabel}>Concluídas</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <Text style={[styles.statNumber, { color: colors.warning }]}>{String(stats?.pending || 0)}</Text>
                            <Text style={styles.statLabel}>Pendentes</Text>
                        </View>
                    </View>
                </Card>
                */}

                {/* Opções */}
                <Card style={styles.card}>
                    <View style={styles.sectionHeader}>
                        <Settings color={colors.primary} size={20} />
                        <Text style={styles.sectionTitle}>Opções</Text>
                    </View>

                    {/* Toggle Tema */}
                    <View style={styles.optionRow}>
                        <View style={styles.optionLeft}>
                            {theme === 'dark' ? (
                                <Moon color={colors.textPrimary} size={20} style={styles.optionIcon} />
                            ) : (
                                <Sun color={colors.textPrimary} size={20} style={styles.optionIcon} />
                            )}
                            <Text style={styles.optionText}>Modo Escuro</Text>
                        </View>
                        <Switch
                            value={theme === 'dark'}
                            onValueChange={toggleTheme}
                            trackColor={{ false: colors.border, true: colors.primaryLight }}
                            thumbColor={theme === 'dark' ? colors.primary : colors.textLight}
                        />
                    </View>

                    <TouchableOpacity
                        style={[
                            styles.optionButton,
                            isForcingSend && { opacity: 0.6 },
                        ]}
                        onPress={handleForceResend}
                        disabled={isForcingSend}
                    >
                        <Upload color={pendingPhotos > 0 ? colors.warning : colors.textPrimary} size={20} style={styles.optionIcon} />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.optionText, pendingPhotos > 0 && { color: colors.warning }]}>
                                {isForcingSend ? 'Reenviando fotos…' : 'Forçar reenvio de fotos'}
                            </Text>
                            {pendingPhotos > 0 && (
                                <Text style={{ fontSize: 12, color: colors.warning, marginTop: 2 }}>
                                    {pendingPhotos} guia{pendingPhotos !== 1 ? 's' : ''} com foto pendente
                                </Text>
                            )}
                        </View>
                        {!isForcingSend && <ChevronRight color={colors.textLight} size={20} />}
                    </TouchableOpacity>

                    {/* DORMANT: Notifications navigation
                    <TouchableOpacity
                        style={styles.optionButton}
                        onPress={() => navigation.navigate('Notifications')}
                    >
                        <Bell color={colors.textPrimary} size={20} style={styles.optionIcon} />
                        <Text style={styles.optionText}>Notificações</Text>
                        <ChevronRight color={colors.textLight} size={20} />
                    </TouchableOpacity>
                    */}

                    <TouchableOpacity
                        style={styles.optionButton}
                        onPress={() => navigation.navigate('About')}
                    >
                        <Info color={colors.textPrimary} size={20} style={styles.optionIcon} />
                        <Text style={styles.optionText}>Sobre o app</Text>
                        <ChevronRight color={colors.textLight} size={20} />
                    </TouchableOpacity>

                    {__DEV__ && (
                        <TouchableOpacity
                            style={[styles.optionButton, { marginTop: Spacing.xl, borderTopWidth: 1, borderTopColor: colors.borderLight }]}
                            onPress={handleResetDatabase}
                        >
                            <RefreshCw color={colors.error} size={20} style={styles.optionIcon} />
                            <Text style={[styles.optionText, { color: colors.error }]}>Zerar banco de dados (debug)</Text>
                        </TouchableOpacity>
                    )}
                </Card>

                {/* Botão de Logout */}
                <Button
                    title="Sair do sistema"
                    variant="danger"
                    onPress={handleLogout}
                    Icon={LogOut}
                    style={styles.logoutButton}
                />

                {/* Versão */}
                <Text style={styles.version}>
                    Distribuição Escolar{'\n'}
                    © {new Date().getFullYear()} Secretaria de Educação
                </Text>
            </ScrollView>

            <GenericModal
                visible={modalConfig.visible}
                title={modalConfig.title}
                message={modalConfig.message}
                variant={modalConfig.variant}
                confirmText={modalConfig.confirmText}
                cancelText={modalConfig.cancelText}
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
    header: {
        alignItems: 'center',
        marginBottom: Spacing.xl,
    },
    avatarContainer: {
        width: 100,
        height: 100,
        borderRadius: BorderRadius.full,
        backgroundColor: colors.warning,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.md,
    },
    avatarText: {
        fontSize: 36,
        fontWeight: Typography.bold,
        color: colors.white,
        letterSpacing: 2,
    },
    nome: {
        fontSize: Typography.xl,
        fontWeight: Typography.bold,
        color: colors.textPrimary,
        marginBottom: Spacing.xs,
    },
    cargo: {
        fontSize: Typography.sm,
        color: colors.textSecondary,
    },
    editProfileButton: {
        marginTop: Spacing.md,
        paddingHorizontal: Spacing.xl,
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
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: Spacing.md,
    },
    infoLabel: {
        fontSize: Typography.sm,
        color: colors.textSecondary,
    },
    infoValue: {
        fontSize: Typography.sm,
        fontWeight: Typography.medium,
        color: colors.textPrimary,
    },
    statsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statNumber: {
        fontSize: Typography.xxl,
        fontWeight: Typography.bold,
        color: colors.primary,
    },
    statLabel: {
        fontSize: Typography.xs,
        color: colors.textSecondary,
        marginTop: Spacing.xs,
        textAlign: 'center',
    },
    statDivider: {
        width: 1,
        height: 40,
        backgroundColor: colors.border,
    },
    optionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        backgroundColor: colors.backgroundDark,
        marginBottom: Spacing.sm,
    },
    optionLeft: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    optionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        backgroundColor: colors.backgroundDark,
        marginBottom: Spacing.sm,
    },
    optionIcon: {
        marginRight: Spacing.md,
    },
    optionText: {
        flex: 1,
        fontSize: Typography.base,
        color: colors.textPrimary,
    },
    logoutButton: {
        marginTop: Spacing.lg,
    },
    version: {
        fontSize: Typography.xs,
        color: colors.textLight,
        textAlign: 'center',
        marginTop: Spacing.xl,
        lineHeight: 18,
    },
});
