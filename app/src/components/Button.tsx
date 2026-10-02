import React from 'react';
import {
    Text,
    StyleSheet,
    ActivityIndicator,
    ViewStyle,
    Pressable,
    View,
    Platform,
    StyleProp,
    TextStyle
} from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import { Typography, BorderRadius, Shadows, Spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
    title: string;
    onPress: () => void;
    variant?: ButtonVariant;
    size?: ButtonSize;
    disabled?: boolean;
    loading?: boolean;
    Icon?: LucideIcon;
    style?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
}

export default function Button({
    title,
    onPress,
    variant = 'primary',
    size = 'md',
    disabled = false,
    loading = false,
    Icon,
    style,
    textStyle
}: ButtonProps) {
    const { colors } = useTheme();

    const getBackgroundColor = (): string => {
        switch (variant) {
            case 'primary': return colors.primary;
            case 'secondary': return colors.cardBackground;
            case 'success': return colors.success;
            case 'danger': return colors.error;
            default: return colors.primary;
        }
    };

    const getBorderColor = (): string => {
        switch (variant) {
            case 'primary': return colors.primary;
            case 'secondary': return colors.border;
            case 'success': return colors.success;
            case 'danger': return colors.error;
            default: return colors.primary;
        }
    };

    const getTextColor = (): string => {
        return variant === 'secondary' ? colors.textPrimary : colors.white;
    };

    const getSizeStyles = (): ViewStyle => {
        switch (size) {
            case 'sm':
                return {
                    paddingVertical: Spacing.sm,
                    paddingHorizontal: Spacing.lg,
                };
            case 'md':
                return {
                    paddingVertical: Spacing.md,
                    paddingHorizontal: Spacing.xl,
                };
            case 'lg':
                return {
                    paddingVertical: Spacing.lg,
                    paddingHorizontal: Spacing.xxl,
                };
        }
    };

    const getRippleColor = (): string => {
        return variant === 'secondary' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.2)';
    };

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: getBackgroundColor(),
                    borderColor: getBorderColor(),
                    ...Shadows.md
                },
                disabled && styles.disabled,
                style,
            ]}
        >
            <Pressable
                onPress={onPress}
                disabled={disabled || loading}
                android_ripple={{ color: getRippleColor(), borderless: false }}
                style={({ pressed }) => [
                    styles.pressable,
                    getSizeStyles(),
                    Platform.OS === 'ios' && pressed && styles.iosPressed
                ]}
            >
                {loading ? (
                    <ActivityIndicator color={getTextColor()} />
                ) : (
                    <View style={styles.content}>
                        {Icon && <Icon color={getTextColor()} size={20} style={styles.icon} />}
                        <Text style={[styles.text, { color: getTextColor() }, textStyle]}>{title}</Text>
                    </View>
                )}
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        borderRadius: BorderRadius.lg,
        borderWidth: 2,
        overflow: 'hidden',
    },
    pressable: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iosPressed: {
        opacity: 0.7,
    },
    text: {
        fontSize: Typography.base,
        fontWeight: Typography.semibold,
    },
    icon: {
        marginRight: Spacing.sm,
    },
    disabled: {
        opacity: 0.5,
        ...Shadows.sm,
    },
});
