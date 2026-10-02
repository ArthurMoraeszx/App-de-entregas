import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Skeleton from './Skeleton';
import { Spacing, ThemeColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

export default function HomeSkeleton() {
    const { colors } = useTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);

    return (
        <View style={styles.container}>
            {/* Header Skeleton */}
            <View style={styles.header}>
                <View>
                    <Skeleton width={150} height={24} variant="text" style={{ marginBottom: 8 }} />
                    <Skeleton width={200} height={16} variant="text" />
                </View>
                <Skeleton width={48} height={48} variant="circle" />
            </View>

            {/* Resumo Banner Skeleton */}
            <View style={styles.resumoContainer}>
                <View style={styles.resumoItem}>
                    <Skeleton width={40} height={32} style={{ marginBottom: 4 }} />
                    <Skeleton width={60} height={12} variant="text" />
                </View>
                <View style={styles.resumoItem}>
                    <Skeleton width={40} height={32} style={{ marginBottom: 4 }} />
                    <Skeleton width={60} height={12} variant="text" />
                </View>
                <View style={styles.resumoItem}>
                    <Skeleton width={40} height={32} style={{ marginBottom: 4 }} />
                    <Skeleton width={60} height={12} variant="text" />
                </View>
            </View>

            {/* List Items Skeleton */}
            <View style={styles.listContainer}>
                {[1, 2, 3, 4].map((item) => (
                    <View key={item} style={styles.cardSkeleton}>
                        <View style={styles.cardHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Skeleton width={48} height={48} style={{ marginRight: 16 }} />
                                <View>
                                    <Skeleton width={80} height={20} variant="text" style={{ marginBottom: 4 }} />
                                    <Skeleton width={60} height={14} variant="text" />
                                </View>
                            </View>
                            <Skeleton width={80} height={24} style={{ borderRadius: 12 }} />
                        </View>
                        <Skeleton width="80%" height={16} variant="text" style={{ marginBottom: 6 }} />
                        <Skeleton width="40%" height={14} variant="text" style={{ marginBottom: 12 }} />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                            <Skeleton width={100} height={14} variant="text" />
                            <Skeleton width={80} height={14} variant="text" />
                        </View>
                    </View>
                ))}
            </View>
        </View>
    );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: Spacing.xl,
        paddingBottom: Spacing.lg,
    },
    resumoContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: colors.cardBackground,
        marginHorizontal: Spacing.xl,
        marginBottom: Spacing.lg,
        borderRadius: 16, // BorderRadius.xl
        padding: Spacing.lg,
    },
    resumoItem: {
        alignItems: 'center',
        flex: 1,
    },
    listContainer: {
        paddingHorizontal: Spacing.xl,
    },
    cardSkeleton: {
        backgroundColor: colors.cardBackground,
        borderRadius: 12,
        padding: Spacing.lg,
        marginBottom: Spacing.lg,
        borderWidth: 1,
        borderColor: colors.borderLight,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: Spacing.md,
    },
});
