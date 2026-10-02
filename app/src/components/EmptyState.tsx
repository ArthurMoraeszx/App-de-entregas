import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Spacing, Typography, BorderRadius } from '../constants/theme';

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    message: string;
    actionLabel?: string;
    onAction?: () => void;
    style?: ViewStyle;
}

export default function EmptyState({
    icon: Icon,
    title,
    message,
    actionLabel,
    onAction,
    style,
}: EmptyStateProps) {
    const { colors } = useTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);

    return (
        <View style={[styles.container, style]}>
            <View style={styles.iconContainer}>
                <Icon size={48} color={colors.primary} />
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>

            {actionLabel && onAction && (
                <TouchableOpacity style={styles.button} onPress={onAction}>
                    <Text style={styles.buttonText}>{actionLabel}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

const getStyles = (colors: any) => StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.xl,
        marginTop: Spacing.xl,
    },
    iconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: colors.cardBackground,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.lg,
    },
    title: {
        fontSize: Typography.lg,
        fontWeight: Typography.bold,
        color: colors.textPrimary,
        marginBottom: Spacing.sm,
        textAlign: 'center',
    },
    message: {
        fontSize: Typography.base,
        color: colors.textSecondary,
        textAlign: 'center',
        marginBottom: Spacing.xl,
        maxWidth: 300,
    },
    button: {
        backgroundColor: colors.primary,
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.md,
    },
    buttonText: {
        color: colors.white,
        fontWeight: Typography.bold,
        fontSize: Typography.base,
    },
});
