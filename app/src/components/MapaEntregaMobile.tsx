/**
 * MapaEntregaMobile — Exibe localização GPS da entrega.
 *
 * Renderização: grade 3×3 de tiles OSM (tile.openstreetmap.org) centralizados
 * na coordenada da entrega, sem nenhum módulo nativo extra.
 * Compatible com Expo Go.
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Image,
    TouchableOpacity,
    ActivityIndicator,
    Linking,
    Platform,
} from 'react-native';
import { MapPin, Home, Navigation } from 'lucide-react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Typography, Spacing, BorderRadius, ThemeColors } from '../constants/theme';

interface Props {
    latitude: number;
    longitude: number;
}

type GeoStatus = 'idle' | 'loading' | 'ok' | 'error';

// ─── Cálculo de tiles OSM ───────────────────────────────────────────────────
const TILE_SIZE = 256; // px por tile
const ZOOM = 15;      // nível de zoom (bairro)
const GRID = 3;       // grade NxN de tiles

function latLngToTile(lat: number, lng: number, z: number) {
    const n = Math.pow(2, z);
    const x = Math.floor(((lng + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(
        ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
    );
    return { x, y };
}

/** Fração (0–1) da coordenada dentro do tile central */
function tileOffset(lat: number, lng: number, z: number, cx: number, cy: number) {
    const n = Math.pow(2, z);
    const fracX = ((lng + 180) / 360) * n - cx;
    const latRad = (lat * Math.PI) / 180;
    const fracY =
        ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n - cy;
    return { fracX, fracY };
}

const SUBDOMAINS = ['a', 'b', 'c'];
function tileUrl(x: number, y: number, z: number, idx: number) {
    const sub = SUBDOMAINS[idx % SUBDOMAINS.length];
    return `https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

// ─── Nominatim ─────────────────────────────────────────────────────────────
const geocodeCache = new Map<string, string>();

function geocodeKey(lat: number, lon: number) {
    return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

function formatAddress(addr: any): string {
    const parts: string[] = [];
    if (addr.road) parts.push(addr.road + (addr.house_number ? `, ${addr.house_number}` : ''));
    if (addr.suburb) parts.push(addr.suburb);
    const city = addr.city ?? addr.town ?? addr.village;
    if (city) parts.push(city);
    if (addr.state) parts.push(addr.state);
    return parts.join(' — ') || 'Endereço não identificado';
}

// ─── Componente ────────────────────────────────────────────────────────────
export default function MapaEntregaMobile({ latitude, longitude }: Props) {
    const { colors } = useTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);

    const [endereco, setEndereco] = useState('');
    const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle');

    // Geocoding reverso com cache por sessão
    useEffect(() => {
        let cancelled = false;
        const key = geocodeKey(latitude, longitude);
        const cached = geocodeCache.get(key);
        if (cached) {
            setEndereco(cached);
            setGeoStatus('ok');
            return;
        }

        setGeoStatus('loading');
        setEndereco('');

        fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
            { headers: { 'Accept-Language': 'pt-BR', 'User-Agent': 'RotaEscolar/1.0' } }
        )
            .then((r) => r.json())
            .then((data) => {
                if (cancelled) return;
                if (data?.address) {
                    const formatted = formatAddress(data.address);
                    geocodeCache.set(key, formatted);
                    setEndereco(formatted);
                    setGeoStatus('ok');
                } else setGeoStatus('error');
            })
            .catch(() => { if (!cancelled) setGeoStatus('error'); });

        return () => { cancelled = true; };
    }, [latitude, longitude]);

    // Cálculo dos tiles
    const { cx, cy, pinX, pinY, tiles } = useMemo(() => {
        const { x: cx, y: cy } = latLngToTile(latitude, longitude, ZOOM);
        const { fracX, fracY } = tileOffset(latitude, longitude, ZOOM, cx, cy);

        // Ponto do pin dentro da grade (em px a partir do topo-esquerdo)
        const half = Math.floor(GRID / 2); // 1 para GRID=3
        const pinX = (half + fracX) * TILE_SIZE;
        const pinY = (half + fracY) * TILE_SIZE;

        // Lista de tiles (row-major)
        const tilesArr: { x: number; y: number; url: string }[] = [];
        let idx = 0;
        for (let row = -half; row <= half; row++) {
            for (let col = -half; col <= half; col++) {
                tilesArr.push({
                    x: cx + col,
                    y: cy + row,
                    url: tileUrl(cx + col, cy + row, ZOOM, idx++),
                });
            }
        }

        return { cx, cy, pinX, pinY, tiles: tilesArr };
    }, [latitude, longitude]);

    const gridSize = GRID * TILE_SIZE; // 768 px

    const handleOpenMaps = () => {
        const urlWeb = `https://www.google.com/maps?q=${latitude},${longitude}`;

        // Sem o caso `web`, o Platform.select devolve undefined no navegador e o
        // botão vira decoração: nada acontece e nada aparece no console.
        const url = Platform.select({
            ios: `maps:?ll=${latitude},${longitude}&q=Local+da+entrega`,
            android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(Local+da+entrega)`,
            web: urlWeb,
        });
        if (url) {
            Linking.openURL(url).catch(() => Linking.openURL(urlWeb));
        }
    };

    return (
        <View style={styles.container}>
            {/* Grade de tiles + pin */}
            <View style={styles.mapWrapper}>
                {/* Grade de tiles — renderizada em tamanho real e cortada pelo overflow:hidden do wrapper */}
                <View
                    style={{
                        width: gridSize,
                        height: gridSize,
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        position: 'absolute',
                        // Centraliza a grade dentro do wrapper de 300×220 px
                        left: -(pinX - 150),
                        top: -(pinY - 110),
                    }}
                >
                    {tiles.map((t) => (
                        <Image
                            key={`${t.x}-${t.y}`}
                            source={{ uri: t.url, headers: { 'User-Agent': 'RotaEscolar/1.0' } }}
                            style={{ width: TILE_SIZE, height: TILE_SIZE }}
                            resizeMode="cover"
                        />
                    ))}

                    {/* Pin exato sobre a coordenada */}
                    <View
                        style={{
                            position: 'absolute',
                            left: pinX - 16,
                            top: pinY - 36,
                        }}
                    >
                        <View style={styles.pinShadow}>
                            <View style={styles.pinBody}>
                                <MapPin color="#fff" size={18} />
                            </View>
                            <View style={styles.pinTail} />
                        </View>
                    </View>
                </View>

                {/* Botão flutuante "Abrir no Maps" */}
                <TouchableOpacity style={styles.openButton} onPress={handleOpenMaps}>
                    <Navigation color={colors.white} size={14} />
                    <Text style={styles.openButtonText}>Abrir no Maps</Text>
                </TouchableOpacity>
            </View>

            {/* Rodapé com coords + endereço */}
            <View style={styles.footer}>
                <View style={styles.footerRow}>
                    <MapPin color={colors.textLight} size={13} />
                    <Text style={styles.footerCoords}>
                        {latitude.toFixed(6)}, {longitude.toFixed(6)}
                    </Text>
                </View>

                <View style={styles.footerRow}>
                    <Home color={colors.textLight} size={13} />
                    {geoStatus === 'loading' && (
                        <>
                            <ActivityIndicator size="small" color={colors.textLight} style={{ marginRight: 4 }} />
                            <Text style={[styles.footerAddress, { fontStyle: 'italic', color: colors.textLight }]}>
                                Buscando endereço...
                            </Text>
                        </>
                    )}
                    {geoStatus === 'ok' && <Text style={styles.footerAddress}>{endereco}</Text>}
                    {geoStatus === 'error' && (
                        <Text style={[styles.footerAddress, { fontStyle: 'italic', color: colors.textLight }]}>
                            Endereço não disponível
                        </Text>
                    )}
                </View>
            </View>
        </View>
    );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
    container: {
        borderRadius: BorderRadius.lg,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
    },
    mapWrapper: {
        height: 220,
        width: '100%',
        overflow: 'hidden',
        backgroundColor: colors.backgroundDark,
        position: 'relative',
    },
    openButton: {
        position: 'absolute',
        bottom: Spacing.md,
        right: Spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        backgroundColor: colors.primary,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.full,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 5,
    },
    openButtonText: {
        fontSize: Typography.xs,
        fontWeight: Typography.bold,
        color: colors.white,
    },
    pinShadow: {
        alignItems: 'center',
    },
    pinBody: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 3,
        elevation: 5,
    },
    pinTail: {
        width: 0,
        height: 0,
        borderLeftWidth: 6,
        borderRightWidth: 6,
        borderTopWidth: 8,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: colors.primary,
        marginTop: -1,
    },
    footer: {
        backgroundColor: colors.cardBackground,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        padding: Spacing.md,
        gap: Spacing.sm,
    },
    footerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        flexWrap: 'wrap',
    },
    footerCoords: {
        fontSize: Typography.xs,
        color: colors.textLight,
        fontFamily: 'monospace',
    },
    footerAddress: {
        fontSize: Typography.xs,
        color: colors.textSecondary,
        flex: 1,
    },
});
