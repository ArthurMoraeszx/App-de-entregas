import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import api from './network';

// Configura o que fazer quando uma notificação chega com o app aberto
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

/**
 * Solicita permissão e cria o canal Android (obrigatório no Android 8+).
 * Deve ser chamado uma vez ao iniciar o app (App.tsx).
 */
export async function registerForPushNotificationsAsync(): Promise<string | undefined> {
    let token: string | undefined;

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('merenda-alertas', {
            name: 'Alertas de Entrega',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#2E7D32',
            sound: 'default',
            description: 'Avisos sobre prazos e entregas pendentes',
        });
    }

    if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            console.warn('[Notifications] Permissão negada para notificações.');
            return undefined;
        }

        const firebaseMessagingEnabled =
            Constants?.expoConfig?.extra?.firebase?.messagingEnabled ??
            (Constants as any)?.manifest2?.extra?.firebase?.messagingEnabled ??
            false;

        if (!firebaseMessagingEnabled) {
            console.warn('[Notifications] Firebase Cloud Messaging desabilitado nas configurações do app. Defina extra.firebase.messagingEnabled = true quando o google-services.json estiver configurado.');
            return undefined;
        }

        try {
            const projectId =
                Constants?.expoConfig?.extra?.firebase?.projectId ??
                Constants?.expoConfig?.extra?.eas?.projectId ??
                Constants?.easConfig?.projectId;

            if (!projectId) {
                console.warn('[Notifications] projectId não encontrado no app.json (extra.firebase.projectId ou extra.eas.projectId).');
                return undefined;
            }

            const tokenResponse = await Notifications.getExpoPushTokenAsync({
                projectId,
            });
            token = tokenResponse.data;
            console.log('[Notifications] Expo Push Token obtido:', token);
        } catch (e) {
            console.error('[Notifications] Erro ao obter Expo Push Token:', e);
        }
    } else {
        console.warn('[Notifications] Necessário usar um dispositivo físico para Notificações Push.');
    }

    return token;
}

/**
 * Envia o token para o backend associando ao usuário atual
 */
export async function syncPushTokenWithBackend(usuario_id: number, expo_token: string) {
    try {
        await api.post('/mobile/token', { usuario_id, pushToken: expo_token });
        console.log('[Notifications] Token sincronizado com o backend');
    } catch (e) {
        console.error('[Notifications] Falha ao sincronizar o token com o backend:', e);
    }
}

/**
 * Agenda uma notificação local para ser exibida imediatamente (ou com delay).
 * @param title  Título da notificação
 * @param body   Corpo da mensagem
 * @param data   Dados extras (ex: { screen: 'Notifications' })
 * @param delaySeconds  0 = exibe agora, N = exibe após N segundos
 */
export async function scheduleLocalNotification(
    title: string,
    body: string,
    data: Record<string, unknown> = {},
    delaySeconds = 0,
): Promise<void> {
    try {
        await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                data,
                sound: true,
                ...(Platform.OS === 'android' && { channelId: 'merenda-alertas' }),
            },
            trigger: delaySeconds > 0
                ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: delaySeconds }
                : null,
        });
    } catch (err) {
        console.warn('[Notifications] Erro ao agendar notificação:', err);
    }
}

/**
 * Cancela todas as notificações agendadas (útil ao fazer logout).
 */
export async function cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
}

