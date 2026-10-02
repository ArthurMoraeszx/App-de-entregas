/**
 * notificationScheduler.ts
 *
 * Lê o WatermelonDB local e dispara notificações locais relevantes.
 * É chamado automaticamente pelo useAutoSync após cada sincronização bem-sucedida.
 *
 * Regras:
 *  - Evita spam: usa AsyncStorage para guardar a data da última verificação
 *    e só dispara novamente se passou pelo menos MIN_INTERVAL_MS desde a última vez.
 *  - Cada tipo de alerta tem um ID fixo — o Android não duplica notificações
 *    com mesmo identifier se já exibida (expo-notifications deduplica por content hash).
 *  - Não dispara nada se o banco não estiver disponível.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Q } from '@nozbe/watermelondb';
import { database } from '../database';
import { scheduleLocalNotification } from './notifications';
import { getPrazoVigente } from '../utils/entregaAtraso';

const LAST_CHECK_KEY = '@merenda:lastNotifCheck';
const MIN_INTERVAL_MS = 30 * 60 * 1000; // 30 minutos mínimo entre verificações

export async function checkAndScheduleNotifications(): Promise<void> {
    if (!database) return;

    // Evita verificações muito frequentes
    try {
        const lastCheck = await AsyncStorage.getItem(LAST_CHECK_KEY);
        if (lastCheck) {
            const elapsed = Date.now() - parseInt(lastCheck, 10);
            if (elapsed < MIN_INTERVAL_MS) {
                console.log('[NotifScheduler] Verificação recente, pulando.');
                return;
            }
        }
    } catch {
        // AsyncStorage falhou — prossegue mesmo assim
    }

    try {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const amanha = new Date(hoje);
        amanha.setDate(amanha.getDate() + 1);

        // 1. Busca todas as pendentes
        const pendentes = await database.get('entregas').query(
            Q.where('status', 'pendente'),
        ).fetch() as any[];

        // 2. Vencidas (prazo vigente — já considerando prorrogação/antecipação — < hoje)
        const vencidas = pendentes.filter((e: any) => {
            const prazo = getPrazoVigente(e);
            return !!prazo && prazo < hoje;
        });

        if (vencidas.length > 0) {
            await scheduleLocalNotification(
                `⚠️ ${vencidas.length} entrega${vencidas.length > 1 ? 's' : ''} com prazo vencido`,
                `Você tem ${vencidas.length} entrega${vencidas.length > 1 ? 's' : ''} com data de previsão já passada. Registre o quanto antes.`,
                { screen: 'Notifications' },
            );
        }

        // 3. Previstas para hoje (notifica só se ainda não vencidas)
        const paraHoje = pendentes.filter((e: any) => {
            const prazo = getPrazoVigente(e);
            return !!prazo && prazo >= hoje && prazo < amanha;
        });

        if (paraHoje.length > 0) {
            // Delay de 3s para não empilhar com a notificação de vencidas
            await scheduleLocalNotification(
                `📦 ${paraHoje.length} entrega${paraHoje.length > 1 ? 's' : ''} prevista${paraHoje.length > 1 ? 's' : ''} para hoje`,
                `Você tem ${paraHoje.length} entrega${paraHoje.length > 1 ? 's' : ''} agendada${paraHoje.length > 1 ? 's' : ''} para hoje.`,
                { screen: 'Notifications' },
                vencidas.length > 0 ? 3 : 0,
            );
        }

        // 4. Sincronização concluída com sucesso (apenas informativo, sem spam)
        // Só notifica se havia pendências ou se é a primeira sync do dia
        const totalPendentes = pendentes.length;
        if (vencidas.length === 0 && paraHoje.length === 0 && totalPendentes === 0) {
            await scheduleLocalNotification(
                '✅ Banco atualizado',
                'Todas as guias estão sincronizadas e atualizadas.',
                { screen: 'Home' },
                1,
            );
        }

        // Salva timestamp da verificação
        await AsyncStorage.setItem(LAST_CHECK_KEY, String(Date.now()));

        console.log(`[NotifScheduler] Verificação concluída. Vencidas: ${vencidas.length}, Hoje: ${paraHoje.length}`);
    } catch (err) {
        console.warn('[NotifScheduler] Erro ao verificar notificações:', err);
    }
}

/**
 * Reseta o timer de throttle — útil para forçar verificação após login.
 */
export async function resetNotificationThrottle(): Promise<void> {
    await AsyncStorage.removeItem(LAST_CHECK_KEY);
}
