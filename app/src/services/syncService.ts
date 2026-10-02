import { SafeStorage as storage } from '../utils/safeStorage';
import api from './network';
import NetInfo from '@react-native-community/netinfo';

export interface SyncRequest {
  id: string;
  url: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  data: any;
  timestamp: string;
}

const SYNC_QUEUE_KEY = 'offline_sync_queue';

/**
 * Adiciona uma requisição na fila para ser enviada quanto tiver internet
 */
export const queueRequest = async (url: string, method: SyncRequest['method'], data: any) => {
  try {
    const queueStr = await storage.getItem(SYNC_QUEUE_KEY);
    const queue: SyncRequest[] = queueStr ? JSON.parse(queueStr) : [];
    
    queue.push({
      id: Date.now().toString() + Math.random().toString(36).substring(7),
      url,
      method,
      data,
      timestamp: new Date().toISOString()
    });

    await storage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    console.log(`[SYNC] Requisição enfileirada: ${method} ${url}`);
    return true;
  } catch (error) {
    console.error('[SYNC] Erro ao enfileirar requisição', error);
    return false;
  }
};

/**
 * Tenta processar toda a fila pendente
 */
export const processSyncQueue = async () => {
  try {
    // 1. Verificar conexão real antes de tentar esvaziar a fila
    const network = await NetInfo.fetch();
    if (!network.isConnected) {
      console.log('[SYNC] Offline. Processamento manual abortado.');
      return { success: false, pending: -1 };
    }

    const queueStr = await storage.getItem(SYNC_QUEUE_KEY);
    if (!queueStr) return { success: true, pending: 0 };
    
    let queue: SyncRequest[] = JSON.parse(queueStr);
    if (queue.length === 0) return { success: true, pending: 0 };

    console.log(`[SYNC] Processando fila com ${queue.length} itens...`);
    const remainingQueue: SyncRequest[] = [];

    for (const req of queue) {
      try {
        console.log(`[SYNC] Enviando ${req.method} ${req.url}...`);
        
        await api({
          method: req.method,
          url: req.url,
          data: req.data
        });
        
        console.log(`[SYNC] ✅ Sucesso: ${req.url}`);
      } catch (error: any) {
        console.error(`[SYNC] ❌ Falha ao sincronizar ${req.url}:`, error.message);
        
        // Se retornar 400 ou 422 é por erro do input (requisição ruim). Não re-tenta.
        // Já se for erro da rede (sem resposta) ou 5xx (servidor ocupado), mantém na fila.
        const status = error.response?.status;
        if (status && (status >= 400 && status < 500) && status !== 401 && status !== 429) {
           console.log('[SYNC] Item descartado por erro do cliente (4xx)');
        } else {
           remainingQueue.push(req); // Mantém para próxima tentativa
        }
      }
    }

    // Salva o que restou (se houve falhas de conexão no meio da fila)
    if (remainingQueue.length === 0) {
      await storage.removeItem(SYNC_QUEUE_KEY);
    } else {
      await storage.setItem(SYNC_QUEUE_KEY, JSON.stringify(remainingQueue));
    }

    return { 
      success: remainingQueue.length === 0, 
      pending: remainingQueue.length 
    };
    
  } catch (error) {
    console.error('[SYNC] Erro crasso ao processar fila:', error);
    return { success: false, pending: -1 };
  }
};
