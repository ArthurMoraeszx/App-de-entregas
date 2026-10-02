import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    AppState,
    AppStateStatus,
    Linking,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { MapPin, ShieldCheck, Truck } from 'lucide-react-native';
import Button from './Button';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { Typography, Spacing, BorderRadius } from '../constants/theme';
import type { ThemeColors } from '../constants/theme';

interface Props {
    children: React.ReactNode;
}

export default function LocationPermissionGate({ children }: Props) {
    const { colors } = useTheme();
    const { logout } = useAuth();
    const styles = useMemo(() => getStyles(colors), [colors]);

    const [granted, setGranted] = useState<boolean | null>(null); // null = ainda verificando
    const [canAskAgain, setCanAskAgain] = useState(true);
    const [requesting, setRequesting] = useState(false);
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);

    const checkPermission = async () => {
        const perm = await Location.getForegroundPermissionsAsync();
        setGranted(perm.status === 'granted');
        setCanAskAgain(perm.canAskAgain);
    };

    const handleRequest = async () => {
        setRequesting(true);
        try {
            const perm = await Location.requestForegroundPermissionsAsync();
            setGranted(perm.status === 'granted');
            setCanAskAgain(perm.canAskAgain);
        } finally {
            setRequesting(false);
        }
    };

    useEffect(() => {
        checkPermission();

        // Quando o motorista volta das Configurações do sistema, re-verifica.
        const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
            if (appStateRef.current.match(/inactive|background/) && next === 'active') {
                checkPermission();
            }
            appStateRef.current = next;
        });

        return () => sub.remove();
    }, []);

    // Carregando status inicial
    if (granted === null) {
        return (
            <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
                <ActivityIndicator color={colors.primary} size="large" />
            </View>
        );
    }

    // Permissão concedida — renderiza o app normalmente
    if (granted) {
        return <>{children}</>;
    }

    // Permissão negada — tela bloqueante
    const userDeniedPermanently = !canAskAgain;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>

            {/* Área visual superior */}
            <View style={styles.heroArea}>
                <View style={[styles.iconRing, { borderColor: colors.primary + '30' }]}>
                    <View style={[styles.iconCircle, { backgroundColor: colors.primary }]}>
                        <MapPin color={colors.white} size={48} />
                    </View>
                </View>
            </View>

            {/* Conteúdo principal */}
            <View style={styles.content}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                    Localização Necessária
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                    Para registrar suas entregas e comprovar o local para a Secretaria de Educação, o aplicativo precisa acessar sua localização GPS.
                </Text>

                {/* Cards explicativos */}
                <View style={[styles.reasonCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                    <View style={[styles.reasonIcon, { backgroundColor: colors.primary + '15' }]}>
                        <Truck color={colors.primary} size={20} />
                    </View>
                    <View style={styles.reasonText}>
                        <Text style={[styles.reasonTitle, { color: colors.textPrimary }]}>Comprovação de entrega</Text>
                        <Text style={[styles.reasonDesc, { color: colors.textSecondary }]}>
                            As coordenadas são registradas no momento da entrega para validação pela Secretaria de Educação.
                        </Text>
                    </View>
                </View>

                <View style={[styles.reasonCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                    <View style={[styles.reasonIcon, { backgroundColor: colors.success + '15' }]}>
                        <ShieldCheck color={colors.success} size={20} />
                    </View>
                    <View style={styles.reasonText}>
                        <Text style={[styles.reasonTitle, { color: colors.textPrimary }]}>Uso restrito e seguro</Text>
                        <Text style={[styles.reasonDesc, { color: colors.textSecondary }]}>
                            A localização é capturada apenas no momento em que você confirma uma entrega.
                        </Text>
                    </View>
                </View>

                {/* Mensagem extra para quem negou permanentemente */}
                {userDeniedPermanently && (
                    <View style={[styles.settingsHint, { backgroundColor: colors.warningLight, borderColor: colors.warning + '50' }]}>
                        <Text style={[styles.settingsHintText, { color: colors.warning }]}>
                            Você negou o acesso anteriormente. Abra as Configurações do sistema e ative a localização para este aplicativo.
                        </Text>
                    </View>
                )}
            </View>

            {/* Botões de ação */}
            <View style={styles.actions}>
                <Button
                    title={userDeniedPermanently ? 'Abrir Configurações' : 'Ativar Localização'}
                    variant="primary"
                    size="lg"
                    loading={requesting}
                    onPress={userDeniedPermanently ? () => Linking.openSettings() : handleRequest}
                    style={styles.mainButton}
                />
                <Button
                    title="Sair"
                    variant="secondary"
                    size="md"
                    onPress={logout}
                    style={styles.logoutButton}
                />
                <Text style={[styles.footerNote, { color: colors.textLight }]}>
                    Você pode alterar essa preferência a qualquer momento nas Configurações do sistema.
                </Text>
            </View>

        </SafeAreaView>
    );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        flex: 1,
    },
    heroArea: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: Spacing.xxl,
    },
    iconRing: {
        width: 160,
        height: 160,
        borderRadius: 80,
        borderWidth: 2,
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconCircle: {
        width: 120,
        height: 120,
        borderRadius: 60,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        flex: 2,
        paddingHorizontal: Spacing.xl,
        paddingTop: Spacing.xl,
        gap: Spacing.md,
    },
    title: {
        fontSize: Typography.xxl,
        fontWeight: Typography.bold,
        textAlign: 'center',
        marginBottom: Spacing.xs,
    },
    subtitle: {
        fontSize: Typography.base,
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: Spacing.md,
    },
    reasonCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing.md,
        padding: Spacing.md,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
    },
    reasonIcon: {
        width: 40,
        height: 40,
        borderRadius: BorderRadius.md,
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
    },
    reasonText: {
        flex: 1,
        gap: Spacing.xs,
    },
    reasonTitle: {
        fontSize: Typography.sm,
        fontWeight: Typography.semibold,
    },
    reasonDesc: {
        fontSize: Typography.xs,
        lineHeight: 18,
    },
    settingsHint: {
        padding: Spacing.md,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        marginTop: Spacing.xs,
    },
    settingsHintText: {
        fontSize: Typography.sm,
        lineHeight: 20,
        textAlign: 'center',
        fontWeight: Typography.medium,
    },
    actions: {
        padding: Spacing.xl,
        gap: Spacing.md,
        alignItems: 'center',
    },
    mainButton: {
        width: '100%',
    },
    logoutButton: {
        width: '100%',
    },
    footerNote: {
        fontSize: Typography.xs,
        textAlign: 'center',
        lineHeight: 18,
        marginTop: Spacing.xs,
    },
});
