import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, KeyboardAvoidingView, ScrollView, Platform, TouchableOpacity, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Typography, Spacing, BorderRadius, ThemeColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { authService } from '../services/auth';
import Button from '../components/Button';
import GenericModal from '../components/GenericModal';
import { Eye, EyeOff, Save } from 'lucide-react-native';
import type { ScreenProps } from '../../App';
import { classifySyncError, reportError } from '../utils/syncError';

export default function ProfileEditScreen({ navigation, route }: ScreenProps<'ProfileEdit'>) {
    const { user } = route.params;
    const { colors } = useTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);

    const [email, setEmail] = useState(user?.email || '');
    const [nome, setNome] = useState(user?.nome || '');
    const [senhaAtual, setSenhaAtual] = useState('');
    const [novaSenha, setNovaSenha] = useState('');
    const [confirmarSenha, setConfirmarSenha] = useState('');

    const [showSenhaAtual, setShowSenhaAtual] = useState(false);
    const [showNovaSenha, setShowNovaSenha] = useState(false);
    const [isChangingPassword, setIsChangingPassword] = useState(false);

    const [modalConfig, setModalConfig] = useState({
        visible: false,
        title: '',
        message: '',
        variant: 'info' as 'success' | 'error' | 'warning' | 'info',
        onConfirm: undefined as (() => void) | undefined,
    });

    const [isLoading, setIsLoading] = useState(false);

    const handleSave = async () => {
        if (!email.trim() || !nome.trim()) {
            setModalConfig({ visible: true, title: 'Campos Obrigatórios', message: 'E-mail e Nome são obrigatórios.', variant: 'warning', onConfirm: undefined });
            return;
        }
        if (!senhaAtual.trim()) {
            setModalConfig({ visible: true, title: 'Senha Obrigatória', message: 'A senha atual é obrigatória para salvar as alterações.', variant: 'warning', onConfirm: undefined });
            return;
        }
        if (novaSenha && novaSenha !== confirmarSenha) {
            setModalConfig({ visible: true, title: 'Senhas Incompatíveis', message: 'A nova senha e a confirmação não coincidem.', variant: 'warning', onConfirm: undefined });
            return;
        }

        setIsLoading(true);
        try {
            await authService.updateProfile({ email, nomeCompleto: nome, senhaAtual, novaSenha });
            setModalConfig({
                visible: true,
                title: 'Sucesso',
                message: 'Perfil atualizado com sucesso!',
                variant: 'success',
                onConfirm: () => {
                    setModalConfig(prev => ({ ...prev, visible: false }));
                    navigation.goBack();
                }
            });
        } catch (error: unknown) {
            reportError(error, 'profile_update');
            const { title, message } = classifySyncError(error);
            setModalConfig({
                visible: true,
                title,
                message,
                variant: 'error',
                onConfirm: undefined,
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 80}
                style={{ flex: 1 }}
            >
                <View style={styles.container}>

                    <ScrollView
                        style={styles.content}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Nome Completo</Text>
                            <TextInput
                                style={[styles.input, styles.inputDisabled]}
                                value={nome}
                                editable={false}
                                selectTextOnFocus={false}
                                placeholder="Seu nome"
                                placeholderTextColor={colors.textLight}
                                autoCapitalize="words"
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>E-mail</Text>
                            <TextInput
                                style={styles.input}
                                value={email}
                                onChangeText={setEmail}
                                placeholder="seu.email@exemplo.com"
                                placeholderTextColor={colors.textLight}
                                keyboardType="email-address"
                                autoCapitalize="none"
                            />
                        </View>

                        <View style={styles.divider} />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md }}>
                            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Deseja alterar a senha?</Text>
                            <Switch
                                value={isChangingPassword}
                                onValueChange={(val) => {
                                    setIsChangingPassword(val);
                                    if (!val) {
                                        setNovaSenha('');
                                        setConfirmarSenha('');
                                    }
                                }}
                                trackColor={{ false: colors.border, true: colors.primaryLight }}
                                thumbColor={isChangingPassword ? colors.primary : colors.textLight}
                            />
                        </View>

                        {isChangingPassword && (
                            <>
                                <View style={styles.inputGroup}>
                                    <Text style={styles.label}>Nova Senha</Text>
                                    <View style={styles.passwordContainer}>
                                        <TextInput
                                            style={styles.passwordInput}
                                            value={novaSenha}
                                            onChangeText={setNovaSenha}
                                            placeholder="Min. 8 caracteres"
                                            placeholderTextColor={colors.textLight}
                                            secureTextEntry={!showNovaSenha}
                                        />
                                        <TouchableOpacity onPress={() => setShowNovaSenha(!showNovaSenha)} style={styles.eyeIcon}>
                                            {showNovaSenha ? <EyeOff color={colors.textSecondary} size={20} /> : <Eye color={colors.textSecondary} size={20} />}
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={styles.inputGroup}>
                                    <Text style={styles.label}>Confirmar Nova Senha</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={confirmarSenha}
                                        onChangeText={setConfirmarSenha}
                                        placeholder="Repita a nova senha"
                                        placeholderTextColor={colors.textLight}
                                        secureTextEntry={!showNovaSenha}
                                    />
                                </View>
                            </>
                        )}

                        <View style={styles.divider} />

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Senha atual (Obrigatória)</Text>
                            <View style={styles.passwordContainer}>
                                <TextInput
                                    style={styles.passwordInput}
                                    value={senhaAtual}
                                    onChangeText={setSenhaAtual}
                                    placeholder="Sua senha atual"
                                    placeholderTextColor={colors.textLight}
                                    secureTextEntry={!showSenhaAtual}
                                />
                                <TouchableOpacity onPress={() => setShowSenhaAtual(!showSenhaAtual)} style={styles.eyeIcon}>
                                    {showSenhaAtual ? <EyeOff color={colors.textSecondary} size={20} /> : <Eye color={colors.textSecondary} size={20} />}
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.hint}>Precisamos da sua senha atual em qualquer alteração de dados para confirmar que é você.</Text>
                        </View>
                    </ScrollView>

                    <View style={styles.footer}>
                        <Button
                            title="Cancelar"
                            variant="secondary"
                            onPress={() => navigation.goBack()}
                            style={styles.button}
                            disabled={isLoading}
                        />
                        <Button
                            title="Salvar"
                            variant="primary"
                            onPress={handleSave}
                            style={styles.button}
                            loading={isLoading}
                        />
                    </View>
                </View>
            </KeyboardAvoidingView>

            <GenericModal
                visible={modalConfig.visible}
                title={modalConfig.title}
                message={modalConfig.message}
                variant={modalConfig.variant}
                confirmText="OK"
                onConfirm={() => {
                    if (modalConfig.onConfirm) {
                        modalConfig.onConfirm();
                    } else {
                        setModalConfig(prev => ({ ...prev, visible: false }));
                    }
                }}
            />
        </SafeAreaView>
    );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: colors.background,
    },
    container: {
        flex: 1,
        backgroundColor: colors.cardBackground,
        paddingBottom: Spacing.xl,
        paddingTop: Spacing.xl,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.xl,
        marginBottom: Spacing.lg,
    },
    title: {
        fontSize: Typography.xl,
        fontWeight: Typography.bold,
        color: colors.textPrimary,
    },
    closeButton: {
        padding: Spacing.xs,
    },
    content: {
        paddingHorizontal: Spacing.xl,
    },
    inputGroup: {
        marginBottom: Spacing.lg,
    },
    label: {
        fontSize: Typography.sm,
        fontWeight: Typography.medium,
        color: colors.textSecondary,
        marginBottom: Spacing.xs,
    },
    hint: {
        fontSize: Typography.xs,
        color: colors.textLight,
        marginTop: Spacing.xs,
    },
    input: {
        backgroundColor: colors.backgroundDark,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        fontSize: Typography.base,
        color: colors.textPrimary,
        borderWidth: 1,
        borderColor: colors.border,
    },
    inputDisabled: {
        opacity: 0.6,
        backgroundColor: colors.background,
        color: colors.textSecondary,
    },
    passwordContainer: {
        flexDirection: 'row',
        backgroundColor: colors.backgroundDark,
        borderRadius: BorderRadius.md,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
    },
    passwordInput: {
        flex: 1,
        padding: Spacing.md,
        fontSize: Typography.base,
        color: colors.textPrimary,
    },
    eyeIcon: {
        padding: Spacing.md,
    },
    divider: {
        height: 1,
        backgroundColor: colors.border,
        marginVertical: Spacing.md,
    },
    sectionTitle: {
        fontSize: Typography.base,
        fontWeight: Typography.bold,
        color: colors.textPrimary,
        marginBottom: Spacing.md,
    },
    footer: {
        flexDirection: 'row',
        paddingHorizontal: Spacing.xl,
        paddingTop: Spacing.lg,
        gap: Spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    button: {
        flex: 1,
    }
});
