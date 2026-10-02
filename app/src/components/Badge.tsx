import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Typography, BorderRadius, Spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

type BadgeStatus = 'sincronizado' | 'pendente' | 'sincronizando' | 'erro' | 'concluida' | 'parcial' | 'warning' | 'error';

interface BadgeProps {
    label: string;
    status?: BadgeStatus;
    style?: ViewStyle;
}

interface StatusStyles {
    backgroundColor: string;
    color: string;
    borderColor: string;
}

export default function Badge({ label, status = 'pendente', style }: BadgeProps) {
    const { colors } = useTheme();

    const getStatusStyles = (): StatusStyles => {
        switch (status) {
            case 'sincronizado':
            case 'concluida':
                return {
                    backgroundColor: colors.successLight,
                    color: colors.success,
                    borderColor: colors.success,
                };
            case 'pendente':
                return {
                    backgroundColor: colors.warningLight,
                    color: colors.warning,
                    borderColor: colors.warning,
                };
            case 'sincronizando':
                return {
                    backgroundColor: colors.infoLight,
                    color: colors.info,
                    borderColor: colors.info,
                };
            case 'parcial':
                return {
                    backgroundColor: colors.warningLight,
                    color: colors.warning,
                    borderColor: colors.warning,
                };
            case 'erro':
            case 'error':
                return {
                    backgroundColor: colors.errorLight,
                    color: colors.error,
                    borderColor: colors.error,
                };
            case 'warning':
                return {
                    backgroundColor: colors.warningLight,
                    color: colors.warning,
                    borderColor: colors.warning,
                };
            default:
                return {
                    backgroundColor: colors.cardBackground,
                    color: colors.textSecondary,
                    borderColor: colors.border,
                };
        }
    };

    const statusStyles = getStatusStyles();

    return (
        <View style={[
            styles.badge,
            {
                backgroundColor: statusStyles.backgroundColor,
                borderColor: statusStyles.borderColor
            },
            style
        ]}>
            <Text style={[styles.text, { color: statusStyles.color }]} numberOfLines={1}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    badge: {
        paddingVertical: Spacing.xs,
        paddingHorizontal: Spacing.md,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        alignSelf: 'center',
        flexShrink: 1,
    },
    text: {
        fontSize: Typography.xs,
        fontWeight: Typography.semibold,
    },
});
