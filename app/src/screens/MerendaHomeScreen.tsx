import React, { useEffect, useCallback, useMemo, useReducer, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    RefreshControl,
    FlatList,
    Keyboard,
    Platform,
    UIManager,
    LayoutAnimation,
    Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    Hand,
    Search,
    Package,
    ChevronRight,
    Egg,
    Beef,
    Drumstick,
    Ham,
    Leaf,
    AlertTriangle
} from 'lucide-react-native';
import { Q } from '@nozbe/watermelondb';
import { syncData } from '../database/sync/syncService';
import { database } from '../database';
import { useTheme } from '../contexts/ThemeContext';
import { Typography, Spacing, BorderRadius, ThemeColors } from '../constants/theme';
import RippleCard from '../components/RippleCard';
import Badge from '../components/Badge';
import Skeleton from '../components/Skeleton';
import GenericModal from '../components/GenericModal';
import { addRecentGuia } from '../utils/recentGuias';
import { getEntregaBadgeProps } from '../utils/entregaStatusBadge';
import { useAutoSync } from '../hooks/useAutoSync';
import api from '../services/network';
import { useAuth } from '../contexts/AuthContext';
import SyncStatusBar from '../components/SyncStatusBar';
import type { ScreenProps, Entrega } from '../../App';
import { classifySyncError, classifyLocalError, reportError } from '../utils/syncError';
import { consumeInterruptedTransition, reportInterruptedTransition } from '../utils/transitionWatchdog';

type ActiveTab = 'atribuidas' | 'entregues';

interface HomeState {
    searchQuery: string;
    recentEntregas: Entrega[];
    entregasEntregues: Entrega[];
    activeTab: ActiveTab;
    refreshing: boolean;
    isLoading: boolean;
    isDbLoading: boolean;
    isSyncing: boolean;
    dbAvailable: boolean;
    isSearching: boolean;
    modalConfig: {
        visible: boolean;
        title: string;
        message: string;
        variant: 'success' | 'error' | 'warning' | 'info';
    };
}

type HomeAction =
    | { type: 'SET_SEARCH_QUERY'; payload: string }
    | { type: 'SET_RECENT_ENTREGAS'; payload: Entrega[] }
    | { type: 'SET_ENTREGAS_ENTREGUES'; payload: Entrega[] }
    | { type: 'SET_ALL_ENTREGAS'; payload: { atribuidas: Entrega[]; entregues: Entrega[] } }
    | { type: 'SET_ACTIVE_TAB'; payload: ActiveTab }
    | { type: 'SET_LOADING'; payload: boolean }
    | { type: 'SET_DB_LOADING'; payload: boolean }
    | { type: 'SET_SYNCING'; payload: boolean }
    | { type: 'SET_REFRESHING'; payload: boolean }
    | { type: 'SET_SEARCHING'; payload: boolean }
    | { type: 'SET_DB_AVAILABLE'; payload: boolean }
    | { type: 'SHOW_MODAL'; payload: Omit<HomeState['modalConfig'], 'visible'> }
    | { type: 'HIDE_MODAL' }
    | { type: 'RESET_SEARCH' };

const initialState: HomeState = {
    searchQuery: '',
    recentEntregas: [],
    entregasEntregues: [],
    activeTab: 'atribuidas',
    refreshing: false,
    isLoading: false,
    isDbLoading: true,
    isSyncing: false,
    dbAvailable: false,
    isSearching: false,
    modalConfig: {
        visible: false,
        title: '',
        message: '',
        variant: 'info',
    }
};

function homeReducer(state: HomeState, action: HomeAction): HomeState {
    switch (action.type) {
        case 'SET_SEARCH_QUERY':
            return { ...state, searchQuery: action.payload };
        case 'SET_RECENT_ENTREGAS':
            return { ...state, recentEntregas: action.payload, isLoading: false, isDbLoading: false, dbAvailable: true };
        case 'SET_ENTREGAS_ENTREGUES':
            return { ...state, entregasEntregues: action.payload };
        case 'SET_ALL_ENTREGAS':
            return { ...state, recentEntregas: action.payload.atribuidas, entregasEntregues: action.payload.entregues, isLoading: false, isDbLoading: false, dbAvailable: true };
        case 'SET_ACTIVE_TAB':
            return { ...state, activeTab: action.payload };
        case 'SET_LOADING':
            return { ...state, isLoading: action.payload };
        case 'SET_DB_LOADING':
            return { ...state, isDbLoading: action.payload };
        case 'SET_SYNCING':
            return { ...state, isSyncing: action.payload };
        case 'SET_REFRESHING':
            return { ...state, refreshing: action.payload };
        case 'SET_SEARCHING':
            return { ...state, isSearching: action.payload };
        case 'SET_DB_AVAILABLE':
            return { ...state, dbAvailable: action.payload };
        case 'SHOW_MODAL':
            return { ...state, modalConfig: { ...action.payload, visible: true } };
        case 'HIDE_MODAL':
            return { ...state, modalConfig: { ...state.modalConfig, visible: false } };
        case 'RESET_SEARCH':
            return { ...state, searchQuery: '', isSearching: false };
        default:
            return state;
    }
}

// Sub-componentes internos para clareza

// Banner animado — desliza de cima para baixo + fade ao aparecer
const AnimatedBanner: React.FC<{ colors: ThemeColors; styles: any }> = ({ colors, styles }) => {
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.spring(anim, {
            toValue: 1,
            useNativeDriver: true,
            friction: 7,
            tension: 60,
        }).start();
    }, [anim]);

    return (
        <Animated.View
            style={[
                styles.mockBanner,
                {
                    opacity: anim,
                    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
                },
            ]}
        >
            <Text style={styles.mockBannerText}>
                Banco local não sincronizado. Verifique sua conexão com a internet.
            </Text>
        </Animated.View>
    );
};

// Ícone do gênero para usar nos cards compactos (tamanho 20)
const getGeneroIconSmall = (genero: string, color: string) => {
    const gen = (genero || '').toLowerCase();
    const size = 20;
    if (gen.includes('frango')) return <Drumstick color={color} size={size} />;
    if (gen.includes('ovo')) return <Egg color={color} size={size} />;
    if (gen.includes('lombo') || gen.includes('suín') || gen.includes('porco')) return <Ham color={color} size={size} />;
    if (gen.includes('carne') || gen.includes('bov') || gen.includes('moid') || gen.includes('moíd')) return <Beef color={color} size={size} />;
    if (gen.includes('flv') || gen.includes('fruta') || gen.includes('verdura') || gen.includes('legume')) return <Leaf color={color} size={size} />;
    return <Package color={color} size={size} />;
};

// Cor de fundo do ícone por gênero (mesma lógica da tela de Detalhes)
const getGeneroColor = (genero: string, colors: ThemeColors): string => {
    const gen = (genero || '').toLowerCase();
    if (gen.includes('ovo') || gen === '1') return colors.generoOvo;
    if (gen.includes('carne') || gen.includes('bov') || gen.includes('moíd') || gen.includes('moid') || gen === '2') return colors.generoCarne;
    if (gen.includes('frango') || gen === '3') return colors.generoFrango;
    if (gen.includes('lombo') || gen.includes('suín') || gen.includes('porco') || gen === '4') return colors.generoLombo;
    if (gen.includes('flv') || gen.includes('fruta') || gen.includes('verdura') || gen.includes('legume')) return '#66BB6A';
    return colors.warning;
};

// Card de item recente com fade + slide animado por índice
const AnimatedRecentCard: React.FC<{ index: number; children: React.ReactNode }> = ({ children }) => {
    return (
        <View style={{ marginBottom: 2 }}>
            {children}
        </View>
    );
};

function formatLastSync(date: Date | null): string {
    if (!date) return '';
    const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
    if (diffMin < 1) return 'Atualizado agora';
    if (diffMin < 60) return `Atualizado há ${diffMin} min`;
    return `Atualizado há ${Math.floor(diffMin / 60)}h`;
}

interface HomeHeaderProps {
    colors: ThemeColors;
    styles: any;
    onPerfilPress: () => void;
    userName?: string;
    fullName?: string;
    lastSyncAt: Date | null;
}

const HomeHeader: React.FC<HomeHeaderProps> = ({ colors, styles, onPerfilPress, userName, fullName, lastSyncAt }) => (
    <View style={styles.header}>
        <View>
            <View style={styles.greetingRow}>
                <Text style={styles.greeting}>Olá, {userName || 'Motorista'}!</Text>
            </View>
            <Text style={styles.subtitle}>Pronto para sua próxima entrega?</Text>
            {lastSyncAt && (
                <Text style={{ fontSize: 11, color: colors.textLight, marginTop: 2 }}>
                    {formatLastSync(lastSyncAt)}
                </Text>
            )}
        </View>
        <TouchableOpacity style={styles.perfilButton} onPress={onPerfilPress}>
            <Text style={styles.perfilButtonText}>
                {fullName
                    ? fullName.trim().split(/\s+/).slice(0, 2).map(n => n[0].toUpperCase()).join('')
                    : 'U'}
            </Text>
        </TouchableOpacity>
    </View>
);

interface SearchSectionProps {
    colors: ThemeColors;
    styles: any;
    searchQuery: string;
    setSearchQuery: (val: string) => void;
    onSearch: () => void;
    isSearching: boolean;
}

const SearchSection: React.FC<SearchSectionProps> = ({ colors, styles, searchQuery, setSearchQuery, onSearch, isSearching }) => (
    <View style={styles.searchSection}>
        <Text style={styles.sectionTitle}>Localizar Guia</Text>
        <View style={styles.searchContainer}>
            <View style={styles.inputWrapper}>
                <Search color={colors.textLight} size={20} style={styles.searchIcon} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Digite o número da guia..."
                    placeholderTextColor={colors.textLight}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    keyboardType="numeric"
                    returnKeyType="search"
                    onSubmitEditing={onSearch}
                />
            </View>
            <TouchableOpacity
                style={[styles.searchButton, isSearching && { opacity: 0.7 }]}
                onPress={onSearch}
                disabled={isSearching}
            >
                {isSearching ? (
                    <ActivityIndicator color={colors.white} size="small" />
                ) : (
                    <Text style={styles.searchButtonText}>Buscar</Text>
                )}
            </TouchableOpacity>
        </View>
    </View>
);

function sortEntregues(items: Entrega[]): Entrega[] {
    return [...items].sort((a, b) => {
        // parcial primeiro (ainda precisa de atenção), depois concluída
        if (a.status === 'parcial' && b.status !== 'parcial') return -1;
        if (b.status === 'parcial' && a.status !== 'parcial') return 1;
        // dentro do mesmo status, mais recente primeiro
        const dateA = a.data_hora_entrega ? new Date(a.data_hora_entrega).getTime() : 0;
        const dateB = b.data_hora_entrega ? new Date(b.data_hora_entrega).getTime() : 0;
        return dateB - dateA;
    });
}

function sortAssignedGuias(items: Entrega[]): Entrega[] {
    const guiaNum = (e: Entrega): number => parseInt(String(e.numGuia), 10) || 0;
    const groupScore = (e: Entrega): number => {
        // Etapa 2 pendente: aparecem primeiro — o motorista já iniciou, precisa concluir
        if (e.status === 'aguardando_questionario') return 0;
        if (e.prioridade && e.status === 'pendente') return 1;
        return 2;
    };
    return [...items].sort((a, b) => {
        const gs = groupScore(a) - groupScore(b);
        if (gs !== 0) return gs;
        return guiaNum(a) - guiaNum(b);
    });
}

function MerendaHomeScreen({ navigation }: ScreenProps<'Home'>) {
    const { colors } = useTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const { user } = useAuth();

    // Nome de exibição: primeiro nome do campo "nome", ou username como fallback
    const firstName = user?.nome
        ? user.nome.split(' ')[0]
        : user?.username || 'Motorista';
    const fullName = user?.nome || user?.username || 'Motorista';

    const { isSyncing: isAutoSyncing, lastSyncAt, isOnline } = useAutoSync();

    // Home é o "porto seguro" da navegação (route index 0 em todo navigation.reset
    // do app) — se uma transição marcada em RegistroEntrega/RegistroQuestionario
    // nunca chegou a ser confirmada pela tela de destino, é porque algo
    // interrompeu o processo no meio (crash nativo do
    // RNScreens). Detecta e reporta isso aqui, já que o próprio crash não é
    // capturável via try/catch nem Error Boundary.
    useEffect(() => {
        consumeInterruptedTransition().then((pending) => {
            if (pending) reportInterruptedTransition(pending);
        }).catch(() => {});
    }, []);

    const [state, dispatch] = useReducer(homeReducer, initialState);
    const { searchQuery, recentEntregas, entregasEntregues, activeTab, refreshing, isLoading, isDbLoading, isSyncing, dbAvailable, isSearching, modalConfig } = state;

    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
    }

    const mapRecordToEntrega = useCallback(async (r: any, generosMap: Map<string, string>, escolasMap: Map<string, any>) => {
        const nomeSimples = generosMap.get(String(r.id_genero));
        let escolaDados = escolasMap.get(String(r.cod_escola).trim());

        if (!escolaDados && database) {
            try {
                const found = await database.get('escolas').query(
                    Q.where('cod_escola', String(r.cod_escola))
                ).fetch();
                if (found.length > 0) {
                    const e2 = found[0] as any;
                    escolaDados = {
                        nome: e2.nome_escola || '',
                        municipio: e2.municipio || '',
                        endereco: e2.endereco || '',
                        gre: e2.gre || '',
                    };
                    escolasMap.set(String(r.cod_escola).trim(), escolaDados);
                } else {
                    // Sem escola encontrada — mantém fallback.
                }
            } catch (err) {
                // Ignora erro e usa fallback.
            }
        }

        return {
            id: r.id,
            numGuia: r.num_guia,
            escola: r.cod_escola,
            nomeEscola: escolaDados?.nome || r.cod_escola,
            municipio: escolaDados?.municipio || '',
            endereco: escolaDados?.endereco || 'Endereço não disponível',
            gre: escolaDados?.gre || '',
            genero: nomeSimples || r.produto_enviado || 'Geral',
            qtdEnviada: r.qtd_enviada,
            status: r.status,
            dtPrevisao: r.dt_previsao ? new Date(r.dt_previsao).toISOString() : '',
            data_hora_entrega: r.data_hora_entrega ? new Date(r.data_hora_entrega).toISOString() : undefined,
            dt_entregue: r.dt_entregue ? new Date(r.dt_entregue).toISOString() : undefined,
            latitude: r.latitude != null ? Number(r.latitude) : null,
            longitude: r.longitude != null ? Number(r.longitude) : null,
            prioridade: !!r.prioridade,
            emergencial: !!r.emergencial,
            data_prevista_fornecedor: r.data_prevista_fornecedor ? new Date(r.data_prevista_fornecedor).toISOString() : undefined,
            data_antecipacao: r.data_antecipacao ? new Date(r.data_antecipacao).toISOString() : undefined,
            data_prorrogacao: r.data_prorrogacao ? new Date(r.data_prorrogacao).toISOString() : undefined,
            dt_inicio_cronograma: r.dt_inicio_cronograma ? new Date(r.dt_inicio_cronograma).toISOString() : undefined,
            tipo_entrega: r.tipo_entrega as 'Total' | 'Parcial' | undefined,
        };
    }, []);

    // Subscription reativa: atualiza automaticamente quando o WatermelonDB muda
    // (ex: após sync), e re-assina quando user.id_motorista fica disponível.
    useEffect(() => {
        const idMotorista = user?.id_motorista;

        if (!database || !idMotorista) {
            dispatch({ type: 'SET_RECENT_ENTREGAS', payload: [] });
            return;
        }

        const db = database; // variável local garante não-nulo para o TypeScript
        const generosMap = new Map<string, string>();
        const escolasMap = new Map<string, any>();
        let subscription: { unsubscribe: () => void } | null = null;

        const setup = async () => {
            try {
                const [generosRecords, escolasRecords] = await Promise.all([
                    db.get('generos').query().fetch(),
                    db.get('escolas').query().fetch(),
                ]);

                (generosRecords as any[]).forEach(g =>
                    generosMap.set(String(g.id_genero), g.nome_genero)
                );
                (escolasRecords as any[]).forEach(e => {
                    escolasMap.set(String(e.cod_escola).trim(), {
                        nome: e.nome_escola || '',
                        municipio: e.municipio || '',
                        endereco: e.endereco || '',
                        gre: e.gre || '',
                    });
                });

                subscription = db
                    .get('entregas')
                    .query(
                        Q.where('id_motorista', idMotorista),
                        Q.where('status', Q.oneOf(['pendente', 'parcial', 'concluida', 'aguardando_questionario']))
                    )
                    .observe()
                    .subscribe(async (records) => {
                        const mapped = await Promise.all(
                            (records as any[]).map(r =>
                                mapRecordToEntrega(r, generosMap, escolasMap)
                            )
                        );
                        const atribuidas = sortAssignedGuias(mapped.filter(e => e.status === 'pendente' || e.status === 'aguardando_questionario'));
                        const entregues = sortEntregues(mapped.filter(e => e.status === 'parcial' || e.status === 'concluida'));
                        dispatch({ type: 'SET_ALL_ENTREGAS', payload: { atribuidas, entregues } });
                    });
            } catch (error) {
                console.warn('[Home] Erro ao observar guias:', error);
                reportError(error, 'home_observe_setup');
                dispatch({ type: 'SET_DB_AVAILABLE', payload: false });
                dispatch({ type: 'SET_DB_LOADING', payload: false });
            }
        };

        setup();
        return () => { subscription?.unsubscribe(); };
    }, [user?.id_motorista, mapRecordToEntrega]);

    const handleSearch = async () => {
        const query = searchQuery.trim();

        if (!query) {
            dispatch({
                type: 'SHOW_MODAL',
                payload: {
                    title: 'Campo Vazio',
                    message: 'Por favor, digite o número da guia para pesquisar.',
                    variant: 'warning',
                }
            });
            return;
        }

        // Aceita apenas dígitos para evitar URL malformada na busca remota
        if (!/^\d+$/.test(query)) {
            dispatch({
                type: 'SHOW_MODAL',
                payload: {
                    title: 'Número Inválido',
                    message: 'O número da guia deve conter apenas dígitos.',
                    variant: 'warning',
                }
            });
            return;
        }

        Keyboard.dismiss();
        dispatch({ type: 'SET_SEARCHING', payload: true });

        try {
            if (!database) throw new Error('Banco de dados não disponível');

            const results = await database.get('entregas').query(
                Q.where('num_guia', query)
            ).fetch();

            let entregaCompleta: Entrega;

            if (results.length > 0) {
                const r = results[0] as any;
                const [generosResult, escolaResult] = await Promise.all([
                    database.get('generos').query(Q.where('id_genero', String(r.id_genero))).fetch(),
                    database.get('escolas').query(Q.where('cod_escola', String(r.cod_escola))).fetch()
                ]);
                const g = generosResult[0] as any;
                const e = escolaResult[0] as any;
                entregaCompleta = await mapRecordToEntrega(
                    r,
                    new Map([[String(r.id_genero), g?.nome_genero || '']]),
                    new Map([[String(r.cod_escola).trim(), {
                        nome: e?.nome_escola || '',
                        municipio: e?.municipio || '',
                        endereco: e?.endereco || '',
                        gre: e?.gre || '',
                    }]])
                );
            } else {
                // Fallback: busca no servidor — cobre guias concluídas fora da janela de sync
                try {
                    const { data: resp } = await api.get(`mobile/guias/${query}`, { timeout: 10000 });
                    const row = resp?.data;
                    if (!row) throw new Error('vazio');
                    entregaCompleta = await mapRecordToEntrega(row, new Map(), new Map());
                } catch (serverErr: any) {
                    const isNotFound = serverErr?.response?.status === 404;
                    if (!isNotFound) reportError(serverErr, 'search_guia_fallback_servidor', { query });
                    dispatch({
                        type: 'SHOW_MODAL',
                        payload: {
                            title: 'Guia não encontrada',
                            message: isNotFound
                                ? `Guia "${query}" não existe ou você não tem acesso a ela.`
                                : `Não encontramos a guia "${query}" localmente e não foi possível buscá-la no servidor.`,
                            variant: 'error',
                        }
                    });
                    return;
                }
            }

            addRecentGuia(entregaCompleta.id).catch(() => {});
            navigation.navigate('EntregaDetalhes', { entrega: entregaCompleta });
            dispatch({ type: 'RESET_SEARCH' });
        } catch (error) {
            reportError(error, 'search_guia');
            const { title, message } = classifyLocalError(error);
            dispatch({
                type: 'SHOW_MODAL',
                payload: { title, message, variant: 'error' }
            });
        } finally {
            dispatch({ type: 'SET_SEARCHING', payload: false });
        }
    };

    const onRefresh = async () => {
        dispatch({ type: 'SET_REFRESHING', payload: true });
        dispatch({ type: 'SET_SYNCING', payload: true });
        try {
            await syncData();
        } catch (error: any) {
            reportError(error, 'pull_to_refresh');
            const { title, message } = classifySyncError(error);
            dispatch({
                type: 'SHOW_MODAL',
                payload: {
                    title,
                    message,
                    variant: 'warning',
                }
            });
        } finally {
            dispatch({ type: 'SET_SYNCING', payload: false });
            dispatch({ type: 'SET_REFRESHING', payload: false });
        }
    };

    const renderRecentItem = useCallback(({ item, index }: { item: Entrega; index: number }) => {
        const isEntregue = item.status === 'concluida' || item.status === 'parcial';
        return (
            <AnimatedRecentCard index={index}>
                <RippleCard
                    onPress={() => {
                        addRecentGuia(item.id).catch(() => {});
                        navigation.navigate('EntregaDetalhes', { entrega: item });
                    }}
                    style={[
                        styles.recentCard,
                        item.status === 'aguardando_questionario' && styles.recentCardQuestionario,
                        (!isEntregue && item.prioridade) && styles.recentCardPriority,
                    ]}
                >
                    <View style={styles.recentInfo}>
                        <View style={[styles.recentIcon, { backgroundColor: getGeneroColor(item.genero || '', colors) }]}>
                            {getGeneroIconSmall(item.genero || '', colors.white)}
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            {/* Linha 1: número da guia + emergencial — sempre curta e limpa */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text
                                    style={[styles.recentNumGuia, (!isEntregue && item.prioridade) && { color: '#92400e' }]}
                                    numberOfLines={1}
                                >
                                    Guia {item.numGuia}
                                </Text>
                                {!isEntregue && item.emergencial && (
                                    <View style={{ backgroundColor: '#e11d48', borderRadius: 4, padding: 2, flexShrink: 0 }}>
                                        <AlertTriangle color="#fff" size={12} />
                                    </View>
                                )}
                            </View>
                            {/* Linha 1.5: status — linha própria, com espaço de sobra pra rótulos longos */}
                            <View style={{ alignSelf: 'flex-start', marginTop: 4, marginBottom: 2 }}>
                                <Badge {...getEntregaBadgeProps(item)} />
                            </View>
                            {/* Linha 2: nome da escola */}
                            <Text style={[styles.recentEscola, (!isEntregue && item.prioridade) && { color: '#374151' }]} numberOfLines={1}>
                                {item.nomeEscola}
                            </Text>
                            {/* Linha 3: gênero / município */}
                            {item.genero ? <Text style={styles.recentGenero}>{item.genero}</Text> : null}
                            {isEntregue && item.data_hora_entrega ? (
                                <Text style={styles.recentDataEntrega}>
                                    Entregue em {new Date(item.data_hora_entrega).toLocaleDateString('pt-BR')}
                                </Text>
                            ) : null}
                            {!isEntregue && (item.data_prorrogacao || item.data_antecipacao) && (
                                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.warning, marginTop: 2 }}>
                                    PRAZO ATUALIZADO: {new Date(item.data_prorrogacao || item.data_antecipacao!).toLocaleDateString('pt-BR')}
                                </Text>
                            )}
                            {item.status === 'aguardando_questionario' && (
                                <Text style={styles.questionarioLabel}>Etapa 2 pendente</Text>
                            )}
                            {!isEntregue && item.prioridade && (
                                <Text style={styles.priorityLabel}>PRIORITÁRIA</Text>
                            )}
                        </View>
                        <ChevronRight color={colors.textLight} size={20} style={{ flexShrink: 0 }} />
                    </View>
                </RippleCard>
            </AnimatedRecentCard>
        );
    }, [colors, navigation, styles]);

    if (isLoading) {
        return <Skeleton width="100%" height="100%" />;
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <HomeHeader colors={colors} styles={styles} onPerfilPress={() => navigation.navigate('Perfil')} userName={firstName} fullName={fullName} lastSyncAt={lastSyncAt} />
            <SyncStatusBar isOnline={isOnline} isSyncing={isAutoSyncing} lastSyncAt={lastSyncAt} />

            <SearchSection
                colors={colors}
                styles={styles}
                searchQuery={searchQuery}
                setSearchQuery={(val) => dispatch({ type: 'SET_SEARCH_QUERY', payload: val })}
                onSearch={handleSearch}
                isSearching={isSearching}
            />

            <View style={styles.recentSection}>
                {/* Abas */}
                <View style={styles.tabBar}>
                    <TouchableOpacity
                        style={[styles.tabButton, activeTab === 'atribuidas' && styles.tabButtonActive]}
                        onPress={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: 'atribuidas' })}
                        activeOpacity={0.8}
                    >
                        <Text style={[styles.tabButtonText, activeTab === 'atribuidas' && styles.tabButtonTextActive]}>
                            Atribuídas
                        </Text>
                        {!isDbLoading && recentEntregas.length > 0 && (
                            <View style={[styles.tabBadge, activeTab === 'atribuidas' && styles.tabBadgeActive]}>
                                <Text style={[styles.tabBadgeText, activeTab === 'atribuidas' && styles.tabBadgeTextActive]}>
                                    {recentEntregas.length}
                                </Text>
                            </View>
                        )}
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tabButton, activeTab === 'entregues' && styles.tabButtonActive]}
                        onPress={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: 'entregues' })}
                        activeOpacity={0.8}
                    >
                        <Text style={[styles.tabButtonText, activeTab === 'entregues' && styles.tabButtonTextActive]}>
                            Entregues
                        </Text>
                        {!isDbLoading && entregasEntregues.length > 0 && (
                            <View style={[styles.tabBadge, activeTab === 'entregues' && styles.tabBadgeActive]}>
                                <Text style={[styles.tabBadgeText, activeTab === 'entregues' && styles.tabBadgeTextActive]}>
                                    {entregasEntregues.length}
                                </Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>

                <FlatList
                    key={activeTab}
                    data={activeTab === 'atribuidas' ? recentEntregas : entregasEntregues}
                    renderItem={renderRecentItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.recentList}
                    ListEmptyComponent={
                        isDbLoading ? (
                            <View>
                                {[1, 2, 3].map(i => (
                                    <View key={i} style={[styles.recentCard, { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }]}>
                                        <Skeleton width={40} height={40} style={{ borderRadius: 8 }} />
                                        <View style={{ flex: 1, gap: 6 }}>
                                            <Skeleton width="70%" height={14} variant="text" />
                                            <Skeleton width="45%" height={12} variant="text" />
                                        </View>
                                        <Skeleton width={70} height={22} style={{ borderRadius: 12 }} />
                                    </View>
                                ))}
                            </View>
                        ) : (
                            <View style={styles.emptyRecent}>
                                <Package color={colors.border} size={48} />
                                <Text style={styles.emptyRecentText}>
                                    {activeTab === 'atribuidas'
                                        ? 'Nenhuma guia pendente atribuída a você'
                                        : 'Nenhuma entrega registrada ainda'}
                                </Text>
                            </View>
                        )
                    }
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing || isAutoSyncing}
                            onRefresh={onRefresh}
                            tintColor={colors.primary}
                        />
                    }
                />
            </View>

            {!dbAvailable && (
                <AnimatedBanner colors={colors} styles={styles} />
            )}

            <GenericModal
                visible={modalConfig.visible}
                title={modalConfig.title}
                message={modalConfig.message}
                variant={modalConfig.variant}
                confirmText="Entendi"
                onConfirm={() => dispatch({ type: 'HIDE_MODAL' })}
            />

        </SafeAreaView>
    );
}

export default MerendaHomeScreen;

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
    greetingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    greeting: {
        fontSize: Typography.xl,
        fontWeight: Typography.bold,
        color: colors.textPrimary,
    },
    subtitle: {
        fontSize: Typography.sm,
        color: colors.textSecondary,
        marginTop: Spacing.xs,
    },
    perfilButton: {
        width: 48,
        height: 48,
        borderRadius: BorderRadius.full,
        backgroundColor: colors.warning,
        alignItems: 'center',
        justifyContent: 'center',
    },
    perfilButtonText: {
        fontSize: Typography.sm,
        fontWeight: Typography.bold,
        color: colors.white,
        letterSpacing: 1,
    },
    mockBanner: {
        backgroundColor: colors.warningLight,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.xl,
        marginHorizontal: Spacing.xl,
        marginBottom: Spacing.md,
        borderRadius: BorderRadius.md,
        borderLeftWidth: 4,
        borderLeftColor: colors.warning,
    },
    mockBannerText: {
        fontSize: Typography.xs,
        color: '#E65100',
        fontWeight: Typography.semibold,
    },
    searchSection: {
        paddingHorizontal: Spacing.xl,
        marginBottom: Spacing.xl,
    },
    sectionTitle: {
        fontSize: Typography.md,
        fontWeight: Typography.bold,
        color: colors.textPrimary,
        marginBottom: Spacing.md,
    },
    searchContainer: {
        flexDirection: 'row',
        gap: Spacing.md,
    },
    inputWrapper: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.cardBackground,
        borderRadius: BorderRadius.lg,
        paddingHorizontal: Spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    searchIcon: {
        marginRight: Spacing.xs,
    },
    searchInput: {
        flex: 1,
        height: 50,
        fontSize: Typography.base,
        color: colors.textPrimary,
    },
    searchButton: {
        backgroundColor: colors.primary,
        borderRadius: BorderRadius.lg,
        paddingHorizontal: Spacing.xl,
        justifyContent: 'center',
        alignItems: 'center',
    },
    searchButtonText: {
        color: colors.white,
        fontSize: Typography.base,
        fontWeight: Typography.bold,
    },
    recentSection: {
        flex: 1,
        paddingHorizontal: Spacing.xl,
    },
    tabBar: {
        flexDirection: 'row',
        backgroundColor: colors.borderLight,
        borderRadius: BorderRadius.lg,
        padding: 3,
        marginBottom: Spacing.md,
        gap: 3,
    },
    tabButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.md,
        gap: Spacing.xs,
    },
    tabButtonActive: {
        backgroundColor: colors.cardBackground,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
        elevation: 2,
    },
    tabButtonText: {
        fontSize: Typography.sm,
        fontWeight: Typography.semibold,
        color: colors.textLight,
    },
    tabButtonTextActive: {
        color: colors.primary,
        fontWeight: Typography.bold,
    },
    tabBadge: {
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 5,
    },
    tabBadgeActive: {
        backgroundColor: colors.primary,
    },
    tabBadgeText: {
        fontSize: 11,
        fontWeight: '700' as const,
        color: colors.textLight,
    },
    tabBadgeTextActive: {
        color: colors.white,
    },
    recentHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.sm,
    },
    recentList: {
        paddingBottom: Spacing.xl,
    },
    recentCard: {
        marginBottom: Spacing.sm,
        padding: Spacing.md,
    },
    recentCardQuestionario: {
        borderLeftWidth: 4,
        borderLeftColor: '#f97316',
        backgroundColor: '#fff7ed',
        shadowColor: '#f97316',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
        elevation: 2,
    },
    questionarioLabel: {
        marginTop: 4,
        fontSize: 11,
        fontWeight: '800' as const,
        letterSpacing: 1,
        color: '#c2410c',
        backgroundColor: '#ffedd5',
        alignSelf: 'flex-start',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        overflow: 'hidden' as const,
    },
    recentCardPriority: {
        borderLeftWidth: 4,
        borderLeftColor: '#f59e0b',
        backgroundColor: '#fffbeb',
        shadowColor: '#f59e0b',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    priorityLabel: {
        marginTop: 4,
        fontSize: 11,
        fontWeight: '800' as const,
        letterSpacing: 1,
        color: '#b45309',
        backgroundColor: '#fef3c7',
        alignSelf: 'flex-start',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        textTransform: 'uppercase' as const,
        overflow: 'hidden',
    },
    recentInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    recentIcon: {
        width: 40,
        height: 40,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    recentNumGuia: {
        fontSize: Typography.xl,
        fontWeight: '800' as const,
        color: colors.textPrimary,
        letterSpacing: 0.2,
        flexShrink: 1,
    },
    recentEscola: {
        fontSize: Typography.base,
        fontWeight: '500' as const,
        color: colors.textSecondary,
        marginTop: 2,
    },
    recentGenero: {
        fontSize: Typography.xs,
        color: colors.textLight,
        marginTop: 1,
    },
    recentDataEntrega: {
        fontSize: Typography.xs,
        color: colors.textLight,
        marginTop: 2,
    },
    emptyRecent: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: Spacing.xxl,
        opacity: 0.5,
    },
    emptyRecentText: {
        marginTop: Spacing.md,
        fontSize: Typography.sm,
        color: colors.textSecondary,
    },
    overlayContainer: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    overlayContent: {
        backgroundColor: colors.cardBackground,
        padding: Spacing.xxl,
        borderRadius: BorderRadius.xl,
        alignItems: 'center',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    overlayText: {
        marginTop: Spacing.md,
        fontSize: Typography.md,
        fontWeight: Typography.bold,
        color: colors.textPrimary,
    },
    overlaySubtext: {
        marginTop: Spacing.xs,
        fontSize: Typography.xs,
        color: colors.textSecondary,
    },
});
