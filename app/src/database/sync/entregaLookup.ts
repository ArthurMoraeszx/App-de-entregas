import { Q } from '@nozbe/watermelondb';
import type Entrega from '../models/Entrega';

/**
 * Busca um registro de entrega local pelo id do WatermelonDB, com fallback por num_guia.
 *
 * O id local pode ficar órfão quando a guia é reatribuída/concluída por outro
 * motorista (distribuição emergencial: todos os motoristas veem todas as guias,
 * ver syncService) ou substituída por um pull concorrente entre a listagem na
 * Home e a confirmação do motorista aqui. num_guia é a chave estável usada no
 * resto do app (backups, upload de foto, retries), então serve de recuperação
 * confiável quando o id não bate mais.
 *
 * Lança 'GUIA_NAO_ENCONTRADA' quando nem o id nem o num_guia resolvem — nesse
 * caso a guia genuinamente não existe mais localmente.
 */
export async function findEntregaRecordSafe(
    database: { get: (table: string) => any } | null,
    entregaId: string,
    numGuia: string,
): Promise<Entrega> {
    if (!database) throw new Error('Banco de dados não inicializado. Reinicie o aplicativo.');

    try {
        return await database.get('entregas').find(entregaId);
    } catch {
        const porNumGuia = await database
            .get('entregas')
            .query(Q.where('num_guia', numGuia))
            .fetch();
        if (porNumGuia.length > 0) return porNumGuia[0];
        throw new Error('GUIA_NAO_ENCONTRADA');
    }
}
