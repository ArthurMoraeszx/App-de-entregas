import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { BorderRadius, Shadows, Spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

interface CardProps {
    children: ReactNode;
    style?: StyleProp<ViewStyle>;
}

export default function Card({ children, style }: CardProps) {
    const { colors } = useTheme();

    return (
        <View style={[
            styles.card,
            { backgroundColor: colors.cardBackground, borderColor: colors.borderLight },
            style
        ]}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: BorderRadius.xl,
        padding: Spacing.lg,
        borderWidth: 1,
        ...Shadows.md,
    },
});
