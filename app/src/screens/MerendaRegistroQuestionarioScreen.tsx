import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Image,
    Platform,
    BackHandler,
    Vibration,
    ActivityIndicator,
    InteractionManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import { Camera, Check, ClipboardCheck, FileText, X, Zap, ZapOff } from 'lucide-react-native';
import * as Location from 'expo-location';
import * as Sentry from '@sentry/react-native';
import { markTransitionRisk, clearTransitionRisk } from '../utils/transitionWatchdog';
import NetInfo from '@react-native-community/netinfo';
import Card from '../components/Card';
import Button from '../components/Button';
import GenericModal from '../components/GenericModal';
import { Typography, Spacing, BorderRadius, ThemeColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { database } from '../database';
import { syncData, saveDeliveryBackup, loadDeliveryBackup } from '../database/sync/syncService';
import { persistFotoUri } from '../utils/persistFoto';
import { getDeviceId } from '../utils/deviceId';
import type { ScreenProps } from '../../App';
import { useAuth } from '../contexts/AuthContext';
import { classifyLocalError, reportError } from '../utils/syncError';
import { findEntregaRecordSafe } from '../database/sync/entregaLookup';

let DocumentScanner: any = null;
if (Platform.OS !== 'web') {
    try {
        DocumentScanner = require('react-native-document-scanner-plugin').default;
    } catch (e) {}
}

export default function MerendaRegistroQuestionarioScreen({ route, navigation }: ScreenProps<'RegistroQuestionario'>) {
    const { colors } = useTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const { entrega, fotoGuia, tipoEntrega = 'Total' } = route.params;
    const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions();
    const warmGpsRef = useRef<{ coords: Location.LocationObjectCoords; at: number } | null>(null);

    // Chegou até aqui: a transição vinda de RegistroEntrega completou normalmente
    // (ver transitionWatchdog).
    useEffect(() => {
        clearTransitionRisk().catch(() => {});
    }, []);

    useEffect(() => {
        if (!locationPermission?.granted) return;
        let cancelled = false;
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
            .then(loc => { if (!cancelled) warmGpsRef.current = { coords: loc.coords, at: Date.now() }; })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [locationPermission?.granted]);

    const { user } = useAuth();
    const ownershipConfirmedRef = useRef(false);

    const [fotoUri, setFotoUri] = useState<string | null>(null);
    const [showCamera, setShowCamera] = useState(false);
    const [previewUri, setPreviewUri] = useState<string | null>(null);
    const [questionarioLegivel, setQuestionarioLegivel] = useState(false);
    const [isConnected, setIsConnected] = useState(true);
    useEffect(() => {
        return NetInfo.addEventListener(state => {
            setIsConnected(!!state.isConnected && state.isInternetReachable !== false);
        });
    }, []);

    const [loading, setLoading] = useState(false);
    const [scannerBusy, setScannerBusy] = useState(false);

    const [facing] = useState<CameraType>('back');
    const [torchEnabled, setTorchEnabled] = useState(false);
    const cameraRef = React.useRef<CameraView>(null);
    const [permission, requestPermission] = useCameraPermissions();

    const [modalConfig, setModalConfig] = useState({
        visible: false,
        title: '',
        message: '',
        variant: 'info' as 'success' | 'error' | 'warning' | 'info',
        confirmText: 'OK',
        cancelText: undefined as string | undefined,
        onConfirm: () => {},
        onCancel: undefined as (() => void) | undefined,
    });

    const handleCancel = useCallback(() => {
        setModalConfig({
            visible: true,
            title: 'Sair sem completar?',
            message: 'O questionário ainda não foi registrado. Você poderá finalizar depois pela lista de entregas, mas a guia ficará pendente.',
            variant: 'warning',
            confirmText: 'Sair mesmo assim',
            cancelText: 'Continuar',
            onConfirm: () => { setModalConfig(p => ({ ...p, visible: false })); navigation.goBack(); },
            onCancel: () => setModalConfig(p => ({ ...p, visible: false })),
        });
    }, [navigation]);

    useEffect(() => {
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            if (showCamera) {
                setShowCamera(false);
                return true;
            }
            if (!loading) {
                handleCancel();
                return true;
            }
            return true;
        });
        return () => sub.remove();
    }, [showCamera, loading, handleCancel]);

    const statusFinal = tipoEntrega === 'Parcial' ? 'parcial' : 'concluida';

    const handleSuccessClose = () => {
        setModalConfig(prev => ({ ...prev, visible: false }));
        markTransitionRisk('RegistroQuestionario', 'EntregaDetalhes', entrega.numGuia).catch(() => {});
        Sentry.addBreadcrumb({
            category: 'navigation',
            message: `navigation.reset RegistroQuestionario → EntregaDetalhes (guia ${entrega.numGuia})`,
            level: 'info',
        });
        InteractionManager.runAfterInteractions(() => {
            navigation.reset({
                index: 1,
                routes: [
                    { name: 'Home' },
                    { name: 'EntregaDetalhes', params: { entrega: { ...entrega, status: statusFinal } } },
                ],
            });
        });
    };

    const handleOpenCamera = async () => {
        if (!permission?.granted) {
            const { granted } = await requestPermission();
            if (!granted) {
                setModalConfig({
                    visible: true,
                    title: 'Permissão necessária',
                    message: 'Precisamos de acesso à câmera para fotografar o questionário.',
                    variant: 'warning',
                    confirmText: 'OK',
                    cancelText: undefined,
                    onConfirm: () => setModalConfig(prev => ({ ...prev, visible: false })),
                    onCancel: undefined,
                });
                return;
            }
        }
        setShowCamera(true);
    };

    const handleScanDocument = async () => {
        if (scannerBusy) return;
        setScannerBusy(true);
        try {
            const result = await DocumentScanner.scanDocument({
                croppedImageQuality: 80,
                maxNumDocuments: 1,
                letUserAdjustCrop: true,
            });
            if (result?.scannedImages?.length > 0) {
                const uri = await persistFotoUri(result.scannedImages[0], entrega.numGuia, 'questionario');
                setFotoUri(uri);
            }
        } catch {
            handleOpenCamera();
        } finally {
            setScannerBusy(false);
        }
    };

    const takePicture = async () => {
        if (cameraRef.current) {
            try {
                const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, base64: false });
                if (photo) {
                    setPreviewUri(photo.uri);
                    setQuestionarioLegivel(false);
                }
            } catch {
                setModalConfig({
                    visible: true,
                    title: 'Erro',
                    message: 'Não foi possível capturar a foto.',
                    variant: 'error',
                    confirmText: 'OK',
                    cancelText: undefined,
                    onConfirm: () => setModalConfig(prev => ({ ...prev, visible: false })),
                    onCancel: undefined,
                });
            }
        }
    };

    const handleConfirmPreview = async () => {
        if (previewUri && questionarioLegivel) {
            const uri = await persistFotoUri(previewUri, entrega.numGuia, 'questionario');
            setFotoUri(uri);
            setPreviewUri(null);
            setShowCamera(false);
        }
    };

    const handleRetake = () => {
        setPreviewUri(null);
        setQuestionarioLegivel(false);
    };

    const handleConfirmar = async () => {
        if (
            !ownershipConfirmedRef.current &&
            entrega.id_motorista &&
            user?.id_motorista &&
            entrega.id_motorista !== user.id_motorista
        ) {
            setModalConfig({
                visible: true,
                title: 'Guia de outro motorista',
                message: 'Esta guia está atribuída a outro motorista. Tem certeza que quer registrar o questionário?',
                variant: 'warning',
                confirmText: 'Continuar',
                cancelText: 'Cancelar',
                onConfirm: () => {
                    ownershipConfirmedRef.current = true;
                    setModalConfig(prev => ({ ...prev, visible: false }));
                    handleConfirmar();
                },
                onCancel: () => setModalConfig(prev => ({ ...prev, visible: false })),
            });
            return;
        }

        if (!fotoUri) {
            setModalConfig({
                visible: true,
                title: 'Atenção',
                message: 'Por favor, tire uma foto do questionário preenchido.',
                variant: 'warning',
                confirmText: 'OK',
                cancelText: undefined,
                onConfirm: () => setModalConfig(prev => ({ ...prev, visible: false })),
                onCancel: undefined,
            });
            return;
        }

        setLoading(true);
        try {
            // GPS: usa coords pré-aquecidas imediatamente. Se não houver, refina em background após salvar.
            const warmCoords = locationPermission?.granted ? warmGpsRef.current?.coords ?? null : null;
            const deviceId = await getDeviceId();

            if (database) {
                console.time('[Questionario] database.write');
                await database.write(async () => {
                    const entregaRecord = await findEntregaRecordSafe(database, entrega.id, entrega.numGuia);
                    await entregaRecord.update((r: any) => {
                        // Dados da Tela 1 (foto da guia + localização)
                        // fotoGuia é undefined quando o motorista volta para registrar só o
                        // questionário (estado aguardando_questionario). Nesse caso preserva
                        // a foto da guia já existente no banco — sobrescrever com null
                        // quebraria o push (backend rejeita guia sem foto).
                        if (fotoGuia !== undefined) r.foto = fotoGuia ?? null;
                        // GPS: só atualiza se obteve fix E o campo ainda está vazio.
                        // Prioridade para a leitura da Etapa 1 (na escola no momento da entrega).
                        if (warmCoords && !r.latitude) {
                            r.latitude = warmCoords.latitude;
                            r.longitude = warmCoords.longitude;
                        }
                        // Preserva o timestamp da entrega real (Etapa 1).
                        // Só define se por algum motivo ainda não foi registrado.
                        if (!r.data_hora_entrega) r.data_hora_entrega = new Date();
                        // Para Parcial, tipo_entrega/qtd/observacao já foram gravados na Etapa 1.
                        // Sobrescrever aqui corromperia os dados registrados pelo motorista.
                        if (tipoEntrega !== 'Parcial') {
                            r.tipo_entrega = 'Total';
                            r.qtd_entregue = Number(entrega.qtdEnviada) || 0;
                            r.qtd_devolvida = 0;
                            r.observacao = null;
                        }
                        // Dados da Tela 2 (foto do questionário)
                        r.foto_questionario = fotoUri;
                        r.foto_questionario_servidor = null;
                        r.status = statusFinal;
                        r.status_sincronizacao = 'pendente';
                        r.device_id = deviceId;
                    });
                });
                console.timeEnd('[Questionario] database.write');
            } else {
                throw new Error('Banco de dados não inicializado.');
            }

            // Se não havia GPS quente, tenta refinar em background sem bloquear o motorista.
            if (!warmCoords && locationPermission?.granted) {
                const entregaId = entrega.id;
                (async () => {
                    try {
                        const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 }).catch(() => null);
                        const accurate = await Promise.race([
                            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
                            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
                        ]).catch(() => null);
                        const coords = accurate?.coords ?? lastKnown?.coords ?? null;
                        if (!coords || !database) return;
                        await database.write(async () => {
                            const rec = await findEntregaRecordSafe(database, entregaId, entrega.numGuia);
                            await (rec as any).update((r: any) => {
                                if (!r.latitude) {
                                    r.latitude = coords.latitude;
                                    r.longitude = coords.longitude;
                                    r.status_sincronizacao = 'pendente';
                                }
                            });
                        });
                        // Atualiza GPS no backup se Etapa 1 não tinha — saveDeliveryBackup faz merge
                        const backup = await loadDeliveryBackup(entrega.numGuia).catch(() => null);
                        if (backup && !backup.latitude) {
                            saveDeliveryBackup(entrega.numGuia, {
                                data_hora_entrega: null,
                                latitude: coords.latitude,
                                longitude: coords.longitude,
                            });
                        }
                    } catch { /* GPS opcional */ }
                })();
            }

            // Backup Etapa 2: preserva caminho da foto do questionário e status final
            // fora do WatermelonDB. Restaurado pelo pull guard se o banco local for limpo.
            saveDeliveryBackup(entrega.numGuia, {
                data_hora_entrega: null, // já salvo no backup da Etapa 1
                latitude: null,
                longitude: null,
                foto_questionario_servidor: null,
                status: statusFinal,
            });

            Vibration.vibrate([0, 40, 60, 80]);
            // Sync em background — não bloqueia a confirmação.
            // Os dados já estão no WatermelonDB; o motorista pode fechar a tela imediatamente.
            // Aguarda a navegação/animação terminar antes de competir pela thread JS.
            if (isConnected) {
                InteractionManager.runAfterInteractions(() => {
                    syncData().catch((err) => reportError(err, 'background_push_questionario', { num_guia: entrega.numGuia }));
                });
            }
            setModalConfig({
                visible: true,
                title: 'Concluído!',
                message: isConnected
                    ? 'Entrega registrada com sucesso. Os dados serão enviados em segundos.'
                    : 'Dados gravados no celular. Serão enviados automaticamente ao reconectar.',
                variant: 'success',
                confirmText: 'OK',
                cancelText: undefined,
                onConfirm: handleSuccessClose,
                onCancel: undefined,
            });
        } catch (error: unknown) {
            reportError(error, 'registrar_questionario', { num_guia: entrega.numGuia });
            const { title, message } = classifyLocalError(error);
            setModalConfig({
                visible: true,
                title,
                message,
                variant: 'error',
                confirmText: 'OK',
                cancelText: undefined,
                onConfirm: () => setModalConfig(prev => ({ ...prev, visible: false })),
                onCancel: undefined,
            });
        } finally {
            setLoading(false);
        }
    };

    // ── Câmera ───────────────────────────────────────────────────────────
    if (showCamera) {
        if (previewUri) {
            return (
                <View style={styles.cameraContainer}>
                    <Image source={{ uri: previewUri }} style={styles.camera} resizeMode="cover" />
                    <View style={styles.previewOverlay}>
                        <View style={styles.previewHeader}>
                            <Text style={styles.previewTitle}>Verifique o Questionário</Text>
                            <Text style={styles.previewSubtitle}>O questionário está nítido e completamente visível?</Text>
                        </View>

                        <View style={styles.previewFooter}>
                            <TouchableOpacity
                                style={[styles.checkboxContainer, questionarioLegivel && styles.checkboxContainerChecked]}
                                onPress={() => setQuestionarioLegivel(v => !v)}
                                activeOpacity={0.8}
                            >
                                <View style={[styles.checkbox, questionarioLegivel && styles.checkboxChecked]}>
                                    {questionarioLegivel && <Check color="white" size={16} />}
                                </View>
                                <Text style={styles.checkboxText}>
                                    Declaro que o questionário está legível e completamente respondido
                                </Text>
                            </TouchableOpacity>

                            {!questionarioLegivel && (
                                <Text style={styles.checkboxHint}>
                                    Marque a caixa acima para confirmar a foto
                                </Text>
                            )}

                            <View style={styles.previewActions}>
                                <Button
                                    title="Tirar Novamente"
                                    onPress={handleRetake}
                                    variant="secondary"
                                    style={{ flex: 1 }}
                                />
                                <Button
                                    title="Confirmar"
                                    onPress={handleConfirmPreview}
                                    style={{ flex: 1 }}
                                    disabled={!questionarioLegivel}
                                />
                            </View>
                        </View>
                    </View>
                </View>
            );
        }

        return (
            <View style={styles.cameraContainer}>
                <CameraView ref={cameraRef} style={styles.camera} facing={facing} enableTorch={torchEnabled}>
                    <View style={styles.cameraOverlay}>
                        <View style={styles.overlayTop} />
                        <View style={styles.overlayMiddle}>
                            <View style={styles.overlaySide} />
                            <View style={styles.documentFrame}>
                                <View style={[styles.corner, styles.topLeft]} />
                                <View style={[styles.corner, styles.topRight]} />
                                <View style={[styles.corner, styles.bottomLeft]} />
                                <View style={[styles.corner, styles.bottomRight]} />
                            </View>
                            <View style={styles.overlaySide} />
                        </View>
                        <View style={styles.overlayBottom}>
                            <Text style={styles.overlayText}>Posicione o questionário dentro da área</Text>
                        </View>
                    </View>
                </CameraView>
                <View style={styles.cameraControls}>
                    <TouchableOpacity style={styles.closeButton} onPress={() => setShowCamera(false)}>
                        <X color="white" size={28} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
                        <View style={styles.captureInner} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.torchButton} onPress={() => setTorchEnabled(v => !v)}>
                        {torchEnabled
                            ? <Zap color="#FFD700" size={28} fill="#FFD700" />
                            : <ZapOff color="white" size={28} />}
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // ── Formulário ────────────────────────────────────────────────────────
    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <GenericModal
                visible={modalConfig.visible}
                title={modalConfig.title}
                message={modalConfig.message}
                variant={modalConfig.variant}
                confirmText={modalConfig.confirmText}
                cancelText={modalConfig.cancelText}
                onConfirm={modalConfig.onConfirm}
                onCancel={modalConfig.onCancel}
            />

            <ScrollView contentContainerStyle={styles.scrollContent}>

                {/* Indicador de Etapas */}
                <View style={styles.stepsContainer}>
                    <View style={styles.stepItem}>
                        <View style={[styles.stepCircle, styles.stepCircleDone]}>
                            <Check color="white" size={16} />
                        </View>
                        <Text style={[styles.stepLabel, styles.stepLabelDone]}>Etapa 1{'\n'}Entrega</Text>
                    </View>
                    <View style={styles.stepConnector} />
                    <View style={styles.stepItem}>
                        <View style={[styles.stepCircle, styles.stepCircleActive]}>
                            <Text style={styles.stepNumber}>2</Text>
                        </View>
                        <Text style={[styles.stepLabel, styles.stepLabelActive]}>Etapa 2{'\n'}Questionário</Text>
                    </View>
                </View>

                {/* Contexto da guia */}
                <Card style={styles.card}>
                    <View style={styles.sectionHeader}>
                        <FileText color={colors.primary} size={20} />
                        <Text style={styles.sectionTitle}>Guia #{entrega.numGuia}</Text>
                    </View>
                    <Text style={styles.escolaNome}>{String(entrega.nomeEscola || entrega.escola || '')}</Text>
                    <Text style={styles.helpText}>
                        A diretora ou responsável da escola deve ter preenchido o questionário de feedback.
                        Tire uma foto do questionário respondido para concluir a entrega.
                    </Text>
                </Card>

                {/* Foto do questionário */}
                <Card style={styles.card}>
                    <View style={styles.sectionHeader}>
                        <ClipboardCheck color={colors.primary} size={20} />
                        <Text style={styles.sectionTitle}>Foto do Questionário</Text>
                    </View>

                    <TouchableOpacity style={[styles.fotoButton, scannerBusy && { opacity: 0.6 }]} onPress={handleScanDocument} disabled={scannerBusy} activeOpacity={0.8}>
                        {fotoUri ? (
                            <View style={styles.fotoPreview}>
                                <Image source={{ uri: fotoUri }} style={{ width: '100%', height: 200, borderRadius: BorderRadius.md }} resizeMode="cover" />
                                <Text style={[styles.fotoSubtext, { marginTop: Spacing.sm, color: colors.success }]}>
                                    ✓ Foto registrada — toque para substituir
                                </Text>
                            </View>
                        ) : scannerBusy ? (
                            <View style={styles.fotoPlaceholder}>
                                <ActivityIndicator size="large" color={colors.primary} />
                                <Text style={[styles.fotoText, { marginTop: Spacing.sm }]}>Abrindo scanner...</Text>
                            </View>
                        ) : (
                            <View style={styles.fotoPlaceholder}>
                                <Camera color={colors.primary} size={40} style={styles.fotoIcon} />
                                <Text style={styles.fotoText}>Fotografar Questionário</Text>
                                <Text style={styles.fotoSubtext}>Toque para abrir a câmera</Text>
                            </View>
                        )}
                    </TouchableOpacity>

                </Card>

                <View style={styles.actionsContainer}>
                    <Button
                        title="Cancelar"
                        onPress={handleCancel}
                        variant="secondary"
                        style={styles.cancelButton}
                    />
                    <Button
                        title="Concluir Entrega"
                        onPress={handleConfirmar}
                        loading={loading}
                        disabled={!fotoUri || loading}
                        style={styles.confirmButton}
                    />
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { padding: Spacing.xl },
    card: { marginBottom: Spacing.lg },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
    sectionTitle: { fontSize: Typography.md, fontWeight: Typography.semibold, color: colors.textPrimary },
    escolaNome: { fontSize: Typography.lg, fontWeight: Typography.semibold, color: colors.textPrimary, marginBottom: Spacing.xs },
    helpText: { fontSize: Typography.sm, color: colors.textSecondary, lineHeight: 20 },
    fotoButton: {
        borderWidth: 2, borderColor: colors.primary, borderRadius: BorderRadius.lg,
        borderStyle: 'dashed', overflow: 'hidden', backgroundColor: colors.primaryLight + '10',
    },
    fotoPlaceholder: { padding: Spacing.xxxl, alignItems: 'center' },
    fotoPreview: { padding: Spacing.md, alignItems: 'center' },
    fotoIcon: { marginBottom: Spacing.sm },
    fotoText: { fontSize: Typography.md, fontWeight: Typography.semibold, color: colors.textPrimary },
    fotoSubtext: { fontSize: Typography.xs, color: colors.textSecondary, marginTop: Spacing.xs },
    actionsContainer: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
    cancelButton: { width: 110 },
    confirmButton: { flex: 1 },

    // Indicador de etapas
    stepsContainer: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        marginBottom: Spacing.xl, paddingHorizontal: Spacing.xl,
    },
    stepItem: { alignItems: 'center', gap: Spacing.xs },
    stepCircle: {
        width: 36, height: 36, borderRadius: 18,
        alignItems: 'center', justifyContent: 'center',
    },
    stepCircleDone: { backgroundColor: colors.success },
    stepCircleActive: { backgroundColor: colors.primary },
    stepNumber: { color: colors.white, fontSize: Typography.base, fontWeight: Typography.bold },
    stepLabel: { fontSize: Typography.xs, textAlign: 'center', lineHeight: 16 },
    stepLabelDone: { color: colors.success },
    stepLabelActive: { color: colors.primary, fontWeight: Typography.semibold },
    stepConnector: { flex: 1, height: 2, backgroundColor: colors.primary, marginHorizontal: Spacing.md, marginBottom: Spacing.lg },

    // Câmera
    cameraContainer: { flex: 1, backgroundColor: 'black' },
    camera: { flex: 1 },
    cameraControls: {
        position: 'absolute', bottom: 40, left: 0, right: 0,
        flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 20,
    },
    captureButton: {
        width: 70, height: 70, borderRadius: 35,
        backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center',
    },
    captureInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'white' },
    closeButton: { padding: 10 },
    torchButton: { padding: 10 },
    cameraOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
    overlayTop: { flex: 1, width: '100%', backgroundColor: 'rgba(0,0,0,0.5)' },
    overlayMiddle: { flexDirection: 'row', height: '60%', width: '100%' },
    overlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    documentFrame: {
        width: '85%', backgroundColor: 'transparent',
        borderColor: 'rgba(255,255,255,0.3)', borderWidth: 1, position: 'relative',
    },
    overlayBottom: {
        flex: 1, width: '100%', backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center', paddingTop: 20,
    },
    overlayText: {
        color: 'white', fontSize: 16, fontWeight: '600',
        backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 8,
        borderRadius: 20, overflow: 'hidden',
    },
    corner: { position: 'absolute', width: 30, height: 30, borderColor: 'white', borderWidth: 4 },
    topLeft: { top: -2, left: -2, borderBottomWidth: 0, borderRightWidth: 0 },
    topRight: { top: -2, right: -2, borderBottomWidth: 0, borderLeftWidth: 0 },
    bottomLeft: { bottom: -2, left: -2, borderTopWidth: 0, borderRightWidth: 0 },
    bottomRight: { bottom: -2, right: -2, borderTopWidth: 0, borderLeftWidth: 0 },

    // Preview
    previewOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'space-between',
    },
    previewHeader: {
        alignItems: 'center',
        paddingTop: Spacing.xl,
        paddingHorizontal: Spacing.xl,
        paddingBottom: Spacing.lg,
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    previewTitle: { color: colors.white, fontSize: Typography.xl, fontWeight: Typography.bold, marginBottom: Spacing.xs },
    previewSubtitle: { color: colors.textLight, fontSize: Typography.base, textAlign: 'center' },
    previewFooter: {
        width: '100%', gap: Spacing.lg,
        paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.xl,
        backgroundColor: 'rgba(0,0,0,0.7)',
    },
    checkboxContainer: {
        flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
        padding: Spacing.md, backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: BorderRadius.md, borderWidth: 2, borderColor: 'transparent',
    },
    checkboxContainerChecked: { backgroundColor: 'rgba(16,185,129,0.2)', borderColor: 'rgba(16,185,129,0.6)' },
    checkboxHint: { color: '#FFD54F', fontSize: Typography.sm, textAlign: 'center', fontWeight: Typography.medium },
    checkbox: { width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
    checkboxChecked: { backgroundColor: colors.success, borderColor: colors.success },
    checkboxText: { color: colors.white, fontSize: Typography.base, fontWeight: Typography.medium, flex: 1 },
    previewActions: { flexDirection: 'row', gap: Spacing.md },
});
