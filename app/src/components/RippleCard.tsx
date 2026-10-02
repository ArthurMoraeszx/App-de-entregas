import React from 'react';
import {
    View,
    StyleSheet,
    ViewStyle,
    Pressable,
    Platform,
    StyleProp
} from 'react-native';
import { BorderRadius, Shadows, Spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

interface RippleCardProps {
    children: React.ReactNode;
    onPress?: () => void;
    style?: StyleProp<ViewStyle>;
}

export default function RippleCard({ children, onPress, style }: RippleCardProps) {
    const { colors, theme } = useTheme();

    const rippleColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';

    return (
        <View style={[
            styles.cardContainer,
            { backgroundColor: colors.cardBackground, borderColor: colors.borderLight },
            style
        ]}>
            <Pressable
                onPress={onPress}
                android_ripple={{ color: rippleColor }}
                style={({ pressed }) => [
                    styles.content,
                    Platform.OS === 'ios' && pressed && styles.iosPressed
                ]}
            >
                {children}
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    cardContainer: {
        borderRadius: BorderRadius.xl,
        borderWidth: 1,
        overflow: 'hidden',
        ...Shadows.md,
    },
    content: {
        padding: Spacing.lg,
    },
    iosPressed: {
        opacity: 0.7,
    },
});
