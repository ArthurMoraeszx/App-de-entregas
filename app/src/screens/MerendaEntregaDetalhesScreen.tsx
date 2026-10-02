import React, { useMemo, useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Linking,
    Platform,
    useWindowDimensions,
    Animated,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapPin, Map, ClipboardList, Package, Egg, Beef, Drumstick, Ham, Leaf, AlertTriangle, ClipboardCheck } from 'lucide-react-native';
import NetInfo from '@react-native-community/netinfo';
import { Q } from '@nozbe/watermelondb';
import { database } from '../database';
import Card from '../components/Card';
import Badge from '../components/Badge';
import Button from '../components/Button';
import MapaEntregaMobile from '../components/MapaEntregaMobile';
import { Typography, Spacing, BorderRadius, ThemeColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import type { ScreenProps } from '../../App';
import { getEntregaBadgeProps } from '../utils/entregaStatusBadge';
import { clearTransitionRisk } from '../utils/transitionWatchdog';

export default function MerendaEntregaDetalhesScreen({ route, navigation }: ScreenProps<'EntregaDetalhes'>) {
    const { entrega } = route.params;
    const { colors } = useTheme();
    const { user } = useAuth();
    const questionarioOwnershipConfirmedRef = useRef(false);
    const styles = useMemo(() => getStyles(colors), [colors]);

    const getGeneroColor = (genero: string): string => {
        const gen = genero?.toLowerCase() || '';
        if (gen.includes('ovo') || gen === '1') return colors.generoOvo;
        if (gen.includes('carne') || gen.includes('bov') || gen.includes('moíd') || gen.includes('moid') || gen === '2') return colors.generoCarne;
        if (gen.includes('frango') || gen === '3') return colors.generoFrango;
        if (gen.includes('lombo') || gen.includes('suín') || gen.includes('porco') || gen === '4') return colors.generoLombo;
        if (gen.includes('flv') || gen.includes('fruta') || gen.includes('verdura') || gen.includes('legume')) return '#66BB6A';
        return colors.primary;
    };

    const getGeneroIcon = (genero: string) => {
        const color = colors.white;
        const size = 48;
        const gen = genero?.toLowerCase() || '';

        // Frango → Drumstick (coxa de frango)
        // Carne bovina → Beef
        // Lombo / porco → Ham
        // Ovo → Egg
        // FLV / hortifruti / verdura / fruta → Leaf
        if (gen.includes('frango') || gen === '3') {
            return <Drumstick color={color} size={size} />;
        }
        if (gen.includes('ovo') || gen === '1') {
            return <Egg color={color} size={size} />;
        }
        if (gen.includes('lombo') || gen.includes('suín') || gen.includes('porco') || gen === '4') {
            return <Ham color={color} size={size} />;
        }
        if (gen.includes('carne') || gen.includes('bov') || gen.includes('moíd') || gen.includes('moid') || gen === '2') {
            return <Beef color={color} size={size} />;
        }
        if (gen.includes('flv') || gen.includes('fruta') || gen.includes('verdura') || gen.includes('legume') || gen.includes('hortifruti')) {
            return <Leaf color={color} size={size} />;
        }
        return <Package color={color} size={size} />;
    };

    const handleRegistrar = () => {
        navigation.navigate('RegistroEntrega', { entrega });
    };

    const handleRegistrarQuestionario = () => {
        const doNavigate = () => navigation.navigate('RegistroQuestionario', {
            entrega,
            tipoEntrega: entrega.tipo_entrega,
        });

        if (
            !questionarioOwnershipConfirmedRef.current &&
            entrega.id_motorista &&
            user?.id_motorista &&
            entrega.id_motorista !== user.id_motorista
        ) {
            Alert.alert(
                'Guia de outro motorista',
                'Esta guia está atribuída a outro motorista. Tem certeza que quer registrar o questionário?',
                [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Continuar', onPress: () => { questionarioOwnershipConfirmedRef.current = true; doNavigate(); } },
                ],
            );
            return;
        }
        doNavigate();
    };

    const { width } = useWindowDimensions();
    const isTablet = width >= 768;

    // Mapa aberto já de cara. O padrão era fechado para não atrasar a abertura
    // da tela com as chamadas aos tiles OSM e à geocodificação reversa, mas
    // esconder o mapa atrás de mais um toque atrapalha mais do que a espera —
    // o botão "Ver mapa" continua existindo para quem fechar.
    const [mapaVisivel, setMapaVisivel] = useState(true);

    // Chegou até aqui: a transição vinda de RegistroQuestionario completou
    // normalmente (ver transitionWatchdog).
    useEffect(() => {
        clearTransitionRisk().catch(() => {});
    }, []);

    // Coordenada da escola, lida do banco local pelo código dela.
    //
    // Vem daqui, e não do parâmetro de navegação, porque esta tela é alcançada
    // por dois caminhos — a lista da Home e a busca por número de guia — e cada
    // um monta o objeto da entrega de um jeito. Consultar a tabela de escolas
    // funciona igual nos dois.
    const [coordEscola, setCoordEscola] = useState<{ latitude: number; longitude: number } | null>(null);

    useEffect(() => {
        let cancelado = false;
        const codEscola = entrega.escola != null ? String(entrega.escola).trim() : '';
        if (!database || !codEscola) return;

        database
            .get('escolas')
            .query(Q.where('cod_escola', codEscola))
            .fetch()
            .then((linhas: any[]) => {
                const escola = linhas[0];
                if (cancelado || !escola) return;
                if (escola.latitude != null && escola.longitude != null) {
                    setCoordEscola({ latitude: Number(escola.latitude), longitude: Number(escola.longitude) });
                }
            })
            .catch(() => { /* sem coordenada: a tela cai no aviso de GPS não registrado */ });

        return () => { cancelado = true; };
    }, [entrega.escola]);

    // Ponto a exibir no mapa, com a precedência que interessa ao motorista:
    // se a entrega já foi confirmada, mostra onde ela realmente aconteceu;
    // enquanto está pendente, mostra para onde ele precisa ir.
    const gpsDaEntrega =
        entrega.latitude != null && entrega.longitude != null
            && entrega.latitude !== 0 && entrega.longitude !== 0
            ? { latitude: entrega.latitude as number, longitude: entrega.longitude as number }
            : null;

    const pontoNoMapa = gpsDaEntrega ?? coordEscola;

    // Definido depois de `pontoNoMapa` de propósito: é dele que a função depende.
    const handleVerNoMapa = () => {
        // Coordenada primeiro, texto como reserva. Buscar pelo nome da escola só
        // acerta se o Google conhecer aquela escola — e leva a um lugar errado
        // quando não conhece, o que é pior do que não abrir nada.
        const alvo = pontoNoMapa
            ? `${pontoNoMapa.latitude},${pontoNoMapa.longitude}`
            : `${entrega.nomeEscola}, ${entrega.municipio}`;
        const query = encodeURIComponent(alvo);

        const urlWeb = pontoNoMapa
            ? `https://www.google.com/maps?q=${query}`
            : `https://www.google.com/maps/search/${query}`;

        // O caso `web` não é detalhe: sem ele o Platform.select devolve undefined
        // no navegador, o `if` abaixo nunca entra e o botão simplesmente não faz
        // nada — sem erro no console, parecendo que a tela travou.
        const url = Platform.select({
            ios: `maps:?q=${query}`,
            android: `geo:0,0?q=${query}`,
            web: urlWeb,
        });

        if (url) {
            Linking.openURL(url).catch(() => {
                // Se o app nativo de mapas não abrir, cai para o site.
                Linking.openURL(urlWeb);
            });
        }
    };

    // Conectividade — inicia como true para o mapa aparecer imediatamente
    const [isConnected, setIsConnected] = useState(true);
    useEffect(() => {
        NetInfo.fetch().then((state) => {
            setIsConnected(!!state.isConnected);
        });
        const unsub = NetInfo.addEventListener((state) => {
            setIsConnected(!!state.isConnected);
        });
        return unsub;
    }, []);

    // Animação de entrada
    const fadeAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 350,
            useNativeDriver: true,
        }).start();
    }, [fadeAnim]);

    const formatDate = (dateValue: any) => {
        if (!dateValue || dateValue === '') return 'N/A';
        try {
            const d = new Date(dateValue);
            if (isNaN(d.getTime())) return 'N/A';
            return d.toLocaleDateString('pt-BR');
        } catch (e) {
            return 'N/A';
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <ScrollView contentContainerStyle={[styles.scrollContent, isTablet && styles.scrollContentTablet]}>
                <Animated.View
                    style={{
                        opacity: fadeAnim,
                        transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
                    }}
                >

                    {/* Banner de Guia Prioritária — primeiro elemento visível */}
                    {entrega.prioridade && entrega.status === 'pendente' && (
                        <View style={styles.priorityBanner}>
                            <AlertTriangle color="#92400e" size={18} />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.priorityBannerTitle}>Entrega Prioritária</Text>
                                <Text style={styles.priorityBannerSub}>Esta guia requer atenção especial e deve ser entregue com urgência.</Text>
                            </View>
                        </View>
                    )}

                    {/* Header com Gênero */}
                    <Card style={[styles.generoCard, isTablet && styles.generoCardTablet]}>
                        <View style={[
                            styles.generoHeader,
                            { backgroundColor: getGeneroColor(entrega.genero) },
                            isTablet && styles.generoHeaderTablet
                        ]}>
                            <Text style={styles.guiaLabel}>GUIA</Text>
                            <Text
                                style={styles.guiaNumero}
                                adjustsFontSizeToFit
                                minimumFontScale={0.6}
                                numberOfLines={1}
                            >
                                {String(entrega.numGuia)}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm, opacity: 0.9 }}>
                                {getGeneroIcon(entrega.genero)}
                            </View>
                            <Text style={styles.generoNome}>{String(entrega.genero)}</Text>
                        </View>
                        <View style={[styles.generoInfo, isTablet && styles.generoInfoTablet]}>
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Quantidade Enviada:</Text>
                                <Text style={styles.infoValue}>{String(entrega.qtdEnviada)} kg</Text>
                            </View>
                        </View>
                    </Card>

                    <View style={[styles.mainContainer, isTablet && styles.rowContainer]}>

                        {/* Coluna da Esquerda */}
                        <View style={[styles.column, isTablet && { marginRight: Spacing.lg }]}>
                            <Card style={styles.card}>
                                <View style={styles.sectionHeader}>
                                    <MapPin color={colors.primary} size={20} />
                                    <Text style={styles.sectionTitle}>Escola de Destino</Text>
                                </View>
                                <Text style={styles.escolaNome}>{String(entrega.nomeEscola || entrega.escola || '')}</Text>

                                {entrega.endereco ? (
                                    <Text style={styles.escolaEndereco}>{String(entrega.endereco)}</Text>
                                ) : null}

                                <View style={styles.divider} />

                                {entrega.municipio ? (
                                    <View style={styles.infoRow}>
                                        <Text style={styles.infoLabel}>Município:</Text>
                                        <Text style={styles.infoValue}>{String(entrega.municipio)}</Text>
                                    </View>
                                ) : null}

                                {entrega.gre ? (
                                    <View style={styles.infoRow}>
                                        <Text style={styles.infoLabel}>GRE:</Text>
                                        <Text style={styles.infoValue}>{String(entrega.gre)}</Text>
                                    </View>
                                ) : null}

                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Código:</Text>
                                    <Text style={styles.infoValue}>{String(entrega.escola)}</Text>
                                </View>

                                <TouchableOpacity style={styles.mapaButton} onPress={handleVerNoMapa}>
                                    <Map color={colors.info} size={16} />
                                    <Text style={styles.mapaText}>Abrir no Google Maps</Text>
                                </TouchableOpacity>
                            </Card>
                        </View>

                        {/* Coluna da Direita */}
                        <View style={styles.column}>
                            <Card style={styles.card}>
                                <View style={styles.sectionHeader}>
                                    <ClipboardList color={colors.primary} size={20} />
                                    <Text style={styles.sectionTitle}>Informações da Entrega</Text>
                                    {entrega.emergencial && (
                                        <View style={{ marginLeft: 'auto' }}>
                                            <Badge label="Emergencial" status="error" />
                                        </View>
                                    )}
                                </View>

                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Prazo Oficial (SecEdu):</Text>
                                    <Text style={[
                                        styles.infoValue,
                                        (entrega.data_prorrogacao || entrega.data_antecipacao) && {
                                            textDecorationLine: 'line-through',
                                            color: colors.textLight,
                                            opacity: 0.7
                                        }
                                    ]}>
                                        {formatDate(entrega.dt_inicio_cronograma || entrega.dtPrevisao)}
                                    </Text>
                                </View>

                                {entrega.data_prorrogacao ? (
                                    <View style={[styles.infoRow, { backgroundColor: '#fee2e2', padding: 12, borderRadius: 8, marginTop: 8, borderColor: '#ef4444', borderWidth: 1 }]}>
                                        <AlertTriangle color="#ef4444" size={24} style={{ marginRight: 12 }} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: '#ef4444', fontSize: Typography.sm, fontWeight: '700', marginBottom: 2 }}>Prazo Atualizado:</Text>
                                            <Text style={{ color: '#b91c1c', fontSize: Typography.md, fontWeight: 'bold' }}>
                                                Prorrogado para: {formatDate(entrega.data_prorrogacao)}
                                            </Text>
                                        </View>
                                    </View>
                                ) : entrega.data_antecipacao ? (
                                    <View style={[styles.infoRow, { backgroundColor: '#fee2e2', padding: 12, borderRadius: 8, marginTop: 8, borderColor: '#ef4444', borderWidth: 1 }]}>
                                        <AlertTriangle color="#ef4444" size={24} style={{ marginRight: 12 }} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: '#ef4444', fontSize: Typography.sm, fontWeight: '700', marginBottom: 2 }}>Prazo Atualizado:</Text>
                                            <Text style={{ color: '#b91c1c', fontSize: Typography.md, fontWeight: 'bold' }}>
                                                Antecipado para: {formatDate(entrega.data_antecipacao)}
                                            </Text>
                                        </View>
                                    </View>
                                ) : null}

                                {entrega.data_hora_entrega && (
                                    <View style={styles.infoRow}>
                                        <Text style={styles.infoLabel}>Data da Entrega:</Text>
                                        <Text style={styles.infoValue}>
                                            {formatDate(entrega.data_hora_entrega)}
                                        </Text>
                                    </View>
                                )}

                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Status:</Text>
                                    <View style={{ flexShrink: 1, minWidth: 0, marginLeft: 8 }}>
                                        <Badge {...getEntregaBadgeProps(entrega)} />
                                    </View>
                                </View>
                            </Card>

                            {/* Card do mapa — para entrega pendente mostra mapa de destino; para concluída mostra local registrado */}
                            {entrega.status === 'concluida' ? (
                                <Card style={styles.card}>
                                    <View style={styles.sectionHeader}>
                                        <MapPin color={colors.primary} size={20} />
                                        <Text style={styles.sectionTitle}>Local da Entrega Registrado</Text>
                                    </View>

                                    {isConnected && pontoNoMapa ? (
                                        mapaVisivel ? (
                                            <>
                                                <MapaEntregaMobile
                                                    latitude={pontoNoMapa.latitude}
                                                    longitude={pontoNoMapa.longitude}
                                                />
                                                <TouchableOpacity style={[styles.mapaButton, styles.mapaButtonOutline]} onPress={handleVerNoMapa}>
                                                    <Map color={colors.info} size={16} />
                                                    <Text style={styles.mapaText}>Abrir no Google Maps</Text>
                                                </TouchableOpacity>
                                            </>
                                        ) : (
                                            <TouchableOpacity style={styles.mapaButton} onPress={() => setMapaVisivel(true)}>
                                                <MapPin color={colors.info} size={16} />
                                                <Text style={styles.mapaText}>Ver mapa</Text>
                                            </TouchableOpacity>
                                        )
                                    ) : !isConnected ? (
                                        <View style={styles.noGpsContainer}>
                                            <MapPin color={colors.border} size={32} />
                                            <Text style={styles.noGpsTitle}>Sem conexão</Text>
                                            <Text style={styles.noGpsText}>
                                                Conecte-se à internet para visualizar o mapa.
                                            </Text>
                                        </View>
                                    ) : (
                                        <View style={styles.noGpsContainer}>
                                            <MapPin color={colors.border} size={32} />
                                            <Text style={styles.noGpsTitle}>GPS não registrado</Text>
                                            <Text style={styles.noGpsText}>
                                                As coordenadas serão capturadas pelo app no momento da entrega.
                                            </Text>
                                        </View>
                                    )}
                                </Card>
                            ) : isConnected && pontoNoMapa ? (
                                <Card style={styles.card}>
                                    <View style={styles.sectionHeader}>
                                        <MapPin color={colors.primary} size={20} />
                                        <Text style={styles.sectionTitle}>
                                            {gpsDaEntrega ? 'Local da Entrega Registrado' : 'Destino no Mapa'}
                                        </Text>
                                    </View>
                                    {mapaVisivel ? (
                                        <>
                                            <MapaEntregaMobile
                                                latitude={pontoNoMapa.latitude}
                                                longitude={pontoNoMapa.longitude}
                                            />
                                            <TouchableOpacity style={[styles.mapaButton, styles.mapaButtonOutline]} onPress={handleVerNoMapa}>
                                                <Map color={colors.info} size={16} />
                                                <Text style={styles.mapaText}>Abrir no Google Maps</Text>
                                            </TouchableOpacity>
                                        </>
                                    ) : (
                                        <TouchableOpacity style={styles.mapaButton} onPress={() => setMapaVisivel(true)}>
                                            <MapPin color={colors.info} size={16} />
                                            <Text style={styles.mapaText}>Ver mapa</Text>
                                        </TouchableOpacity>
                                    )}
                                </Card>
                            ) : null}
                        </View>
                    </View>
                </Animated.View>
            </ScrollView>
            {entrega.status === 'pendente' && (
                <View style={styles.footer}>
                    <Button
                        title="Registrar Entrega"
                        onPress={handleRegistrar}
                        style={styles.actionButton}
                    />
                </View>
            )}
            {entrega.status === 'aguardando_questionario' && (
                <View style={styles.footer}>
                    <View style={styles.questionarioNotice}>
                        <ClipboardCheck color={colors.warning} size={16} />
                        <Text style={styles.questionarioNoticeText}>
                            Etapa 1 concluída. Registre o questionário para encerrar a guia.
                        </Text>
                    </View>
                    <Button
                        title="Registrar Questionário"
                        onPress={handleRegistrarQuestionario}
                        style={styles.actionButton}
                    />
                </View>
            )}
            {entrega.status === 'parcial' && (
                <View style={styles.footer}>
                    <View style={styles.parcialNotice}>
                        <AlertTriangle color={colors.warning} size={16} />
                        <Text style={styles.parcialNoticeText}>
                            Entrega parcial registrada.
                        </Text>
                    </View>
                </View>
            )}
        </SafeAreaView>
    );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    scrollContent: {
        padding: Spacing.xl,
        paddingBottom: Spacing.xxxl,
        width: '100%',
        maxWidth: 500,
        alignSelf: 'center',
    },
    scrollContentTablet: {
        maxWidth: 900,
    },
    mainContainer: {
        flexDirection: 'column',
    },
    rowContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    column: {
        flex: 1,
    },
    generoCard: {
        padding: 0,
        overflow: 'hidden',
        marginBottom: Spacing.lg,
    },
    priorityBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing.md,
        backgroundColor: '#fef3c7',
        borderLeftWidth: 4,
        borderLeftColor: '#f59e0b',
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        marginBottom: Spacing.lg,
    },
    priorityBannerTitle: {
        fontSize: Typography.sm,
        fontWeight: '700' as const,
        color: '#92400e',
        marginBottom: 2,
    },
    priorityBannerSub: {
        fontSize: Typography.xs,
        color: '#b45309',
        lineHeight: 16,
    },
    generoCardTablet: {
        flexDirection: 'row',
    },
    generoHeader: {
        padding: Spacing.xl,
        alignItems: 'center',
    },
    generoHeaderTablet: {
        width: 190,
        justifyContent: 'center',
        paddingVertical: 0,
    },
    guiaLabel: {
        fontSize: Typography.xs,
        fontWeight: '700' as const,
        color: colors.white,
        opacity: 0.8,
        letterSpacing: 3,
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    guiaNumero: {
        fontSize: Typography.xxxl,
        fontWeight: '900' as const,
        color: colors.white,
        letterSpacing: 0.5,
        width: '100%',
        textAlign: 'center',
    },
    generoNome: {
        fontSize: Typography.md,
        fontWeight: Typography.semibold,
        color: colors.white,
        marginTop: Spacing.xs,
        opacity: 0.9,
    },
    generoInfo: {
        padding: Spacing.lg,
    },
    generoInfoTablet: {
        flex: 1,
        justifyContent: 'center',
        paddingVertical: Spacing.md,
    },
    card: {
        marginBottom: Spacing.lg,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginBottom: Spacing.md,
    },
    sectionTitle: {
        fontSize: Typography.md,
        fontWeight: Typography.semibold,
        color: colors.textPrimary,
    },
    escolaNome: {
        fontSize: Typography.xl,
        fontWeight: '700' as const,
        color: colors.textPrimary,
        marginBottom: Spacing.xs,
    },
    escolaEndereco: {
        fontSize: Typography.sm,
        color: colors.textSecondary,
        marginBottom: Spacing.md,
    },
    divider: {
        height: 1,
        backgroundColor: colors.borderLight,
        marginVertical: Spacing.md,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    infoLabel: {
        fontSize: Typography.sm,
        color: colors.textSecondary,
    },
    infoValue: {
        fontSize: Typography.sm,
        fontWeight: Typography.medium,
        color: colors.textPrimary,
        textAlign: 'right',
        flex: 1,
        marginLeft: Spacing.md,
    },
    mapaButton: {
        marginTop: Spacing.md,
        padding: Spacing.md,
        backgroundColor: colors.infoLight,
        borderRadius: BorderRadius.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.sm,
    },
    mapaButtonOutline: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: colors.info,
        marginTop: Spacing.sm,
    },
    mapaText: {
        fontSize: Typography.sm,
        color: colors.info,
        fontWeight: Typography.semibold,
    },
    actionButton: {
    },
    footer: {
        padding: Spacing.xl,
        borderTopWidth: 1,
        borderTopColor: colors.borderLight,
        backgroundColor: colors.background,
    },
    parcialNotice: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        backgroundColor: colors.warningLight,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        borderLeftWidth: 3,
        borderLeftColor: colors.warning,
    },
    parcialNoticeText: {
        flex: 1,
        fontSize: Typography.sm,
        color: colors.textSecondary,
    },
    questionarioNotice: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        backgroundColor: colors.warningLight,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        borderLeftWidth: 3,
        borderLeftColor: colors.warning,
        marginBottom: Spacing.md,
    },
    questionarioNoticeText: {
        flex: 1,
        fontSize: Typography.sm,
        color: colors.textSecondary,
    },
    noGpsContainer: {
        alignItems: 'center',
        paddingVertical: Spacing.xl,
        opacity: 0.6,
        gap: Spacing.sm,
    },
    noGpsTitle: {
        fontSize: Typography.sm,
        fontWeight: Typography.semibold,
        color: colors.textSecondary,
    },
    noGpsText: {
        fontSize: Typography.xs,
        color: colors.textLight,
        textAlign: 'center',
        lineHeight: 18,
    },
});
