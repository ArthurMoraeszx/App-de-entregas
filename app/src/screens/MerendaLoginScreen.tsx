import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Image,
    Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Lock } from 'lucide-react-native';
import Constants from 'expo-constants';
import Button from '../components/Button';
import GenericModal from '../components/GenericModal';
import { Typography, Spacing, BorderRadius, ThemeColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { authService } from '../services/auth';
import { classifyLoginError, reportError } from '../utils/syncError';

interface LoginScreenProps {
    onLoginSuccess: () => void;
}

export default function MerendaLoginScreen({ onLoginSuccess }: LoginScreenProps) {
    const { colors } = useTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [modal, setModal] = useState<{ visible: boolean; title: string; message: string; variant: 'warning' | 'error' }>({
        visible: false, title: '', message: '', variant: 'warning'
    });

    // Animações de entrada
    const logoAnim = useRef(new Animated.Value(0)).current;
    const formAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.sequence([
            Animated.timing(logoAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.timing(formAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        ]).start();
    }, [logoAnim, formAnim]);

    const handleLogin = async () => {
        if (!username || !password) {
            setModal({ visible: true, title: 'Atenção', message: 'Por favor, preencha usuário e senha', variant: 'warning' });
            return;
        }

        setLoading(true);

        try {
            await authService.login(username, password);
            onLoginSuccess();
        } catch (error: unknown) {
            reportError(error, 'login', { username });
            const { title, message } = classifyLoginError(error);
            setModal({ visible: true, title, message, variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>

                    {/* Logo e Cabeçalho */}
                    <Animated.View
                        style={[
                            styles.header,
                            {
                                opacity: logoAnim,
                                transform: [{ translateY: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }],
                            },
                        ]}
                    >
                        <View style={styles.logoContainer}>
                            <Image
                                source={require('../../assets/adaptive-icon.png')}
                                style={styles.logoImage}
                                resizeMode="contain"
                            />
                        </View>
                        <Text style={styles.title}>Distribuição Escolar</Text>
                        <Text style={styles.subtitle}>Aplicativo do Motorista</Text>
                        <Text style={styles.institution}>Secretaria Municipal de Educação</Text>
                    </Animated.View>

                    {/* Formulário */}
                    <Animated.View
                        style={[
                            styles.form,
                            {
                                opacity: formAnim,
                                transform: [{ translateY: formAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
                            },
                        ]}
                    >
                        <View style={styles.inputContainer}>
                            <Text style={styles.label}>Usuário</Text>
                            <View style={styles.inputWrapper}>
                                <User color={colors.textLight} size={20} style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Digite seu usuário"
                                    placeholderTextColor={colors.textLight}
                                    value={username}
                                    onChangeText={setUsername}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                            </View>
                        </View>

                        <View style={styles.inputContainer}>
                            <Text style={styles.label}>Senha</Text>
                            <View style={styles.inputWrapper}>
                                <Lock color={colors.textLight} size={20} style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Digite sua senha"
                                    placeholderTextColor={colors.textLight}
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry
                                />
                            </View>
                        </View>

                        <Button
                            title="Entrar no Sistema"
                            onPress={handleLogin}
                            loading={loading}
                            style={styles.button}
                        />

                        <Text style={[styles.footerText, { marginTop: 10, opacity: 0.5 }]}>
                            Versão {Constants.expoConfig?.version ?? '—'}
                        </Text>
                    </Animated.View>

                </ScrollView>
            </KeyboardAvoidingView>

            <GenericModal
                visible={modal.visible}
                title={modal.title}
                message={modal.message}
                variant={modal.variant}
                onConfirm={() => setModal(prev => ({ ...prev, visible: false }))}
            />
        </SafeAreaView>
    );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: Spacing.xl,
    },
    header: {
        alignItems: 'center',
        marginBottom: Spacing.xxxl,
    },
    logoContainer: {
        width: 120,
        height: 120,
        backgroundColor: colors.cardBackground,
        borderRadius: BorderRadius.full,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.lg,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        overflow: 'hidden',
    },
    logoImage: {
        width: '80%',
        height: '80%',
    },
    title: {
        fontSize: Typography.xxl,
        fontWeight: Typography.bold,
        color: colors.primary,
        marginBottom: Spacing.xs,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: Typography.md,
        color: colors.textSecondary,
        marginBottom: Spacing.xs,
    },
    institution: {
        fontSize: Typography.xs,
        color: colors.textLight,
        textAlign: 'center',
        marginTop: 4,
    },
    form: {
        width: '100%',
    },
    inputContainer: {
        marginBottom: Spacing.lg,
    },
    label: {
        fontSize: Typography.sm,
        fontWeight: Typography.semibold,
        color: colors.textSecondary,
        marginBottom: Spacing.xs,
        marginLeft: Spacing.xs,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.cardBackground,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: Spacing.md,
        height: 56,
    },
    inputIcon: {
        marginRight: Spacing.md,
    },
    input: {
        flex: 1,
        fontSize: Typography.base,
        color: colors.textPrimary,
    },
    button: {
        marginTop: Spacing.md,
        marginBottom: Spacing.xl,
    },
    footerText: {
        textAlign: 'center',
        fontSize: Typography.sm,
        color: colors.textLight,
    },
});
