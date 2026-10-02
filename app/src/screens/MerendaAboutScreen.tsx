import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Typography, Spacing, BorderRadius, ThemeColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { Package, ExternalLink, MapPin, Camera, Clock } from 'lucide-react-native';

export default function MerendaAboutScreen() {
    const { colors } = useTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);

    // Fallback manual para evitar erro de import do expo-constants
    const appVersion = '1.0.0';

    const handleLink = (url: string) => {
        Linking.openURL(url);
    };

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <ScrollView contentContainerStyle={styles.scrollContent}>

                {/* Logo e Versão */}
                <View style={styles.headerSection}>
                    <View style={styles.logoContainer}>
                        <Image
                            source={require('../../assets/adaptive-icon.png')}
                            style={styles.logoImage}
                            resizeMode="contain"
                        />
                    </View>
                    <Text style={styles.appName}>Distribuição Escolar</Text>
                    <Text style={styles.appVersion}>Versão {appVersion}</Text>
                    <Text style={styles.institution}>Secretaria Municipal de Educação</Text>
                </View>

                {/* Descrição */}
                <View style={styles.section}>
                    <Text style={styles.description}>
                        O aplicativo Distribuição Escolar facilita o controle e a rastreabilidade de entregas de alimentos nas escolas da rede pública de São Paulo, em parceria entre a Secretaria Municipal de Educação e as escolas da rede.
                    </Text>
                </View>

                {/* Créditos */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Desenvolvido por</Text>
                    <Text style={styles.text}>Projeto acadêmico</Text>
                </View>

                {/* Privacidade e Dados */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Privacidade e uso de dados</Text>
                    <Text style={styles.privacyText}>
                        Este aplicativo coleta e processa os seguintes dados no exercício das atividades profissionais:
                    </Text>
                    <View style={styles.privacyItem}>
                        <MapPin size={18} color={colors.primary} style={styles.privacyIcon} />
                        <Text style={styles.privacyItemText}>
                            <Text style={styles.privacyBold}>Localização GPS</Text> — capturada no momento da confirmação de entrega, para comprovar o ponto de entrega. Dados enviados e armazenados nos servidores da Secretaria de Educação.
                        </Text>
                    </View>
                    <View style={styles.privacyItem}>
                        <Camera size={18} color={colors.primary} style={styles.privacyIcon} />
                        <Text style={styles.privacyItemText}>
                            <Text style={styles.privacyBold}>Foto da guia de entrega</Text> — documento público de comprovação. Armazenada nos servidores da Secretaria de Educação e acessível aos gestores do programa de merenda escolar.
                        </Text>
                    </View>
                    <View style={styles.privacyItem}>
                        <Clock size={18} color={colors.primary} style={styles.privacyIcon} />
                        <Text style={styles.privacyItemText}>
                            <Text style={styles.privacyBold}>Data, hora e usuário</Text> — registrados automaticamente a cada confirmação de entrega para fins de auditoria.
                        </Text>
                    </View>
                    <Text style={styles.privacyFootnote}>
                        O tratamento segue a Lei nº 13.709/2018 (LGPD), com base legal no exercício de atividade pública (Art. 7º, III) e execução de contrato (Art. 7º, V). Dados acessíveis apenas a servidores autorizados da Secretaria Municipal de Educação.
                    </Text>
                </View>

                {/* Copyright */}
                <View style={styles.footer}>
                    <Text style={styles.copyright}>© {new Date().getFullYear()} Rota Escolar</Text>
                </View>

            </ScrollView>
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
        alignItems: 'center',
    },
    headerSection: {
        alignItems: 'center',
        marginBottom: Spacing.xl * 2,
    },
    logoContainer: {
        width: 120,
        height: 120,
        borderRadius: 20,
        backgroundColor: colors.cardBackground,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.lg,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
        overflow: 'hidden',
    },
    logoImage: {
        width: '80%',
        height: '80%',
    },
    appName: {
        fontSize: Typography.xl + 4,
        fontWeight: Typography.bold,
        color: colors.textPrimary,
        marginBottom: Spacing.xs,
    },
    appVersion: {
        fontSize: Typography.sm,
        color: colors.textLight,
        marginBottom: 4,
    },
    institution: {
        fontSize: Typography.xs,
        color: colors.textLight,
        textAlign: 'center',
        opacity: 0.8,
    },
    section: {
        width: '100%',
        backgroundColor: colors.cardBackground,
        borderRadius: BorderRadius.lg,
        padding: Spacing.lg,
        marginBottom: Spacing.lg,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    sectionTitle: {
        fontSize: Typography.md,
        fontWeight: Typography.semibold,
        color: colors.textPrimary,
        marginBottom: Spacing.md,
    },
    description: {
        fontSize: Typography.sm,
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
    },
    text: {
        fontSize: Typography.sm,
        color: colors.textSecondary,
        marginBottom: 4,
    },
    linkButton: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: Spacing.sm,
    },
    linkText: {
        fontSize: Typography.sm,
        color: colors.primary,
        fontWeight: Typography.medium,
    },
    divider: {
        height: 1,
        backgroundColor: colors.borderLight,
        marginVertical: Spacing.sm,
    },
    footer: {
        marginTop: Spacing.xl,
    },
    copyright: {
        fontSize: Typography.xs,
        color: colors.textLight,
    },
    privacyText: {
        fontSize: Typography.sm,
        color: colors.textSecondary,
        marginBottom: Spacing.md,
        lineHeight: 20,
    },
    privacyItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing.sm,
        marginBottom: Spacing.md,
    },
    privacyIcon: {
        marginTop: 2,
    },
    privacyItemText: {
        flex: 1,
        fontSize: Typography.sm,
        color: colors.textSecondary,
        lineHeight: 20,
    },
    privacyBold: {
        fontWeight: Typography.semibold,
        color: colors.textPrimary,
    },
    privacyFootnote: {
        fontSize: Typography.xs,
        color: colors.textLight,
        lineHeight: 18,
        marginTop: Spacing.sm,
        fontStyle: 'italic',
    },
});
