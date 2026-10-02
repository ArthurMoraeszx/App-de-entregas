import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Animated, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, Info, AlertTriangle, CheckCircle, XCircle, RefreshCw } from 'lucide-react-native';
import { Q } from '@nozbe/watermelondb';
import { database } from '../database';
import { Typography, Spacing, BorderRadius, ThemeColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { reportError } from '../utils/syncError';
import { getPrazoVigente } from '../utils/entregaAtraso';
import type { ScreenProps } from '../../App';

type NotificationType = 'info' | 'warning' | 'success';

type Notification = {
    id: string;
    title: string;
    message: string;
    type: NotificationType;
    date: string;
    read: boolean;
};

// Gera notificações reais a partir dos dados do banco local
async function buildNotifications(): Promise<Notification[]> {
    const notifications: Notification[] = [];

    if (!database) {
        notifications.push({
            id: 'no-db',
            title: 'Banco de dados indisponível',
            message: 'O banco local ainda não foi sincronizado. Conecte-se à internet e aguarde a sincronização automática.',
            type: 'warning',
            date: new Date().toISOString(),
            read: false,
        });
        return notifications;
    }

    try {
        // 1. Entregas pendentes
        const pendentes = await database.get('entregas').query(
            Q.where('status', 'pendente'),
            Q.sortBy('dt_previsao', Q.asc),
        ).fetch() as any[];

        if (pendentes.length > 0) {
            // Verifica vencidas (prazo vigente — já considerando prorrogação/antecipação — no passado)
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            const vencidas = pendentes.filter((e: any) => {
                const prazo = getPrazoVigente(e);
                return !!prazo && prazo < hoje;
            });

            if (vencidas.length > 0) {
                notifications.push({
                    id: 'vencidas',
                    title: `${vencidas.length} entrega${vencidas.length > 1 ? 's' : ''} com prazo vencido`,
                    message: `Você tem ${vencidas.length} entrega${vencidas.length > 1 ? 's' : ''} com data de previsão já passada aguardando registro. Registre o quanto antes.`,
                    type: 'warning',
                    date: new Date().toISOString(),
                    read: false,
                });
            }

            // Entregas com previsão para hoje
            const amanha = new Date(hoje);
            amanha.setDate(amanha.getDate() + 1);
            const hoje_ = new Date(hoje);
            const paraHoje = pendentes.filter((e: any) => {
                const prazo = getPrazoVigente(e);
                return !!prazo && prazo >= hoje_ && prazo < amanha;
            });

            if (paraHoje.length > 0) {
                notifications.push({
                    id: 'hoje',
                    title: `${paraHoje.length} entrega${paraHoje.length > 1 ? 's' : ''} prevista${paraHoje.length > 1 ? 's' : ''} para hoje`,
                    message: `Você tem ${paraHoje.length} entrega${paraHoje.length > 1 ? 's' : ''} agendada${paraHoje.length > 1 ? 's' : ''} para hoje. Abra o app para localizar as guias.`,
                    type: 'info',
                    date: new Date().toISOString(),
                    read: false,
                });
            }

            if (vencidas.length === 0 && paraHoje.length === 0) {
                notifications.push({
                    id: 'pendentes-total',
                    title: `${pendentes.length} entrega${pendentes.length > 1 ? 's' : ''} pendente${pendentes.length > 1 ? 's' : ''}`,
                    message: `Você ainda tem ${pendentes.length} entrega${pendentes.length > 1 ? 's' : ''} aguardando registro no banco local.`,
                    type: 'info',
                    date: new Date().toISOString(),
                    read: true,
                });
            }
        }

        // 2. Entregas concluídas hoje
        const inicioHoje = new Date();
        inicioHoje.setHours(0, 0, 0, 0);
        const todasEntregas = await database.get('entregas').query(
            Q.where('status', 'concluida'),
            Q.sortBy('data_hora_entrega', Q.desc),
            Q.take(50),
        ).fetch() as any[];

        const totalEntregasCount = await database.get('entregas').query().fetchCount();

        const entregasHoje = todasEntregas.filter((e: any) => {
            if (!e.data_hora_entrega) return false;
            const dt = new Date(e.data_hora_entrega);
            return !isNaN(dt.getTime()) && dt >= inicioHoje;
        });

        if (entregasHoje.length > 0) {
            notifications.push({
                id: 'entregues-hoje',
                title: `${entregasHoje.length} entrega${entregasHoje.length > 1 ? 's' : ''} registrada${entregasHoje.length > 1 ? 's' : ''} hoje`,
                message: `Ótimo trabalho! Você registrou ${entregasHoje.length} entrega${entregasHoje.length > 1 ? 's' : ''} hoje.`,
                type: 'success',
                date: new Date().toISOString(),
                read: true,
            });
        }

        // 3. Total de escolas no banco
        const escolasCount = await database.get('escolas').query().fetchCount();
        if (escolasCount > 0) {
            notifications.push({
                id: 'banco-ok',
                title: 'Banco de dados sincronizado',
                message: `${escolasCount} escola${escolasCount !== 1 ? 's' : ''} e ${totalEntregasCount} guia${totalEntregasCount !== 1 ? 's' : ''} carregadas no dispositivo.`,
                type: 'success',
                date: new Date().toISOString(),
                read: true,
            });
        }

    } catch (err) {
        console.warn('[Notificações] Erro ao carregar dados:', err);
        reportError(err, 'notifications_load');
        notifications.push({
            id: 'error',
            title: 'Erro ao carregar notificações',
            message: 'Não foi possível acessar o banco local. Tente sincronizar novamente.',
            type: 'warning',
            date: new Date().toISOString(),
            read: false,
        });
    }

    return notifications;
}

// Card de notificação com animação de entrada
const NotificationCard: React.FC<{
    item: Notification;
    index: number;
    onRemove: (id: string) => void;
    colors: ThemeColors;
    styles: ReturnType<typeof getStyles>;
}> = ({ item, index, onRemove, colors, styles }) => {
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(anim, {
            toValue: 1,
            duration: 280,
            delay: index * 70,
            useNativeDriver: true,
        }).start();
    }, [anim, index]);

    const renderIcon = () => {
        switch (item.type) {
            case 'warning': return <AlertTriangle color={colors.warning} size={22} />;
            case 'success': return <CheckCircle color={colors.success} size={22} />;
            default:        return <Info color={colors.info} size={22} />;
        }
    };

    return (
        <Animated.View
            style={{
                opacity: anim,
                transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
            }}
        >
            <TouchableOpacity style={[styles.card, !item.read && styles.unreadCard]} activeOpacity={0.85}>
                <View style={styles.iconContainer}>
                    {renderIcon()}
                </View>
                <View style={styles.contentContainer}>
                    <View style={styles.headerRow}>
                        <Text style={styles.title}>{item.title}</Text>
                        <Text style={styles.date}>
                            {new Date(item.date).toLocaleDateString('pt-BR')}
                        </Text>
                    </View>
                    <Text style={styles.message} numberOfLines={3}>
                        {item.message}
                    </Text>
                </View>
                {item.read ? (
                    <TouchableOpacity
                        style={styles.closeButton}
                        onPress={() => onRemove(item.id)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <XCircle color={colors.textLight} size={20} />
                    </TouchableOpacity>
                ) : (
                    <View style={styles.dot} />
                )}
            </TouchableOpacity>
        </Animated.View>
    );
};

export default function MerendaNotificationsScreen({ navigation }: ScreenProps<'Notifications'>) {
    const { colors } = useTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        const built = await buildNotifications();
        setNotifications(built);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const removeNotification = useCallback((id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    const unreadCount = notifications.filter(n => !n.read).length;

    if (loading) {
        return (
            <SafeAreaView style={styles.container} edges={['bottom']}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingText}>Carregando notificações...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            {unreadCount > 0 && (
                <View style={styles.summaryBanner}>
                    <Bell color={colors.primary} size={16} />
                    <Text style={styles.summaryText}>
                        {unreadCount} notificaç{unreadCount === 1 ? 'ão não lida' : 'ões não lidas'}
                    </Text>
                </View>
            )}
            <FlatList
                data={notifications}
                renderItem={({ item, index }) => (
                    <NotificationCard
                        item={item}
                        index={index}
                        onRemove={removeNotification}
                        colors={colors}
                        styles={styles}
                    />
                )}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
                ListHeaderComponent={
                    <TouchableOpacity style={styles.refreshButton} onPress={load}>
                        <RefreshCw color={colors.textSecondary} size={14} />
                        <Text style={styles.refreshText}>Atualizar</Text>
                    </TouchableOpacity>
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Bell color={colors.textLight} size={64} />
                        <Text style={styles.emptyText}>Nenhuma notificação</Text>
                        <Text style={styles.emptySubtext}>Tudo em ordem por aqui!</Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.md,
    },
    loadingText: {
        fontSize: Typography.sm,
        color: colors.textSecondary,
    },
    summaryBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        backgroundColor: colors.primaryLight,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.xl,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
    },
    summaryText: {
        fontSize: Typography.sm,
        fontWeight: Typography.semibold,
        color: colors.primary,
    },
    listContent: {
        padding: Spacing.lg,
    },
    refreshButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        alignSelf: 'flex-end',
        marginBottom: Spacing.md,
        paddingVertical: Spacing.xs,
        paddingHorizontal: Spacing.sm,
        borderRadius: BorderRadius.sm,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    refreshText: {
        fontSize: Typography.xs,
        color: colors.textSecondary,
    },
    card: {
        flexDirection: 'row',
        backgroundColor: colors.cardBackground,
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        marginBottom: Spacing.md,
        alignItems: 'flex-start',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    unreadCard: {
        borderLeftWidth: 4,
        borderLeftColor: colors.primary,
        paddingLeft: Spacing.md - 4,
    },
    iconContainer: {
        marginRight: Spacing.md,
        width: 36,
        alignItems: 'center',
        paddingTop: 2,
    },
    contentContainer: {
        flex: 1,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: Spacing.xs,
        gap: Spacing.sm,
    },
    title: {
        fontSize: Typography.sm,
        fontWeight: Typography.semibold,
        color: colors.textPrimary,
        flex: 1,
    },
    date: {
        fontSize: Typography.xs,
        color: colors.textLight,
        flexShrink: 0,
    },
    message: {
        fontSize: Typography.xs,
        color: colors.textSecondary,
        lineHeight: 18,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.primary,
        marginLeft: Spacing.sm,
        marginTop: 6,
        flexShrink: 0,
    },
    closeButton: {
        padding: Spacing.xs,
        marginLeft: Spacing.sm,
        flexShrink: 0,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.xl * 2,
    },
    emptyText: {
        fontSize: Typography.md,
        fontWeight: Typography.semibold,
        color: colors.textSecondary,
        marginTop: Spacing.md,
    },
    emptySubtext: {
        fontSize: Typography.sm,
        color: colors.textLight,
        marginTop: Spacing.xs,
    },
});
