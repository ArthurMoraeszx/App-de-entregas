import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface Props {
    isOnline: boolean;
    isSyncing: boolean;
    lastSyncAt: Date | null;
}

function formatLastSync(date: Date | null): string {
    if (!date) return '';
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Atualizado agora';
    if (diffMin < 60) return `Atualizado há ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    return `Atualizado há ${diffH}h`;
}

export default function SyncStatusBar({ isOnline, isSyncing, lastSyncAt }: Props) {
    const { colors } = useTheme();
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const [justSynced, setJustSynced] = useState(false);
    const prevSyncingRef = useRef(false);
    const [, setTick] = useState(0);

    // Atualiza o texto "há X min" a cada minuto
    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 60000);
        return () => clearInterval(interval);
    }, []);

    // Detecta fim do sync para mostrar flash "Atualizado agora"
    useEffect(() => {
        if (prevSyncingRef.current && !isSyncing && isOnline) {
            setJustSynced(true);
            const timer = setTimeout(() => setJustSynced(false), 3000);
            return () => clearTimeout(timer);
        }
        prevSyncingRef.current = isSyncing;
    }, [isSyncing, isOnline]);

    const isVisible = !isOnline || isSyncing || justSynced;

    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: isVisible ? 1 : 0,
            duration: 300,
            useNativeDriver: true,
        }).start();
    }, [isVisible, fadeAnim]);

    const bgColor = !isOnline
        ? '#92400e'
        : justSynced
        ? '#065f46'
        : colors.primary;

    const label = !isOnline
        ? '📵  Sem conexão · dados salvos localmente'
        : justSynced
        ? `✓  ${formatLastSync(lastSyncAt)}`
        : '↻  Sincronizando...';

    return (
        <Animated.View style={[styles.bar, { backgroundColor: bgColor, opacity: fadeAnim }]}>
            <Text style={styles.text}>{label}</Text>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    bar: {
        paddingVertical: 5,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.2,
    },
});
