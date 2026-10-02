import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Image,
    Platform,
    KeyboardAvoidingView,
    Vibration,
    InteractionManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import * as Location from 'expo-location';
import * as Sentry from '@sentry/react-native';
import { markTransitionRisk } from '../utils/transitionWatchdog';
import { Camera, Check, Package, ClipboardList, MessageSquare, Info, X, ScanLine, Zap, ZapOff } from 'lucide-react-native';
import NetInfo from '@react-native-community/netinfo';
import { findEntregaRecordSafe } from '../database/sync/entregaLookup';
import Card from '../components/Card';
import Button from '../components/Button';
import GenericModal from '../components/GenericModal';
import { Typography, Spacing, BorderRadius, ThemeColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { database } from '../database';
import { validateEntregaParcial } from '../utils/entregaValidation';
import { syncData, saveDeliveryBackup } from '../database/sync/syncService';
import { persistFotoUri } from '../utils/persistFoto';
import { getDeviceId } from '../utils/deviceId';
import type { ScreenProps } from '../../App';
import { classifyLocalError, reportError } from '../utils/syncError';
import { queueDiagnosticEvent } from '../utils/diagnostics';

// Document scanner - só funciona no nativo (Android/iOS)
let DocumentScanner: any = null;
if (Platform.OS !== 'web') {
    try {
        DocumentScanner = require('react-native-document-scanner-plugin').default;
    } catch (e) {
        console.warn('Document scanner não disponível:', e);
    }
}

export default function MerendaRegistroEntregaScreen({ route, navigation }: ScreenProps<'RegistroEntrega'>) {
    const { colors } = useTheme();
    const styles = useMemo(() => getStyles(colors), [colors]);
    const { user } = useAuth();

    const { entrega } = route.params;
    const ownershipConfirmedRef = useRef(false);
    const [fotoUri, setFotoUri] = useState<string | null>(null);
    const [tipoEntrega, setTipoEntrega] = useState<'Total' | 'Parcial'>('Total');
    const [observacoes, setObservacoes] = useState('');
    const [quantidadeEntregue, setQuantidadeEntregue] = useState('');
    const [selectedMotivo, setSelectedMotivo] = useState<'Falta de espaço de armazenamento' | 'Outro' | null>(null);

    // Photo Preview State
    const [previewUri, setPreviewUri] = useState<string | null>(null);
    const [guideLegible, setGuideLegible] = useState(false);

    const [loading, setLoading] = useState(false);

    const [modalConfig, setModalConfig] = useState({
        visible: false,
        title: '',
        message: '',
        variant: 'info' as 'success' | 'error' | 'warning' | 'info',
        confirmText: 'OK',
        cancelText: undefined as string | undefined,
        onConfirm: () => { },
        onCancel: undefined as (() => void) | undefined,
    });

    const goHome = () => {
        setModalConfig(prev => ({ ...prev, visible: false }));
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    };

    const [isConnected, setIsConnected] = useState(true);
    React.useEffect(() => {
        return NetInfo.addEventListener(state => {
            setIsConnected(!!state.isConnected && state.isInternetReachable !== false);
        });
    }, []);

    // Camera State
    const [permission, requestPermission] = useCameraPermissions();
    const [showCamera, setShowCamera] = useState(false);
    const [facing, setFacing] = useState<CameraType>('back');
    const [torchEnabled, setTorchEnabled] = useState(false);
    const cameraRef = React.useRef<CameraView>(null);

    // Location State
    const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions();
    const warmGpsRef = useRef<{ coords: Location.LocationObjectCoords; at: number } | null>(null);
    const gpsWatcherRef = useRef<Location.LocationSubscription | null>(null);

    // Watcher contínuo: mantém warmGpsRef atualizado enquanto a tela está aberta.
    // Para automaticamente quando a precisão chega < 20m (bateria) ou ao desmontar.
    useEffect(() => {
        if (!locationPermission?.granted) return;
        let mounted = true;

        // Desligar o watcher precisa ser à prova de exceção.
        //
        // No navegador, o expo-location remove a inscrição chamando
        // LocationEventEmitter.removeSubscription() — um método que o React
        // Native não tem mais. O .remove() então lança TypeError. Como a chamada
        // acontece na limpeza deste useEffect, o React entende como erro de
        // ciclo de vida, aborta a árvore e cai no Error Boundary: era o "Algo deu
        // errado" que aparecia ao voltar desta tela.
        //
        // Não há nada a fazer com a exceção além de ignorá-la: a inscrição em si
        // já foi encerrada, o que falha é só a limpeza interna do emissor.
        const pararWatcher = (sub?: Location.LocationSubscription | null) => {
            try {
                sub?.remove();
            } catch { /* ver comentário acima */ }
        };

        const startWatcher = async () => {
            // A callback pode ser chamada ANTES do await devolver a inscrição —
            // é o caso quando o aparelho já tem uma posição em cache e responde
            // de imediato. Referenciar lá dentro a const que só existe depois do
            // await estoura "Cannot access 'sub' before initialization". Por isso
            // o desligamento é sinalizado nesta flag e executado após o await.
            let precisaoSuficiente = false;

            try {
                const sub = await Location.watchPositionAsync(
                    { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
                    (loc) => {
                        if (!mounted) return;
                        warmGpsRef.current = { coords: loc.coords, at: Date.now() };
                        if (loc.coords.accuracy != null && loc.coords.accuracy < 20) {
                            precisaoSuficiente = true;
                            pararWatcher(gpsWatcherRef.current);
                            gpsWatcherRef.current = null;
                        }
                    },
                );

                if (!mounted || precisaoSuficiente) {
                    pararWatcher(sub);
                    gpsWatcherRef.current = null;
                } else {
                    gpsWatcherRef.current = sub;
                }
            } catch { /* GPS indisponível no dispositivo */ }
        };

        startWatcher();

        return () => {
            mounted = false;
            pararWatcher(gpsWatcherRef.current);
            gpsWatcherRef.current = null;
        };
    }, [locationPermission?.granted]);

    const handleScanDocument = async () => {
        if (!DocumentScanner) {
            handleOpenCamera();
            return;
        }

        try {
            const result = await DocumentScanner.scanDocument({
                croppedImageQuality: 80,
                maxNumDocuments: 1,
                letUserAdjustCrop: true,
            });

            if (result?.scannedImages?.length > 0) {
                const uri = await persistFotoUri(result.scannedImages[0], entrega.numGuia, 'guia');
                setFotoUri(uri);
            }
        } catch (error) {
            console.warn('Erro no scanner, usando câmera:', error);
            handleOpenCamera();
        }
    };

    const handleOpenCamera = async () => {
        if (!permission) {
            const { granted } = await requestPermission();
            if (!granted) {
                setModalConfig({
                    visible: true,
                    title: 'Permissão necessária',
                    message: 'Precisamos de acesso à câmera para registrar a entrega.',
                    variant: 'warning',
                    confirmText: 'OK',
                    cancelText: undefined,
                    onConfirm: () => setModalConfig(prev => ({ ...prev, visible: false })),
                    onCancel: undefined,
                });
                return;
            }
        } else if (!permission.granted) {
            setModalConfig({
                visible: true,
                title: 'Permissão necessária',
                message: 'Precisamos de acesso à câmera para registrar a entrega.',
                variant: 'warning',
                confirmText: 'OK',
                cancelText: undefined,
                onConfirm: () => setModalConfig(prev => ({ ...prev, visible: false })),
                onCancel: undefined,
            });
            return;
        }
        setShowCamera(true);
    };

    const takePicture = async () => {
        if (cameraRef.current) {
            try {
                const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, base64: false });
                if (photo) {
                    setPreviewUri(photo.uri);
                    setGuideLegible(false);
                    // Não fecha a câmera ainda, mostra o preview
                }
            } catch {
                setModalConfig({
                    visible: true,
                    title: 'Erro na câmera',
                    message: 'Não foi possível tirar a foto. Tente novamente ou reinicie o app.',
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
        if (previewUri) {
            const uri = await persistFotoUri(previewUri, entrega.numGuia, 'guia');
            setFotoUri(uri);
            setPreviewUri(null);
            setShowCamera(false);
        }
    };

    const handleRetake = () => {
        setPreviewUri(null);
        setGuideLegible(false);
    };

    const captureGps = async () => {
        try {
            const hasPermission = locationPermission?.granted
                ? true
                : (await requestLocationPermission()).granted;
            if (!hasPermission) return null;

            // Usa fix do watcher se recente (< 10 min) — mantido atualizado enquanto a tela está aberta
            const warm = warmGpsRef.current;
            if (warm && Date.now() - warm.at < 10 * 60 * 1000) return warm.coords;

            // Fallback: última posição conhecida (até 5 min — GPS mais antigo pode ser de outra escola)
            const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 }).catch(() => null);

            // Fix preciso com timeout estendido para uso em retries pós-navegação
            const accurate = await Promise.race([
                Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('GPS timeout')), 20_000)),
            ]).catch(() => null);

            return accurate?.coords ?? lastKnown?.coords ?? null;
        } catch { /* GPS completamente indisponível */ }
        return null;
    };

    // Captura GPS sem depender de estado do componente — segura para chamar após o unmount.
    const captureGpsDirect = async (): Promise<Location.LocationObjectCoords | null> => {
        try {
            const { granted } = await Location.getForegroundPermissionsAsync();
            if (!granted) return null;
            const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 }).catch(() => null);
            const accurate = await Promise.race([
                Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
                new Promise<never>((_, reject) => setTimeout(() => reject(), 20_000)),
            ]).catch(() => null);
            return accurate?.coords ?? lastKnown?.coords ?? null;
        } catch { return null; }
    };

    // Retry loop em background: tenta capturar GPS a cada 30s por até 5 min após a confirmação.
    // Para assim que obtiver coordenadas — útil para áreas rurais onde o sinal melhora ao sair da escola.
    const agendarRetryGps = (entregaId: string, numGuia: string, tipoEntrega: string, tentativas = 10) => {
        if (tentativas <= 0 || !database) {
            if (tentativas <= 0) {
                queueDiagnosticEvent({ error_type: 'unknown', error_code: 'gps_exhausted', context: 'gps_retry', occurred_at: Date.now(), extra: { num_guia: numGuia } }).catch(() => {});
            }
            return;
        }
        setTimeout(async () => {
            try {
                const coords = await captureGpsDirect();
                if (!coords) {
                    agendarRetryGps(entregaId, numGuia, tipoEntrega, tentativas - 1);
                    return;
                }
                let gravou = false;
                await database!.write(async () => {
                    try {
                        const rec = await findEntregaRecordSafe(database, entregaId, numGuia);
                        if (!(rec as any).latitude) {
                            await (rec as any).update((r: any) => {
                                r.latitude = coords.latitude;
                                r.longitude = coords.longitude;
                                r.status_sincronizacao = 'pendente';
                            });
                            gravou = true;
                        }
                    } catch { /* guia pode ter sido removida do WDB */ }
                });
                if (gravou) {
                    saveDeliveryBackup(numGuia, {
                        data_hora_entrega: Date.now(),
                        latitude: coords.latitude,
                        longitude: coords.longitude,
                        tipo_entrega: tipoEntrega,
                        status: 'aguardando_questionario',
                    });
                }
            } catch {
                agendarRetryGps(entregaId, numGuia, tipoEntrega, tentativas - 1);
            }
        }, 30_000);
    };

    const executarParcial = async () => {
        setLoading(true);
        try {
            // Usa coords pré-aquecidas imediatamente — não bloqueia navegação esperando GPS frio.
            // Se não houver coords quentes, a captura precisa roda em background após navegar.
            const warmCoords = locationPermission?.granted ? warmGpsRef.current?.coords ?? null : null;

            if (!database) throw new Error('Banco de dados não inicializado. Reinicie o aplicativo.');
            const deviceId = await getDeviceId();
            await database.write(async () => {
                const entregaRecord = await findEntregaRecordSafe(database, entrega.id, entrega.numGuia);
                await entregaRecord.update((r: any) => {
                    r.foto = fotoUri;
                    r.foto_servidor = null;
                    r.latitude = warmCoords?.latitude ?? null;
                    r.longitude = warmCoords?.longitude ?? null;
                    if (!r.data_hora_entrega) r.data_hora_entrega = new Date();
                    r.status_sincronizacao = 'pendente';
                    r.tipo_entrega = 'Parcial';
                    const qtdEntregue = Number(quantidadeEntregue);
                    const qtdEnviada = Number(entrega.qtdEnviada) || 0;
                    r.status = 'aguardando_questionario';
                    r.observacao = selectedMotivo === 'Outro' ? observacoes : (selectedMotivo || '');
                    r.qtd_entregue = qtdEntregue;
                    r.qtd_devolvida = Math.max(0, qtdEnviada - qtdEntregue);
                    r.device_id = deviceId;
                });
            });

            // Se não havia coords quentes, agenda retry em background (30s × 10 tentativas = 5 min).
            if (!warmCoords) agendarRetryGps(entrega.id, entrega.numGuia, 'Parcial');

            // Backup inicial: data, tipo e status garantidos; GPS incluso se disponível agora
            saveDeliveryBackup(entrega.numGuia, {
                data_hora_entrega: Date.now(),
                latitude: warmCoords?.latitude ?? null,
                longitude: warmCoords?.longitude ?? null,
                tipo_entrega: 'Parcial',
                status: 'aguardando_questionario',
            });
            // Push em background — aguarda a navegação/animação terminar antes de competir
            // pela thread JS (mesmo cuidado que o sync automático já tinha em useAutoSync).
            if (isConnected) {
                InteractionManager.runAfterInteractions(() => {
                    syncData().catch((err) => reportError(err, 'background_push_parcial', { num_guia: entrega.numGuia }));
                });
            }

            setLoading(false);
            Vibration.vibrate(50);
            // Marca a transição antes do reset abrupto de pilha — se a tela de
            // destino nunca chegar a montar (crash nativo no meio do caminho,
            // ver transitionWatchdog), a marca fica órfã e é detectada lá.
            await markTransitionRisk('RegistroEntrega(Parcial)', 'RegistroQuestionario', entrega.numGuia);
            Sentry.addBreadcrumb({
                category: 'navigation',
                message: `navigation.reset RegistroEntrega(Parcial) → RegistroQuestionario (guia ${entrega.numGuia})`,
                level: 'info',
            });
            InteractionManager.runAfterInteractions(() => {
                navigation.reset({
                    index: 1,
                    routes: [
                        { name: 'Home' },
                        { name: 'RegistroQuestionario', params: { entrega, fotoGuia: fotoUri, tipoEntrega: 'Parcial' } },
                    ],
                });
            });
        } catch (error: unknown) {
            setLoading(false);
            reportError(error, 'registrar_entrega_parcial', { num_guia: entrega.numGuia });
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
        }
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
                message: 'Esta guia está atribuída a outro motorista. Tem certeza que quer registrar esta entrega?',
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
                message: 'Por favor, tire uma foto da guia de entrega.',
                variant: 'warning',
                confirmText: 'OK',
                cancelText: undefined,
                onConfirm: () => setModalConfig(prev => ({ ...prev, visible: false })),
                onCancel: undefined,
            });
            return;
        }

        if (tipoEntrega === 'Parcial') {
            const err = validateEntregaParcial({
                quantidadeEntregue,
                qtdEnviada: Number(entrega.qtdEnviada) || 0,
                selectedMotivo,
                observacoes,
            });
            if (err) {
                setModalConfig({
                    visible: true,
                    title: err.title,
                    message: err.message,
                    variant: 'warning',
                    confirmText: 'OK',
                    cancelText: undefined,
                    onConfirm: () => setModalConfig(prev => ({ ...prev, visible: false })),
                    onCancel: undefined,
                });
                return;
            }

            if (Number(quantidadeEntregue) === 0) {
                setModalConfig({
                    visible: true,
                    title: 'Confirmar Devolução Total',
                    message: `Você informou 0 ${String(entrega.genero || 'kg')} entregue(s). Isso registrará a devolução total da carga. Deseja continuar?`,
                    variant: 'warning',
                    confirmText: 'Confirmar',
                    cancelText: 'Cancelar',
                    onConfirm: () => { setLoading(true); setModalConfig(prev => ({ ...prev, visible: false })); executarParcial(); },
                    onCancel: () => setModalConfig(prev => ({ ...prev, visible: false })),
                });
                return;
            }

            await executarParcial();
            return;
        }

        // Total: salva foto e GPS no DB antes de ir para a Tela 2 (questionário).
        // Garante que, se o motorista voltar sem preencher o questionário,
        // a guia seja recuperável via EntregaDetalhes → Registrar Questionário.
        setLoading(true);
        try {
            const warmCoords = locationPermission?.granted ? warmGpsRef.current?.coords ?? null : null;

            const deviceId = await getDeviceId();
            if (database) {
                await database.write(async () => {
                    const entregaRecord = await findEntregaRecordSafe(database, entrega.id, entrega.numGuia);
                    await entregaRecord.update((r: any) => {
                        r.foto = fotoUri;
                        r.foto_servidor = null;
                        r.latitude = warmCoords?.latitude ?? null;
                        r.longitude = warmCoords?.longitude ?? null;
                        if (!r.data_hora_entrega) r.data_hora_entrega = new Date();
                        r.tipo_entrega = 'Total';
                        r.qtd_entregue = Number(entrega.qtdEnviada) || 0;
                        r.qtd_devolvida = 0;
                        r.observacao = null;
                        r.status = 'aguardando_questionario';
                        r.status_sincronizacao = 'pendente';
                        r.device_id = deviceId;
                    });
                });
            }

            // Se não havia coords quentes, agenda retry em background (30s × 10 tentativas = 5 min).
            if (!warmCoords) agendarRetryGps(entrega.id, entrega.numGuia, 'Total');

            // Backup inicial: data, tipo e status garantidos; GPS incluso se disponível agora
            saveDeliveryBackup(entrega.numGuia, {
                data_hora_entrega: Date.now(),
                latitude: warmCoords?.latitude ?? null,
                longitude: warmCoords?.longitude ?? null,
                tipo_entrega: 'Total',
                status: 'aguardando_questionario',
            });
            // Push em background — aguarda a navegação/animação terminar antes de competir
            // pela thread JS (mesmo cuidado que o sync automático já tinha em useAutoSync).
            if (isConnected) {
                InteractionManager.runAfterInteractions(() => {
                    syncData().catch((err) => reportError(err, 'background_push_total', { num_guia: entrega.numGuia }));
                });
            }

            setLoading(false);
            Vibration.vibrate(50);
            await markTransitionRisk('RegistroEntrega(Total)', 'RegistroQuestionario', entrega.numGuia);
            Sentry.addBreadcrumb({
                category: 'navigation',
                message: `navigation.reset RegistroEntrega(Total) → RegistroQuestionario (guia ${entrega.numGuia})`,
                level: 'info',
            });
            InteractionManager.runAfterInteractions(() => {
                navigation.reset({
                    index: 1,
                    routes: [
                        { name: 'Home' },
                        { name: 'RegistroQuestionario', params: { entrega, fotoGuia: fotoUri } },
                    ],
                });
            });
        } catch (error: unknown) {
            setLoading(false);
            reportError(error, 'registrar_entrega_total', { num_guia: entrega.numGuia });
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
        }
    };

    if (showCamera) {
        if (previewUri) {
            return (
                <View style={styles.cameraContainer}>
                    <Image source={{ uri: previewUri }} style={styles.camera} resizeMode="cover" />
                    <View style={styles.previewOverlay}>
                        <View style={styles.previewHeader}>
                            <Text style={styles.previewTitle}>Verifique a Imagem</Text>
                            <Text style={styles.previewSubtitle}>A foto da guia está nítida e legível?</Text>
                        </View>

                        <View style={styles.previewFooter}>
                            <TouchableOpacity
                                style={[
                                    styles.checkboxContainer,
                                    guideLegible && styles.checkboxContainerChecked,
                                ]}
                                onPress={() => setGuideLegible(!guideLegible)}
                                activeOpacity={0.7}
                            >
                                <View style={[styles.checkbox, guideLegible && styles.checkboxChecked]}>
                                    {guideLegible && <Check size={16} color={colors.white} />}
                                </View>
                                <Text style={styles.checkboxText}>Declaro que a guia está assinada e legível</Text>
                            </TouchableOpacity>

                            {!guideLegible && (
                                <Text style={styles.checkboxHint}>
                                    ☝️ Marque a declaração acima para liberar o botão "Usar Foto"
                                </Text>
                            )}

                            <View style={styles.previewActions}>
                                <Button
                                    title="Tirar Outra"
                                    variant="secondary"
                                    onPress={handleRetake}
                                    style={{ flex: 1 }}
                                />
                                <Button
                                    title="Usar Foto"
                                    variant="success"
                                    disabled={!guideLegible}
                                    onPress={handleConfirmPreview}
                                    style={{ flex: 1 }}
                                />
                            </View>
                        </View>
                    </View>
                </View>
            );
        }

        return (
            <View style={styles.cameraContainer}>
                <CameraView style={styles.camera} facing={facing} ref={cameraRef} enableTorch={torchEnabled}>
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
                            <Text style={styles.overlayText}>Posicione a guia no retângulo</Text>
                        </View>
                    </View>

                    <View style={styles.cameraControls}>
                        <TouchableOpacity style={styles.closeButton} onPress={() => setShowCamera(false)}>
                            <X color={colors.white} size={32} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
                            <View style={styles.captureInner} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.torchButton} onPress={() => setTorchEnabled(v => !v)}>
                            {torchEnabled
                                ? <Zap color="#FFD700" size={28} fill="#FFD700" />
                                : <ZapOff color={colors.white} size={28} />}
                        </TouchableOpacity>
                    </View>
                </CameraView>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <KeyboardAvoidingView
                style={styles.keyboardAvoidingView}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 80}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Resumo da Entrega */}
                    <Card style={styles.card}>
                        <View style={styles.sectionHeader}>
                            <Package color={colors.primary} size={20} />
                            <Text style={styles.sectionTitle}>Resumo da Entrega</Text>
                        </View>
                        <Text style={styles.escolaNome}>{String(entrega.nomeEscola || entrega.escola || '')}</Text>

                        {entrega.endereco ? (
                            <Text style={styles.escolaEndereco}>{String(entrega.endereco)}</Text>
                        ) : null}

                        <Text style={styles.genero}>{String(entrega.genero)} - {String(entrega.qtdEnviada)} kg</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            <Text style={[styles.genero, { marginBottom: 0 }]}>Guia</Text>
                            <Text style={styles.guia}>{String(entrega.numGuia)}</Text>
                        </View>
                    </Card>

                    {/* Foto da Guia */}
                    <Card style={styles.card}>
                        <View style={styles.sectionHeader}>
                            <Camera color={colors.primary} size={20} />
                            <Text style={styles.sectionTitle}>Foto da Guia de Entrega</Text>
                        </View>
                        <Text style={styles.helpText}>
                            {DocumentScanner
                                ? 'Escaneie a guia assinada pela escola'
                                : 'Tire uma foto clara da guia assinada pela escola'}
                        </Text>

                        <TouchableOpacity
                            style={styles.fotoButton}
                            onPress={handleScanDocument}
                        >
                            {fotoUri ? (
                                <View style={styles.fotoPreview}>
                                    <Check color={colors.success} size={48} style={styles.fotoIcon} />
                                    <Text style={styles.fotoText}>Foto capturada</Text>
                                    <Text style={styles.fotoSubtext}>Toque para tirar outra</Text>
                                </View>
                            ) : (
                                <View style={styles.fotoPlaceholder}>
                                    {DocumentScanner
                                        ? <ScanLine color={colors.primary} size={48} style={styles.fotoIcon} />
                                        : <Camera color={colors.primary} size={48} style={styles.fotoIcon} />
                                    }
                                    <Text style={[styles.fotoText, { color: colors.primary }]}>
                                        {DocumentScanner ? 'Escanear Guia' : 'Tirar Foto'}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>

                    </Card>

                    {/* Tipo de Entrega */}
                    <Card style={styles.card}>
                        <View style={styles.sectionHeader}>
                            <ClipboardList color={colors.primary} size={20} />
                            <Text style={styles.sectionTitle}>Tipo de Entrega</Text>
                        </View>
                        <View style={styles.tipoContainer}>
                            <TouchableOpacity
                                style={[
                                    styles.tipoButton,
                                    tipoEntrega === 'Total' && styles.tipoButtonActive,
                                ]}
                                onPress={() => setTipoEntrega('Total')}
                            >
                                <Text
                                    style={[
                                        styles.tipoText,
                                        tipoEntrega === 'Total' && styles.tipoTextActive,
                                    ]}
                                >
                                    Total
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.tipoButton,
                                    tipoEntrega === 'Parcial' && styles.tipoButtonActive,
                                ]}
                                onPress={() => setTipoEntrega('Parcial')}
                            >
                                <Text
                                    style={[
                                        styles.tipoText,
                                        tipoEntrega === 'Parcial' && styles.tipoTextActive,
                                    ]}
                                >
                                    Parcial
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </Card>

                    {/* Quantidade Entregue - Só aparece se for Parcial */}
                    <Card style={[styles.card, { display: tipoEntrega === 'Parcial' ? 'flex' : 'none' }]}>
                            <View style={styles.sectionHeader}>
                                <Package color={colors.primary} size={20} />
                                <Text style={styles.sectionTitle}>
                                    Quantidade Entregue <Text style={{ color: colors.error }}>(Obrigatório)</Text>
                                </Text>
                            </View>
                            <TextInput
                                style={[styles.textArea, { minHeight: 50, marginTop: Spacing.xs }]}
                                placeholder={`Qtd. enviada foi: ${entrega.qtdEnviada}`}
                                placeholderTextColor={colors.textLight}
                                value={quantidadeEntregue}
                                onChangeText={setQuantidadeEntregue}
                                keyboardType="numeric"
                            />
                        </Card>

                    {/* Observações - Só aparece se for Parcial */}
                    <Card style={[styles.card, { display: tipoEntrega === 'Parcial' ? 'flex' : 'none' }]}>
                            <View style={styles.sectionHeader}>
                                <MessageSquare color={colors.primary} size={20} />
                                <Text style={styles.sectionTitle}>
                                    Motivo <Text style={{ color: colors.error }}>(Obrigatório)</Text>
                                </Text>
                            </View>

                            <View style={styles.motivoContainer}>
                                <TouchableOpacity
                                    style={[
                                        styles.motivoButton,
                                        selectedMotivo === 'Falta de espaço de armazenamento' && styles.motivoButtonActive,
                                    ]}
                                    onPress={() => setSelectedMotivo('Falta de espaço de armazenamento')}
                                >
                                    <Text style={[
                                        styles.motivoText,
                                        selectedMotivo === 'Falta de espaço de armazenamento' && styles.motivoTextActive
                                    ]}>
                                        Falta de espaço de armazenamento
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[
                                        styles.motivoButton,
                                        selectedMotivo === 'Outro' && styles.motivoButtonActive,
                                    ]}
                                    onPress={() => setSelectedMotivo('Outro')}
                                >
                                    <Text style={[
                                        styles.motivoText,
                                        selectedMotivo === 'Outro' && styles.motivoTextActive
                                    ]}>
                                        Outro
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {selectedMotivo === 'Outro' && (
                                <TextInput
                                    style={[styles.textArea, { marginTop: Spacing.md }]}
                                    placeholder="Descreva o motivo aqui..."
                                    placeholderTextColor={colors.textLight}
                                    value={observacoes}
                                    onChangeText={setObservacoes}
                                    multiline
                                    numberOfLines={4}
                                    textAlignVertical="top"
                                />
                            )}
                        </Card>

                    {/* Informações Automáticas */}
                    <Card style={[styles.card, styles.infoCard]}>
                        <View style={styles.sectionHeader}>
                            <Info color={colors.info} size={20} />
                            <Text style={styles.infoTitle}>Informações Automáticas</Text>
                        </View>
                        <Text style={styles.infoText}>
                            • Data e hora serão registradas automaticamente{'\n'}
                            • Coordenadas GPS serão capturadas e enviadas à Secretaria de Educação para comprovar o local da entrega{'\n'}
                            {tipoEntrega === 'Total'
                                ? '• Os dados serão enviados ao servidor após fotografar o questionário na próxima etapa'
                                : isConnected
                                    ? '• A confirmação será enviada imediatamente ao servidor'
                                    : '• Sem internet, os dados ficarão salvos no celular para envio posterior'}
                        </Text>
                    </Card>

                    {/* Botões de Ação */}
                    <View style={styles.actionsContainer}>
                        <Button
                            title="Cancelar"
                            variant="secondary"
                            onPress={() => navigation.goBack()}
                            style={styles.cancelButton}
                            Icon={X}
                        />
                        <Button
                            title={tipoEntrega === 'Total' ? 'Próximo' : 'Confirmar'}
                            variant="success"
                            onPress={handleConfirmar}
                            loading={loading}
                            style={styles.confirmButton}
                            Icon={Check}
                        />
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

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
        </SafeAreaView >
    );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    keyboardAvoidingView: {
        flex: 1,
    },
    scrollContent: {
        padding: Spacing.xl,
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
        marginBottom: Spacing.sm,
    },
    genero: {
        fontSize: Typography.sm,
        color: colors.textSecondary,
        marginBottom: Spacing.xs,
    },
    guia: {
        fontSize: Typography.xxl,
        fontWeight: '900' as const,
        color: colors.textPrimary,
        marginTop: Spacing.xs,
    },
    helpText: {
        fontSize: Typography.sm,
        color: colors.textSecondary,
        marginBottom: Spacing.md,
    },
    fotoButton: {
        borderWidth: 2,
        borderColor: colors.primary,
        borderRadius: BorderRadius.lg,
        borderStyle: 'dashed',
        overflow: 'hidden',
        backgroundColor: colors.primaryLight + '10',
    },
    fotoPlaceholder: {
        padding: Spacing.xxxl,
        alignItems: 'center',
        // backgroundColor: colors.backgroundDark,
    },
    fotoPreview: {
        padding: Spacing.xl,
        alignItems: 'center',
        backgroundColor: colors.successLight, // Already adjusted in theme.ts for Dark Mode
    },
    fotoIcon: {
        marginBottom: Spacing.sm,
    },
    fotoText: {
        fontSize: Typography.md,
        fontWeight: Typography.semibold,
        color: colors.textPrimary,
    },
    fotoSubtext: {
        fontSize: Typography.xs,
        color: colors.textSecondary,
        marginTop: Spacing.xs,
    },
    tipoContainer: {
        flexDirection: 'row',
        gap: Spacing.md,
    },
    tipoButton: {
        flex: 1,
        padding: Spacing.lg,
        borderRadius: BorderRadius.md,
        borderWidth: 2,
        borderColor: colors.border,
        alignItems: 'center',
        backgroundColor: colors.cardBackground, // Changed from white
    },
    tipoButtonActive: {
        borderColor: colors.primary,
        backgroundColor: colors.primaryLight + '20',
    },
    tipoText: {
        fontSize: Typography.base,
        fontWeight: Typography.medium,
        color: colors.textSecondary,
    },
    tipoTextActive: {
        color: colors.primary,
        fontWeight: Typography.semibold,
    },
    textArea: {
        backgroundColor: colors.cardBackground, // Changed from white
        borderWidth: 2,
        borderColor: colors.border,
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        fontSize: Typography.base,
        color: colors.textPrimary,
        minHeight: 100,
    },
    infoCard: {
        backgroundColor: colors.infoLight, // Already adjusted in theme.ts
        borderWidth: 0,
    },
    infoTitle: {
        fontSize: Typography.sm,
        fontWeight: Typography.semibold,
        color: colors.info,
    },
    infoText: {
        fontSize: Typography.xs,
        color: colors.info,
        lineHeight: 18,
        marginTop: Spacing.xs,
    },
    actionsContainer: {
        flexDirection: 'row',
        gap: Spacing.md,
        marginTop: Spacing.lg,
    },
    cancelButton: {
        width: 110,
    },
    confirmButton: {
        flex: 1,
    },
    motivoContainer: {
        flexDirection: 'column',
        gap: Spacing.sm,
    },
    motivoButton: {
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        borderWidth: 2,
        borderColor: colors.border,
        backgroundColor: colors.cardBackground, // Changed from white
    },
    motivoButtonActive: {
        borderColor: colors.primary,
        backgroundColor: colors.primaryLight + '20',
    },
    motivoText: {
        fontSize: Typography.base,
        color: colors.textSecondary,
    },
    motivoTextActive: {
        color: colors.primary,
        fontWeight: Typography.semibold,
    },
    cameraContainer: {
        flex: 1,
        backgroundColor: 'black',
    },
    camera: {
        flex: 1,
    },
    cameraControls: {
        position: 'absolute',
        bottom: 40,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    captureButton: {
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    captureInner: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'white',
    },
    closeButton: {
        padding: 10,
    },
    cameraOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    overlayTop: {
        flex: 1,
        width: '100%',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    overlayMiddle: {
        flexDirection: 'row',
        height: '60%', // Altura da área de documento
        width: '100%',
    },
    overlaySide: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    documentFrame: {
        width: '85%', // Largura da área de documento
        backgroundColor: 'transparent',
        borderColor: 'rgba(255,255,255,0.3)',
        borderWidth: 1,
        position: 'relative',
    },
    overlayBottom: {
        flex: 1,
        width: '100%',
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        paddingTop: 20,
    },
    overlayText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        overflow: 'hidden',
    },
    corner: {
        position: 'absolute',
        width: 30,
        height: 30,
        borderColor: 'white',
        borderWidth: 4,
    },
    topLeft: {
        top: -2,
        left: -2,
        borderBottomWidth: 0,
        borderRightWidth: 0,
    },
    topRight: {
        top: -2,
        right: -2,
        borderBottomWidth: 0,
        borderLeftWidth: 0,
    },
    bottomLeft: {
        bottom: -2,
        left: -2,
        borderTopWidth: 0,
        borderRightWidth: 0,
    },
    bottomRight: {
        bottom: -2,
        right: -2,
        borderTopWidth: 0,
        borderLeftWidth: 0,
    },
    // Preview Styles
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
    previewTitle: {
        color: colors.white,
        fontSize: Typography.xl,
        fontWeight: Typography.bold,
        marginBottom: Spacing.xs,
    },
    previewSubtitle: {
        color: colors.textLight,
        fontSize: Typography.base,
        textAlign: 'center',
    },
    previewFooter: {
        width: '100%',
        gap: Spacing.lg,
        paddingHorizontal: Spacing.xl,
        paddingTop: Spacing.lg,
        paddingBottom: Spacing.xl,
        backgroundColor: 'rgba(0,0,0,0.7)',
    },
    torchButton: {
        padding: 10,
    },
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.md,
        padding: Spacing.md,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: BorderRadius.md,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    checkboxContainerChecked: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        borderColor: 'rgba(16, 185, 129, 0.6)',
    },
    checkboxHint: {
        color: '#FFD54F',
        fontSize: Typography.sm,
        textAlign: 'center',
        fontWeight: Typography.medium,
        paddingHorizontal: Spacing.sm,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: colors.white,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxChecked: {
        backgroundColor: colors.success,
        borderColor: colors.success,
    },
    checkboxText: {
        color: colors.white,
        fontSize: Typography.base,
        fontWeight: Typography.medium,
    },
    previewActions: {
        flexDirection: 'row',
        gap: Spacing.md,
    },
});
