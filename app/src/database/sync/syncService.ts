import { synchronize } from '@nozbe/watermelondb/sync';
import { Q } from '@nozbe/watermelondb';
import { database } from '../index';
import api from '../../services/network';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { SafeStorage } from '../../utils/safeStorage';
import { processRowFoto } from '../../utils/processRowFoto';
import { isUriLocal, PADROES_LOCAIS_SQL } from '../../utils/fotoUri';
import { getDeviceId } from '../../utils/deviceId';
import Entrega from '../models/Entrega';
import { queueDiagnosticEvent } from '../../utils/diagnostics';
import type { EntregaStatusValue } from '../../utils/entregaAtraso';

// ---------------------------------------------------------------------------
// Backup de dados críticos em SafeStorage
//
// Terceira camada de proteção (além do pull guard e do write antecipado).
// Cobre o caso extremo onde o WatermelonDB é limpo (reinstalação, clear de dados)
// mas o AsyncStorage (SafeStorage) sobrevive. O backup é criado no momento
// do registro pelo motorista e apagado quando o servidor confirma os dados via pull.
// ---------------------------------------------------------------------------

const BACKUP_KEY_PREFIX = '@entrega:backup:';

export type DeliveryBackup = {
    data_hora_entrega: number | null;
    latitude: number | null;
    longitude: number | null;
    tipo_entrega?: string | null;
    foto_questionario_servidor?: string | null;
    status?: string | null;
    savedAt: number;
};

export async function saveDeliveryBackup(
    numGuia: string,
    data: Omit<DeliveryBackup, 'savedAt'>,
): Promise<void> {
    try {
        // Faz merge com o backup existente para não perder campos já salvos em etapas anteriores.
        // Ex.: o backup da Etapa 2 passa data_hora_entrega=null, mas o da Etapa 1 já tem o valor real.
        const existing = await loadDeliveryBackup(numGuia);
        const merged: DeliveryBackup = {
            data_hora_entrega: data.data_hora_entrega ?? existing?.data_hora_entrega ?? null,
            latitude: data.latitude ?? existing?.latitude ?? null,
            longitude: data.longitude ?? existing?.longitude ?? null,
            tipo_entrega: data.tipo_entrega ?? existing?.tipo_entrega ?? null,
            foto_questionario_servidor: data.foto_questionario_servidor ?? existing?.foto_questionario_servidor ?? null,
            status: data.status ?? existing?.status ?? null,
            savedAt: Date.now(),
        };
        await SafeStorage.setItem(`${BACKUP_KEY_PREFIX}${numGuia}`, JSON.stringify(merged));
    } catch { /* backup é best-effort, nunca bloqueia o fluxo */ }
}

export async function loadDeliveryBackup(numGuia: string): Promise<DeliveryBackup | null> {
    try {
        const raw = await SafeStorage.getItem(`${BACKUP_KEY_PREFIX}${numGuia}`);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

async function clearDeliveryBackup(numGuia: string): Promise<void> {
    try {
        await SafeStorage.removeItem(`${BACKUP_KEY_PREFIX}${numGuia}`);
    } catch { /* ignora */ }
}

// ---------------------------------------------------------------------------
// Pré-upload individual de fotos
//
// Envia cada foto diretamente ao servidor antes de rodar o sync WatermelonDB.
// Isso mantém o payload do push leve (sem base64) e isola falhas por guia.
// ---------------------------------------------------------------------------

const UPLOAD_RETRY_KEY = '@sync:upload_retries_v2';
// Entre tentativas automáticas: 30 min de cooldown. Nunca para permanentemente.
const RETRY_COOLDOWN_MS = 30 * 60 * 1000;

type RetryEntry = { count: number; at: number };
type RetryMap = Record<string, RetryEntry>;

async function loadRetries(): Promise<RetryMap> {
    const raw = await SafeStorage.getItem(UPLOAD_RETRY_KEY);
    return raw ? JSON.parse(raw) : {};
}

async function saveRetries(retries: RetryMap): Promise<void> {
    await SafeStorage.setItem(UPLOAD_RETRY_KEY, JSON.stringify(retries));
}

function shouldRetry(entry?: RetryEntry): boolean {
    if (!entry) return true;
    return Date.now() - entry.at > RETRY_COOLDOWN_MS;
}

export async function uploadPhotoFile(
    numGuia: string,
    fileUri: string,
    tipo: 'guia' | 'questionario',
    onProgress?: (percent: number) => void,
): Promise<string | null> {
    try {
        const deviceId = await getDeviceId();
        const nomeArquivo = `${numGuia}_${tipo}.jpg`;
        const formData = new FormData();

        if (Platform.OS === 'web') {
            // No navegador o FormData é o do próprio browser: ele só aceita Blob
            // ou File como arquivo. Passando o objeto { uri, type, name } do React
            // Native, o campo vira a string "[object Object]" e o servidor recebe
            // um texto no lugar da imagem — com status 200, sem erro visível.
            const resposta = await fetch(fileUri);
            const blob = await resposta.blob();
            formData.append('foto', blob, nomeArquivo);
        } else {
            // React Native lida com file:// nativamente, sem FileReader nem a
            // inflação de +33% que o base64 causaria.
            formData.append('foto', { uri: fileUri, type: 'image/jpeg', name: nomeArquivo } as any);
        }

        formData.append('num_guia', String(numGuia));
        formData.append('tipo', tipo);
        formData.append('device_id', deviceId);

        const response = await api.post('mobile/fotos/upload', formData, {
            // No navegador o cabeçalho precisa sair em branco: quem monta o
            // "multipart/form-data; boundary=..." é o próprio browser. Definir
            // 'multipart/form-data' na mão apaga o boundary e o servidor não
            // consegue separar os campos do corpo da requisição.
            headers: Platform.OS === 'web'
                ? { 'Content-Type': undefined as unknown as string }
                : { 'Content-Type': 'multipart/form-data' },
            timeout: 300000, // 5 min — redes lentas de campo
            onUploadProgress: (event: any) => {
                if (onProgress && event.total && event.total > 0) {
                    onProgress(Math.round((event.loaded / event.total) * 100));
                }
            },
        });
        if (onProgress) onProgress(100);
        return (response.data?.data?.caminho as string) ?? null;
    } catch (err: any) {
        console.warn(`[Sync] Upload guia ${numGuia} (${tipo}) falhou:`, err?.message ?? err);
        queueDiagnosticEvent({
            error_type: err?.response ? 'server' : 'network',
            error_code: err?.response?.status ? String(err.response.status) : (err?.code ?? 'upload_failed'),
            context: 'photo_upload',
            occurred_at: Date.now(),
            extra: { num_guia: numGuia, tipo },
        }).catch(() => {});
        return null;
    }
}

async function uploadPendingPhotos(): Promise<void> {
    if (!database) return;

    // Registros com foto ainda local, não confirmada no servidor.
    // Os prefixos possíveis estão em utils/fotoUri (file://, content://, data:, blob:).
    const isLocalUri = (field: string) =>
        Q.or(...PADROES_LOCAIS_SQL.map((padrao) => Q.where(field, Q.like(padrao))));
    const noServer = (field: string) => Q.or(Q.where(field, Q.eq(null)), Q.where(field, Q.eq('')));

    const pending = await database
        .get<Entrega>('entregas')
        .query(
            Q.or(
                Q.and(isLocalUri('foto'), noServer('foto_servidor')),
                Q.and(isLocalUri('foto_questionario'), noServer('foto_questionario_servidor')),
            ),
        )
        .fetch();

    if (pending.length === 0) return;

    console.log(`[Sync] Pré-upload: ${pending.length} guia(s) com foto(s) pendente(s)`);

    const retries = await loadRetries();

    type Updates = {
        foto_servidor?: string;
        foto?: string;
        foto_questionario_servidor?: string;
        foto_questionario?: string;
    };
    type PendingWrite = { record: Entrega; updates: Updates; localUrisToDelete: string[] };
    type BrokenRef = { record: Entrega; clearFoto: boolean; clearFotoQuestionario: boolean };

    const toWrite: PendingWrite[] = [];
    const toClear: BrokenRef[] = [];

    for (const record of pending) {
        const numGuia = record.num_guia;
        const guiaKey = `${numGuia}_guia`;
        const questionarioKey = `${numGuia}_questionario`;

        const isLocal = isUriLocal;

        const needsGuia = isLocal(record.foto) && !record.foto_servidor;
        const needsQuestionario = isLocal(record.foto_questionario) && !record.foto_questionario_servidor;
        const guiaEntry = retries[guiaKey];
        const questionarioEntry = retries[questionarioKey];
        const now = Date.now();

        // Verifica existência no disco (apenas file://, content:// são verificados implicitamente no upload)
        let guiaFileOk = true;
        let questionarioFileOk = true;

        if (needsGuia && record.foto!.startsWith('file://')) {
            const info = await FileSystem.getInfoAsync(record.foto!).catch(() => null);
            guiaFileOk = info?.exists ?? true;
            if (!guiaFileOk) {
                console.warn(`[Sync] Guia ${numGuia}: foto da guia não encontrada no disco — referência removida`);
                queueDiagnosticEvent({ error_type: 'local_db', error_code: 'foto_not_found', context: 'photo_missing_disk', occurred_at: Date.now(), extra: { num_guia: numGuia, tipo: 'guia' } }).catch(() => {});
            }
        }
        if (needsQuestionario && record.foto_questionario!.startsWith('file://')) {
            const info = await FileSystem.getInfoAsync(record.foto_questionario!).catch(() => null);
            questionarioFileOk = info?.exists ?? true;
            if (!questionarioFileOk) {
                console.warn(`[Sync] Guia ${numGuia}: foto do questionário não encontrada no disco — referência removida`);
                queueDiagnosticEvent({ error_type: 'local_db', error_code: 'foto_not_found', context: 'photo_missing_disk', occurred_at: Date.now(), extra: { num_guia: numGuia, tipo: 'questionario' } }).catch(() => {});
            }
        }

        if ((needsGuia && !guiaFileOk) || (needsQuestionario && !questionarioFileOk)) {
            toClear.push({ record, clearFoto: needsGuia && !guiaFileOk, clearFotoQuestionario: needsQuestionario && !questionarioFileOk });
        }

        // Dispara os dois uploads em paralelo quando ambos estão pendentes, fora do cooldown e arquivo existe
        const [caminhoGuia, caminhoQuestionario] = await Promise.all([
            needsGuia && guiaFileOk && shouldRetry(guiaEntry)
                ? uploadPhotoFile(numGuia, record.foto!, 'guia')
                : Promise.resolve(null),
            needsQuestionario && questionarioFileOk && shouldRetry(questionarioEntry)
                ? uploadPhotoFile(numGuia, record.foto_questionario!, 'questionario')
                : Promise.resolve(null),
        ]);

        const updates: Updates = {};
        const localUrisToDelete: string[] = [];

        if (needsGuia && guiaFileOk) {
            if (!shouldRetry(guiaEntry)) {
                const wait = Math.ceil((RETRY_COOLDOWN_MS - (now - (guiaEntry?.at ?? 0))) / 60000);
                console.log(`[Sync] Guia ${numGuia} (foto guia): cooldown — próxima tentativa em ${wait} min.`);
            } else if (caminhoGuia) {
                updates.foto_servidor = caminhoGuia;
                // Substitui URI local pelo caminho do servidor no WDB para que o arquivo
                // possa ser apagado do disco com segurança — sem risco de re-upload perdido.
                updates.foto = caminhoGuia;
                localUrisToDelete.push(record.foto!);
                delete retries[guiaKey];
            } else {
                retries[guiaKey] = { count: (guiaEntry?.count ?? 0) + 1, at: now };
            }
        }

        if (needsQuestionario && questionarioFileOk) {
            if (!shouldRetry(questionarioEntry)) {
                const wait = Math.ceil((RETRY_COOLDOWN_MS - (now - (questionarioEntry?.at ?? 0))) / 60000);
                console.log(`[Sync] Guia ${numGuia} (foto questionário): cooldown — próxima tentativa em ${wait} min.`);
            } else if (caminhoQuestionario) {
                updates.foto_questionario_servidor = caminhoQuestionario;
                updates.foto_questionario = caminhoQuestionario;
                localUrisToDelete.push(record.foto_questionario!);
                delete retries[questionarioKey];
            } else {
                retries[questionarioKey] = { count: (questionarioEntry?.count ?? 0) + 1, at: now };
            }
        }

        if (Object.keys(updates).length > 0) {
            toWrite.push({ record, updates, localUrisToDelete });
        }
    }

    // Limpa URIs quebradas (arquivos desaparecidos do disco)
    if (toClear.length > 0) {
        await database.write(async () => {
            for (const { record, clearFoto, clearFotoQuestionario } of toClear) {
                await record.update((r: any) => {
                    if (clearFoto) r.foto = null;
                    if (clearFotoQuestionario) r.foto_questionario = null;
                });
            }
        });
    }

    // Atualiza WDB: substitui URIs locais por caminhos do servidor e persiste foto_servidor
    const urisParaApagar: string[] = [];
    if (toWrite.length > 0) {
        await database.write(async () => {
            for (const { record, updates } of toWrite) {
                await record.update((r: any) => {
                    if (updates.foto_servidor) r.foto_servidor = updates.foto_servidor;
                    if (updates.foto) r.foto = updates.foto;
                    if (updates.foto_questionario_servidor) r.foto_questionario_servidor = updates.foto_questionario_servidor;
                    if (updates.foto_questionario) r.foto_questionario = updates.foto_questionario;
                });
            }
        });
        for (const { localUrisToDelete } of toWrite) urisParaApagar.push(...localUrisToDelete);
    }

    // Apaga arquivos locais confirmados no servidor — fire-and-forget, nunca bloqueia o sync
    if (urisParaApagar.length > 0) {
        Promise.all(
            urisParaApagar.map(uri => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}))
        ).catch(() => {});
    }

    await saveRetries(retries);

    // Recuperação de registros presos: quando o push anterior foi silenciosamente ignorado
    // pelo backend (bug da foto URI local), o WatermelonDB limpou o flag dirty e o pull
    // sobrescreveu o status local com 'pendente'. Esses registros têm foto_servidor setada
    // mas status ainda em 'pendente' — precisam ser reenviados.
    // IMPORTANTE: filtrar pelo id_motorista da sessão para não tocar em guias de outros
    // motoristas que chegaram via pull (todos veem todas as guias por design de emergência).
    await resolveStuckRecords();
}

/**
 * Detecta e corrige registros presos: foto já enviada ao servidor mas status desatualizado.
 * Chamado em duas fases dentro de syncData():
 *   1. Antes do pull/push — captura casos de syncs anteriores que falharam silenciosamente.
 *   2. Após o pull/push  — captura casos onde o pull restaurou foto_servidor via backup,
 *      deixando o status desatualizado no mesmo ciclo de sync.
 *
 * Cobre dois cenários de registro preso:
 *   a) status='pendente' com foto_servidor já confirmada (guia da Etapa 1 nunca avançou).
 *   b) status='aguardando_questionario' com foto_questionario_servidor já confirmada
 *      (guia teve a Etapa 2 confirmada no servidor — inclusive por edição direta no
 *      painel web, ex.: botão "Substituir" — mas o dispositivo nunca recebeu a promoção
 *      pra 'concluida'/'parcial' porque o pull que traria isso nunca chegou a aplicar).
 */
async function resolveStuckRecords(): Promise<void> {
    if (!database) return;

    let currentIdMotorista: number | null = null;
    try {
        const userData = await SafeStorage.getItem('user_data');
        if (userData) currentIdMotorista = JSON.parse(userData)?.id_motorista ?? null;
    } catch { /* ignora — recovery não roda sem motorista identificado */ }

    if (currentIdMotorista == null) return;

    const stuck = await database
        .get<Entrega>('entregas')
        .query(
            Q.where('foto_servidor', Q.like('guias/%')),
            Q.where('status', 'pendente'),
            Q.where('id_motorista', currentIdMotorista),
        )
        .fetch();

    if (stuck.length > 0) {
        console.log(`[Sync] Recuperando ${stuck.length} guia(s) presa(s) — foto já enviada mas status nunca atualizado no servidor.`);
        // Achado em 19/08/2026: essa recuperação nunca reportava nada pro servidor —
        // só console.log, invisível em mobile_diagnostics/Sentry. Sem isso, um device
        // que reprocessa o mesmo lote de guias repetidamente (padrão observado no caso
        // do Alexandre, 90→138 guias entre 17 e 19/08, sempre a partir da mesma guia
        // mais antiga) não deixava nenhum rastro do porquê — só o efeito colateral
        // (synced_at mudando) via query direta no banco.
        queueDiagnosticEvent({
            error_type: 'local_db',
            error_code: 'stuck_recovered',
            context: 'stuck_recovery',
            occurred_at: Date.now(),
            extra: { count: stuck.length, num_guias: stuck.map((r) => r.num_guia).slice(0, 30) },
        }).catch(() => {});
        await database.write(async () => {
            for (const record of stuck) {
                await record.update((r: any) => {
                    // foto_questionario_servidor pode vir de backup SafeStorage de sessões anteriores.
                    // Só promove para concluida se o motorista realmente confirmou o questionário
                    // nesta sessão: foto_questionario local também precisa estar setado com caminho
                    // de servidor (guias/...), indicando que o upload foi confirmado neste fluxo.
                    const fotoQServidor = (r as any).foto_questionario_servidor;
                    const fotoQLocal = (r as any).foto_questionario;
                    const questionarioConfirmado =
                        fotoQServidor?.startsWith('guias/') &&
                        fotoQLocal?.startsWith('guias/');
                    if (questionarioConfirmado) {
                        r.status = (r as any).tipo_entrega?.toLowerCase() === 'parcial' ? 'parcial' : 'concluida';
                    } else {
                        r.status = 'aguardando_questionario';
                    }
                    r.status_sincronizacao = 'pendente';
                });
            }
        });
    }

    // Cenário (b): guia parada em 'aguardando_questionario' com o questionário já
    // confirmado nos dois lados (servidor e local) — falta só promover o status.
    // Sem isso, uma guia cujo pull nunca chega a aplicar fica exibindo "Aguardando
    // Questionário" pro motorista indefinidamente, mesmo com o servidor já 'concluida'.
    const stuckAguardando = await database
        .get<Entrega>('entregas')
        .query(
            Q.where('foto_questionario_servidor', Q.like('guias/%')),
            Q.where('foto_questionario', Q.like('guias/%')),
            Q.where('status', 'aguardando_questionario'),
            Q.where('id_motorista', currentIdMotorista),
        )
        .fetch();

    if (stuckAguardando.length > 0) {
        console.log(`[Sync] Recuperando ${stuckAguardando.length} guia(s) presa(s) em 'aguardando_questionario' — questionário já confirmado no servidor mas status local nunca avançou.`);
        queueDiagnosticEvent({
            error_type: 'local_db',
            error_code: 'stuck_recovered_aguardando',
            context: 'stuck_recovery',
            occurred_at: Date.now(),
            extra: { count: stuckAguardando.length, num_guias: stuckAguardando.map((r) => r.num_guia).slice(0, 30) },
        }).catch(() => {});
        await database.write(async () => {
            for (const record of stuckAguardando) {
                await record.update((r: any) => {
                    r.status = (r as any).tipo_entrega?.toLowerCase() === 'parcial' ? 'parcial' : 'concluida';
                    r.status_sincronizacao = 'pendente';
                });
            }
        });
    }
}

// ---------------------------------------------------------------------------
// Migração de schema do sync
// ---------------------------------------------------------------------------

const SYNC_MIGRATION_KEY = '@merenda:syncMigration_v2b_gps';

async function applyPendingSyncMigrations(): Promise<void> {
    try {
        const done = await SafeStorage.getItem(SYNC_MIGRATION_KEY);
        if (done) return;

        if (!database) return;

        const adapter = (database.adapter as any);
        if (typeof adapter.removeLocal === 'function') {
            await adapter.removeLocal('__watermelon_last_pulled_at');
            await adapter.removeLocal('__watermelon_last_pulled_schema_version');
        } else if (typeof adapter.setLocal === 'function') {
            await adapter.setLocal('__watermelon_last_pulled_at', null);
            await adapter.setLocal('__watermelon_last_pulled_schema_version', null);
        }

        await SafeStorage.removeItem('last_pulled_at');
        await SafeStorage.setItem(SYNC_MIGRATION_KEY, '1');
        console.log('[Sync] Migração v2 (GPS) aplicada — próxima sync será completa.');
    } catch (err) {
        console.warn('[Sync] Falha ao aplicar migração de sync:', err);
        queueDiagnosticEvent({
            error_type: 'local_db',
            error_code: err instanceof Error ? err.message.slice(0, 100) : 'migration_failed',
            context: 'sync_migration',
            occurred_at: Date.now(),
        }).catch(() => {});
    }
}

// ---------------------------------------------------------------------------
// Mutex global — impede execuções simultâneas
// Se syncData() é chamado enquanto já está rodando, seta flag para reexecutar
// ao final (evita perder o sync disparado pelo reconnect ou AppState).
// ---------------------------------------------------------------------------

let isSyncing = false;
let pendingSyncRequest = false;

// Quando o motivo da falha foi rate limit (429), espera bem mais que o padrão
// antes de reexecutar — martelar o mesmo limite a cada poucos segundos só
// prolonga o tempo em que o registro fica "sujo" (não sincronizado) e
// aumenta a chance de colidir com um pull futuro ("Cannot update a record
// with pending changes"). Respeita o header Retry-After se o servidor mandar.
function getBackoffMs(error: unknown): number {
    const status = (error as any)?.response?.status;
    if (status === 429) {
        const retryAfterHeader = (error as any)?.response?.headers?.['retry-after'];
        const retryAfterSec = retryAfterHeader != null ? parseInt(String(retryAfterHeader), 10) : NaN;
        return !Number.isNaN(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : 60000;
    }
    return 2000;
}

// ---------------------------------------------------------------------------
// syncData — ponto de entrada principal
//
// Fases:
//   1. uploadPendingPhotos — sobe fotos individualmente (leve, idempotente)
//   2. synchronize         — WatermelonDB pull + push (sem fotos no payload)
// ---------------------------------------------------------------------------

/** Retorna quantas guias têm ao menos uma foto em cooldown (aguardando nova tentativa). */
export async function getStuckGuiasCount(): Promise<number> {
    const retries = await loadRetries();
    const stuckGuias = new Set(
        Object.entries(retries)
            .filter(([, entry]) => !shouldRetry(entry))
            .map(([key]) => key.replace(/_guia$|_questionario$/, '')),
    );
    return stuckGuias.size;
}

/** Zera os cooldowns para que o próximo syncData() tente imediatamente todas as guias. */
export async function resetUploadRetries(): Promise<void> {
    await saveRetries({});
    await SafeStorage.removeItem('@sync:upload_retries'); // limpa chave legada (formato antigo)
    console.log('[Sync] Cooldowns zerados — todas as guias serão retentadas na próxima sync.');
}

export async function syncData() {
    if (isSyncing) {
        pendingSyncRequest = true;
        return;
    }

    let lastError: unknown = null;

    try {
        isSyncing = true;
        pendingSyncRequest = false;

        if (!database) {
            console.error('[Sync] Banco de dados não inicializado.');
            return;
        }

        await applyPendingSyncMigrations();

        // Aqui antes havia um `return` quando Platform.OS === 'web', que desligava
        // o ciclo inteiro no navegador. O efeito era silencioso e confuso: o app
        // logava, montava o banco local e ficava para sempre mostrando "nenhuma
        // guia atribuída", sem erro nenhum na tela nem no console. Como rodar no
        // navegador é o caminho de desenvolvimento e de demonstração deste
        // projeto, ele precisa sincronizar de verdade — as duas fases abaixo já
        // tratam as diferenças de plataforma onde elas realmente existem
        // (uploadPhotoFile monta o FormData de outro jeito na web, e a checagem
        // de arquivo em disco só roda para URIs file://).

        // Fase 1: sobe fotos ANTES do sync de dados.
        // Antes rodava em paralelo ("dispara e esquece") para não atrasar o sync — mas
        // uploadPendingPhotos()/resolveStuckRecords() fazem database.write() nos mesmos
        // registros que o synchronize() (Fase 2) pode estar aplicando mudanças remotas ao
        // mesmo tempo, criando a mesma colisão "Cannot update a record with pending changes"
        // que o rate limit de rede também causava. Agora aguarda: custa um ciclo de sync
        // um pouco mais lento quando há fotos pendentes, mas elimina essa corrida interna.
        // Se falhar, não impede a Fase 2 de rodar — fotos pendentes são retentadas depois.
        await uploadPendingPhotos().catch(err => console.warn('[Sync] uploadPendingPhotos:', err));

        // Fase 2: sync WatermelonDB bidirecional (pull restaura backups, push envia ao servidor)
        // Guias que o servidor aceitou (HTTP 200) mas cujo UPDATE afetou 0 linhas.
        // Capturadas aqui para re-enfileiramento após synchronize() — fora do callback
        // para evitar escrever no DB enquanto o WDB ainda gerencia o ciclo de sync.
        let pushFailedGuias: string[] = [];

        await synchronize({
            database,
            sendCreatedAsUpdated: true,

            pullChanges: async ({ lastPulledAt, schemaVersion, migration }) => {
                let localEntregasCount = 0;
                try {
                    localEntregasCount = await database!.get('entregas').query().fetchCount();
                } catch { /* ignora — tratar como zero */ }

                const response = await api.get('mobile/sync/pull', {
                    params: {
                        last_pulled_at: lastPulledAt || 0,
                        schema_version: schemaVersion,
                        migration: JSON.stringify(migration),
                        local_count: localEntregasCount,
                    },
                    timeout: 90000, // pull pode ser lento na primeira sync (muitas guias em GPRS/EDGE)
                });

                const { changes, timestamp } = response.data.data;

                // Normaliza campo id_motorista (legado: vinha como id_motorista_entrega)
                const normalizeEntregas = (rows: any[] = []) =>
                    rows.map((row) => {
                        const n = { ...row };
                        if (n.id_motorista == null && n.id_motorista_entrega != null) {
                            n.id_motorista = n.id_motorista_entrega;
                        }
                        delete n.id_motorista_entrega;
                        return n;
                    });

                if (changes?.entregas) {
                    changes.entregas.updated = normalizeEntregas(changes.entregas.updated);
                    changes.entregas.created = normalizeEntregas(changes.entregas.created);

                    // Proteção de dados do motorista durante o pull.
                    //
                    // Problema: quando o push falha repetidamente (rede, crash), o pull seguinte
                    // traz os dados do servidor (ainda em estado antigo) e sobrescreve os dados
                    // locais do motorista. Quando o push finalmente ocorre, envia valores nulos
                    // ou degradados — e o servidor grava dados errados.
                    //
                    // Regra: para campos escritos exclusivamente pelo motorista, se o servidor
                    // manda null mas o local tem valor, o local vence (push ainda não chegou).
                    // Para status, nunca regredir — local mais avançado sempre vence.
                    if (database && changes.entregas.updated.length > 0) {
                        // Campos: se servidor manda null e local tem valor → preserva local
                        // Campos escritos exclusivamente pelo motorista: servidor null → preserva local.
                        // qtd_entregue e qtd_devolvida são protegidos pelo guard de nivelLocal > 0
                        // (saída antecipada abaixo), pois WDB armazena 0 por padrão — causar falso
                        // positivo para todas as guias pendentes e chamar loadDeliveryBackup em excesso.
                        const CAMPOS_NULL_PROTEGIDOS: string[] = [
                            'data_hora_entrega',
                            'latitude',
                            'longitude',
                            'tipo_entrega',
                            'foto',
                            'foto_servidor',
                            'foto_questionario',
                            'foto_questionario_servidor',
                            'observacao',
                        ];
                        // Progressão de status — pull nunca pode regredir.
                        // 'cancelado' fica com o nível mais alto: é uma decisão do servidor
                        // (Secretaria/admin) que sempre deve vencer, nunca ser tratada como
                        // "regressão" e descartada — sem isso, uma guia cancelada depois de já
                        // estar 'aguardando_questionario'/'parcial'/'concluida' no celular do
                        // motorista nunca chegava a mostrar o cancelamento (achado 31/07/2026).
                        //
                        // `satisfies Record<EntregaStatusValue, number>` torna esse mapa
                        // exaustivo: se um status novo for adicionado à união sem entrar aqui
                        // (ou um nome for digitado errado), o TypeScript acusa erro de
                        // compilação em vez de silenciosamente cair no `?? 0` do fallback —
                        // exatamente o tipo de lacuna que deixou 'cancelado' de fora antes.
                        const STATUS_NIVEL = {
                            pendente: 0,
                            aguardando_questionario: 1,
                            parcial: 2,
                            concluida: 2,
                            devolvido: 2,
                            cancelado: 3,
                        } satisfies Record<EntregaStatusValue, number>;
                        // Lookup seguro: os dados de fato chegam como `any` (linhas cruas do
                        // WatermelonDB/servidor), então a indexação em si continua permissiva
                        // — só a definição acima é checada exaustivamente.
                        const nivelDoStatus = (status: unknown): number =>
                            (STATUS_NIVEL as Record<string, number>)[status as string] ?? 0;

                        // Pré-busca em lote: 1 query WatermelonDB para todos os registros que precisam
                        // de proteção, em vez de N queries individuais dentro do Promise.all.
                        // N queries em paralelo saturavam o banco e travavam o JS thread.
                        // IMPORTANTE: não filtrar por "pendente no servidor + sem data_hora_entrega" aqui.
                        // O WDB faz PULL antes de PUSH — quando o pull ocorre, o servidor ainda
                        // mostra a guia como pendente mesmo que o motorista acabou de completá-la
                        // localmente. O early exit correto está no map callback abaixo, que verifica
                        // o status LOCAL (não do servidor).
                        const idsParaProteger = changes.entregas.updated
                            .filter((row: any) => {
                                const temNull = CAMPOS_NULL_PROTEGIDOS.some((c: string) => row[c] == null);
                                const nivel = nivelDoStatus(row.status);
                                return temNull || nivel < 2;
                            })
                            .map((row: any) => row.id);

                        let localMap = new Map<string, any>();
                        if (idsParaProteger.length > 0) {
                            try {
                                const localRecords = await database!.get<Entrega>('entregas')
                                    .query(Q.where('id', Q.oneOf(idsParaProteger)))
                                    .fetch();
                                for (const r of localRecords) localMap.set(r.id, r);
                            } catch { /* usa mapa vazio — proteção degradada mas não trava */ }
                        }

                        // Pré-carrega backups do SafeStorage para registros onde local também está nulo.
                        // Esses registros podem ter sido corrompidos por um pull anterior (bug: pull
                        // sobrescrevia dados locais antes do push). O backup é a última chance de recuperar
                        // data_hora_entrega, GPS e tipo_entrega sem precisar re-registrar a entrega.
                        const backupRestoreMap = new Map<string, any>();
                        {
                            const candidatos: Array<[string, string]> = [];
                            for (const [wdbId, local] of localMap.entries()) {
                                const nivelL = nivelDoStatus((local as any).status);
                                if (nivelL === 0 && (local as any).data_hora_entrega == null) {
                                    candidatos.push([wdbId, String(wdbId)]);
                                }
                            }
                            if (candidatos.length > 0) {
                                await Promise.all(candidatos.map(async ([wdbId, numGuia]) => {
                                    const b = await loadDeliveryBackup(numGuia);
                                    if (b?.data_hora_entrega) backupRestoreMap.set(wdbId, b);
                                }));
                            }
                        }

                        // Processa em batches de 8 linhas com yield entre cada batch
                        // para liberar o event loop e não travar botões/interações do motorista.
                        const _todasLinhas = changes.entregas.updated;
                        const _BATCH = 8;
                        const _linhasProcessadas: any[] = [];
                        const _processarLinha = async (row: any) => {
                                const numGuia = String(row.num_guia ?? row.id ?? '');

                                // Limpa o backup apenas quando a entrega está completamente sincronizada
                                if (row.data_hora_entrega != null &&
                                    (row.status === 'concluida' || row.status === 'parcial')) {
                                    clearDeliveryBackup(numGuia);
                                }

                                const temNullProtegido = CAMPOS_NULL_PROTEGIDOS.some((c: string) => row[c] == null);
                                const nivelServidor = nivelDoStatus(row.status);
                                if (!temNullProtegido && nivelServidor >= 2) return row;

                                // Lookup síncrono via Map — sem I/O adicional por registro
                                const local = localMap.get(row.id);
                                if (!local) return row;

                                // Saída antecipada: guia pendente que o motorista ainda não tocou.
                                // Verifica backup antes de descartar — o registro pode ter sido corrompido
                                // por um pull anterior que sobrescreveu dados locais antes do push.
                                const nivelLocalCheck = nivelDoStatus((local as any).status);
                                if (nivelLocalCheck === 0 && (local as any).data_hora_entrega == null) {
                                    const backup = backupRestoreMap.get(row.id);
                                    if (!backup) return row; // Genuinamente pendente, sem backup
                                    // Registro corrompido: restaura a partir do SafeStorage backup.
                                    // foto_questionario_servidor NÃO é restaurado aqui: esse campo é setado
                                    // apenas por uploadPendingPhotos desta sessão. Restaurar de backup causaria
                                    // push prematuro de foto_questionario e promoção incorreta para 'concluida'
                                    // via resolveStuckRecords — o path virá do servidor no próximo pull se necessário.
                                    const restaurado: any = { ...row };
                                    if (backup.data_hora_entrega) restaurado.data_hora_entrega = backup.data_hora_entrega;
                                    if (backup.latitude != null) { restaurado.latitude = backup.latitude; restaurado.longitude = backup.longitude ?? restaurado.longitude; }
                                    if (backup.tipo_entrega) restaurado.tipo_entrega = backup.tipo_entrega;
                                    if (backup.status) restaurado.status = backup.status;
                                    console.log(`[Sync] Pull restaurou guia ${numGuia} via SafeStorage backup (dados corrompidos por pull anterior)`);
                                    return restaurado;
                                }

                                const protegido: any = { ...row };

                                // Camada 1: local WatermelonDB vence servidor quando servidor manda null.
                                // O decorator @date do WDB retorna objetos Date — converte para ms (number)
                                // porque o payload do sync WDB espera números brutos, não objetos Date.
                                for (const campo of CAMPOS_NULL_PROTEGIDOS) {
                                    if (row[campo] == null && (local as any)[campo] != null) {
                                        let val = (local as any)[campo];
                                        if (val instanceof Date) val = val.getTime();
                                        protegido[campo] = val;
                                        console.log(`[Sync] Pull protegeu '${campo}' guia ${numGuia}: valor local preservado`);
                                    }
                                }

                                const nivelLocal = nivelDoStatus((local as any).status);
                                if (nivelLocal > nivelServidor) {
                                    protegido.status = (local as any).status;
                                    console.log(`[Sync] Pull protegeu status guia ${numGuia}: '${row.status}' → '${protegido.status}'`);
                                }

                                // Camada 2: SafeStorage backup como último recurso.
                                // Só dispara se data_hora_entrega ainda está nulo após Camada 1 —
                                // é o único campo verdadeiramente crítico aqui. latitude pode
                                // legitimamente ser null (GPS indisponível) e foto_questionario_servidor
                                // é null para todo registro em aguardando_questionario (questionário
                                // não feito ainda), então ambos gerariam I/O desnecessário como gatilho.
                                // Os demais campos (latitude, foto_questionario_servidor, etc.) ainda
                                // são restaurados a partir do backup se encontrado.
                                const aindaNullCritico = protegido.data_hora_entrega == null;
                                if (aindaNullCritico) {
                                    const backup = await loadDeliveryBackup(numGuia);
                                    if (backup) {
                                        if (protegido.data_hora_entrega == null && backup.data_hora_entrega) {
                                            protegido.data_hora_entrega = backup.data_hora_entrega;
                                            console.log(`[Sync] Pull restaurou data_hora_entrega guia ${numGuia} via SafeStorage backup`);
                                        }
                                        if (protegido.latitude == null && backup.latitude != null) {
                                            protegido.latitude = backup.latitude;
                                            protegido.longitude = backup.longitude ?? protegido.longitude;
                                        }
                                        // foto_questionario_servidor NÃO é restaurado de backup: é setado apenas
                                        // por uploadPendingPhotos desta sessão. Se a entrega foi concluída antes,
                                        // o servidor já tem o path e o próximo pull vai trazê-lo naturalmente.
                                        if (protegido.tipo_entrega == null && backup.tipo_entrega) {
                                            protegido.tipo_entrega = backup.tipo_entrega;
                                            console.log(`[Sync] Pull restaurou tipo_entrega guia ${numGuia} via SafeStorage backup`);
                                        }
                                        if (protegido.status == null && backup.status) {
                                            protegido.status = backup.status;
                                        }
                                    }
                                }

                                return protegido;
                        };
                        for (let _i = 0; _i < _todasLinhas.length; _i += _BATCH) {
                            await new Promise<void>(resolve => setTimeout(resolve, 0));
                            const _batch = await Promise.all(_todasLinhas.slice(_i, _i + _BATCH).map(_processarLinha));
                            _linhasProcessadas.push(..._batch);
                        }
                        changes.entregas.updated = _linhasProcessadas;
                    }

                    // Dedup defensivo: se o servidor mandar o mesmo id duas vezes num lote (ex.: bug de
                    // JOIN produzindo linhas duplicadas), o WatermelonDB tenta preparar update duas vezes
                    // na mesma instância antes de despachar e trava com "Cannot update a record with
                    // pending changes" — derrubando o sync inteiro do dispositivo, não só aquele registro.
                    const dedupById = (rows: any[]) => {
                        const seen = new Set<string>();
                        return rows.filter((row) => {
                            if (seen.has(row.id)) return false;
                            seen.add(row.id);
                            return true;
                        });
                    };
                    changes.entregas.updated = dedupById(changes.entregas.updated);
                    changes.entregas.created = dedupById(changes.entregas.created);
                }

                await SafeStorage.setItem('last_pulled_at', String(timestamp));
                return { changes, timestamp };
            },

            pushChanges: async ({ changes, lastPulledAt }) => {
                const anyChanges = changes as any;

                // Normaliza campos de foto antes do push:
                // - URI local com servidor confirmado → usa caminho do servidor
                // - URI local sem servidor → null (COALESCE no backend preserva valor existente)
                // Base64 foi removida: payload pesado causava timeout de 120 s em redes lentas.
                // Fotos pendentes chegam ao servidor via uploadPendingPhotos (multipart, mais eficiente).
                const processRows = (rows: any[] = []) => {
                    for (const row of rows) processRowFoto(row);
                };

                processRows(anyChanges.entregas?.updated);
                processRows(anyChanges.entregas?.created);

                const pushResponse = await api.post(
                    'mobile/sync/push',
                    { changes, last_pulled_at: lastPulledAt },
                    { timeout: 60000 }, // payload leve (sem base64) — 60s é suficiente
                );

                const failed: string[] = (pushResponse.data?.data?.failed_guias as string[]) ?? [];
                if (failed.length > 0) {
                    console.error(`[Push] ❌ Servidor reportou ${failed.length} guia(s) não gravadas: ${failed.join(', ')} — serão reenviadas na próxima sync.`);
                    pushFailedGuias = failed;
                    queueDiagnosticEvent({ error_type: 'server', error_code: 'push_rejected', context: 'sync_push', occurred_at: Date.now(), extra: { failed_guias: failed } }).catch(() => {});
                }
            },

            migrationsEnabledAtVersion: 1,
        });

        // Fase 3: segunda passagem de stuck recovery para capturar registros que o pull
        // restaurou de backup neste mesmo ciclo (foto_servidor estava null antes do pull,
        // agora está preenchida — mas stuck recovery da Fase 1 não os viu).
        await resolveStuckRecords();

        // Fase 4: re-enfileira guias cujo push foi aceito pelo servidor (HTTP 200) mas
        // cujo UPDATE afetou 0 linhas (filtro não bateu, guia não encontrada, etc.).
        // Atualizar status_sincronizacao re-suja o registro no WDB — o próximo sync reenvia.
        if (pushFailedGuias.length > 0 && database) {
            try {
                const failedRecords = await database.get<Entrega>('entregas')
                    .query(Q.where('num_guia', Q.oneOf(pushFailedGuias.map(Number))))
                    .fetch();
                if (failedRecords.length > 0) {
                    await database.write(async () => {
                        for (const record of failedRecords) {
                            await record.update((r: any) => {
                                r.status_sincronizacao = 'pendente';
                            });
                        }
                    });
                    console.log(`[Sync] Re-enfileiradas ${failedRecords.length} guia(s) para reenvio: ${pushFailedGuias.join(', ')}`);
                }
            } catch (err) {
                console.warn('[Sync] Erro ao re-enfileirar guias falhadas:', err);
                // Crítico: se isso falhar, a guia rejeitada pelo servidor fica sem reenvio
                // e o motorista não tem como saber — a UI já mostra como "enviado".
                queueDiagnosticEvent({
                    error_type: 'local_db',
                    error_code: err instanceof Error ? err.message.slice(0, 100) : 'requeue_failed',
                    context: 'push_requeue',
                    occurred_at: Date.now(),
                    extra: { failed_guias: pushFailedGuias },
                }).catch(() => {});
            }
        }

    } catch (error) {
        console.error('❌ Erro na sincronização:', error);
        lastError = error;
        throw error;
    } finally {
        isSyncing = false;
        if (pendingSyncRequest) {
            pendingSyncRequest = false;
            // Backoff maior quando a falha foi rate limit (429) — ver getBackoffMs.
            setTimeout(() => syncData().catch(() => {}), getBackoffMs(lastError));
        }
    }
}
