import React, { useMemo } from 'react';
import { Modal, View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { CheckCircle, AlertCircle, Info, XCircle } from 'lucide-react-native';
import { Typography, Spacing, BorderRadius, ThemeColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import Button from './Button';

type ModalVariant = 'success' | 'error' | 'warning' | 'info';

interface GenericModalProps {
    visible: boolean;
    title: string;
    message: string;
    variant?: ModalVariant;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel?: () => void;
}


const getIcon = (variant: ModalVariant, colors: ThemeColors) => {
    switch (variant) {
        case 'success':
            return <CheckCircle color={colors.white} size={48} />;
        case 'error':
            return <XCircle color={colors.white} size={48} />;
        case 'warning':
            return <AlertCircle color={colors.white} size={48} />;
        case 'info':
        default:
            return <Info color={colors.white} size={48} />;
    }
};

const getColor = (variant: ModalVariant, colors: ThemeColors) => {
    switch (variant) {
        case 'success':
            return colors.success;
        case 'error':
            return colors.error;
        case 'warning':
            return colors.warning;
        case 'info':
        default:
            return colors.primary;
    }
};

export default function GenericModal({
    visible,
    title,
    message,
    variant = 'info',
    confirmText = 'OK',
    cancelText,
    onConfirm,
    onCancel
}: GenericModalProps) {
    const { colors } = useTheme();
    const { width } = useWindowDimensions();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const mainColor = getColor(variant, colors);

    return (
        <Modal
            transparent
            visible={visible}
            animationType="fade"
            onRequestClose={onCancel || onConfirm}
        >
            <View style={styles.overlay}>
                <View style={[styles.container, { shadowColor: colors.shadow }]}>
                    <View style={[styles.iconContainer, { backgroundColor: mainColor }]}>
                        {getIcon(variant, colors)}
                    </View>

                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.message}>{message}</Text>

                    <View style={styles.buttonContainer}>
                        {cancelText && onCancel && (
                            <Button
                                title={cancelText}
                                onPress={onCancel}
                                variant="secondary"
                                style={[styles.button]}
                            />
                        )}
                        <Button
                            title={confirmText}
                            onPress={onConfirm}
                            variant={variant === 'error' ? 'danger' : 'primary'}
                            style={[styles.button, { backgroundColor: mainColor, borderColor: mainColor }]}
                        />
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.xl,
    },
    container: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: colors.cardBackground,
        borderRadius: BorderRadius.xl,
        padding: Spacing.xl,
        alignItems: 'center',
        elevation: 10,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
    },
    iconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.lg,
        marginTop: 0,
    },
    title: {
        fontSize: Typography.xl,
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
        lineHeight: 24,
    },
    buttonContainer: {
        flexDirection: 'row',
        gap: Spacing.md,
        width: '100%',
    },
    button: {
        flex: 1,
    }
});
