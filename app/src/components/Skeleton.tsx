import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle, StyleSheet, DimensionValue, Platform } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { BorderRadius } from '../constants/theme';

interface SkeletonProps {
    width?: DimensionValue;
    height?: DimensionValue;
    variant?: 'rect' | 'circle' | 'text';
    style?: ViewStyle;
}

export default function Skeleton({
    width,
    height,
    variant = 'rect',
    style
}: SkeletonProps) {
    const { colors } = useTheme();
    const opacity = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
        const useNativeDriver = Platform.OS !== 'web';

        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, {
                    toValue: 0.7,
                    duration: 800,
                    useNativeDriver,
                }),
                Animated.timing(opacity, {
                    toValue: 0.3,
                    duration: 800,
                    useNativeDriver,
                }),
            ])
        );
        pulse.start();

        return () => pulse.stop();
    }, [opacity]);

    const getBorderRadius = () => {
        switch (variant) {
            case 'circle':
                return typeof height === 'number' ? height / 2 : 50;
            case 'text':
                return BorderRadius.sm;
            default:
                return BorderRadius.md;
        }
    };

    return (
        <Animated.View
            style={[
                styles.skeleton,
                {
                    width,
                    height,
                    backgroundColor: colors.border, // Use border color as base for skeleton
                    opacity,
                    borderRadius: getBorderRadius(),
                },
                style,
            ]}
        />
    );
}

const styles = StyleSheet.create({
    skeleton: {
        overflow: 'hidden',
    },
});
