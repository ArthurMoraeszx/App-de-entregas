import { findEntregaRecordSafe } from '../src/database/sync/entregaLookup';

// Fábrica de uma coleção WatermelonDB fake: find() e query().fetch() controláveis por teste.
function makeFakeDatabase(opts: {
    findResult?: any;
    findError?: Error;
    queryResult?: any[];
}) {
    const collection = {
        find: jest.fn(async () => {
            if (opts.findError) throw opts.findError;
            return opts.findResult;
        }),
        query: jest.fn(() => ({
            fetch: jest.fn(async () => opts.queryResult ?? []),
        })),
    };
    return { get: jest.fn(() => collection) };
}

describe('findEntregaRecordSafe', () => {
    it('retorna o registro direto quando o id local ainda existe', async () => {
        const record = { id: 'wdb-1', num_guia: '1234' };
        const db = makeFakeDatabase({ findResult: record });

        const result = await findEntregaRecordSafe(db as any, 'wdb-1', '1234');

        expect(result).toBe(record);
        expect(db.get).toHaveBeenCalledWith('entregas');
    });

    it('cai para busca por num_guia quando o id local não é encontrado', async () => {
        const record = { id: 'wdb-novo', num_guia: '5678' };
        const db = makeFakeDatabase({
            findError: new Error('Record entregas#wdb-antigo not found'),
            queryResult: [record],
        });

        const result = await findEntregaRecordSafe(db as any, 'wdb-antigo', '5678');

        expect(result).toBe(record);
    });

    it('lança GUIA_NAO_ENCONTRADA quando nem id nem num_guia resolvem', async () => {
        const db = makeFakeDatabase({
            findError: new Error('not found'),
            queryResult: [],
        });

        await expect(findEntregaRecordSafe(db as any, 'wdb-sumiu', '9999')).rejects.toThrow(
            'GUIA_NAO_ENCONTRADA',
        );
    });

    it('lança erro claro quando o banco não está inicializado', async () => {
        await expect(findEntregaRecordSafe(null, 'qualquer', '1111')).rejects.toThrow(
            'não inicializado',
        );
    });

    it('usa o primeiro resultado quando a busca por num_guia retorna mais de um registro', async () => {
        const primeiro = { id: 'a', num_guia: '2222' };
        const segundo = { id: 'b', num_guia: '2222' };
        const db = makeFakeDatabase({
            findError: new Error('not found'),
            queryResult: [primeiro, segundo],
        });

        const result = await findEntregaRecordSafe(db as any, 'id-orfao', '2222');

        expect(result).toBe(primeiro);
    });
});
