beforeEach(() => {
    jest.resetModules();
});

// Mocks declarados antes do require do módulo
jest.mock('../src/utils/safeStorage', () => ({
    SafeStorage: {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
    },
}));

// Impede que syncData inicie WatermelonDB ou HTTP calls
jest.mock('../src/database', () => ({ database: null }));
jest.mock('../src/services/network', () => ({ default: { get: jest.fn(), post: jest.fn() } }));

const getModule = () => require('../src/database/sync/syncService');
const getStorage = () => require('../src/utils/safeStorage').SafeStorage;

const RETRY_KEY = '@sync:upload_retries_v2';
const LEGACY_KEY = '@sync:upload_retries';
const COOLDOWN_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers de cenário
// ---------------------------------------------------------------------------

function makeRetryMap(overrides: Record<string, { count: number; at: number }>) {
    return JSON.stringify(overrides);
}

function msAgo(ms: number) {
    return Date.now() - ms;
}

// ---------------------------------------------------------------------------
// Lógica de cooldown — shouldRetry (testada indiretamente via getStuckGuiasCount)
// ---------------------------------------------------------------------------

describe('Retry logic de upload de fotos — time-based', () => {
    it('deve permitir upload na primeira tentativa (sem entrada no mapa)', async () => {
        const storage = getStorage();
        storage.getItem.mockResolvedValue(null); // mapa vazio

        const { resetUploadRetries } = getModule();
        await resetUploadRetries();

        expect(storage.removeItem).toHaveBeenCalledWith(LEGACY_KEY);
        expect(storage.setItem).toHaveBeenCalledWith(RETRY_KEY, '{}');
    });

    it('deve contar guia como "stuck" quando última tentativa foi há menos de 30 min', async () => {
        const storage = getStorage();
        storage.getItem.mockResolvedValue(
            makeRetryMap({ '9999_guia': { count: 2, at: msAgo(5 * 60 * 1000) } }),
        );

        const { getStuckGuiasCount } = getModule();
        expect(await getStuckGuiasCount()).toBe(1);
    });

    it('deve NÃO contar guia como "stuck" quando cooldown de 30 min passou', async () => {
        const storage = getStorage();
        storage.getItem.mockResolvedValue(
            makeRetryMap({ '9999_guia': { count: 3, at: msAgo(COOLDOWN_MS + 60_000) } }),
        );

        const { getStuckGuiasCount } = getModule();
        expect(await getStuckGuiasCount()).toBe(0);
    });

    it('deve NÃO parar permanentemente mesmo após muitas falhas', async () => {
        const storage = getStorage();
        // 50 falhas, mas última foi há 31 min (cooldown passou)
        storage.getItem.mockResolvedValue(
            makeRetryMap({ '1234_guia': { count: 50, at: msAgo(COOLDOWN_MS + 60_000) } }),
        );

        const { getStuckGuiasCount } = getModule();
        // Mesmo com 50 falhas, o cooldown passou → não está "stuck"
        expect(await getStuckGuiasCount()).toBe(0);
    });

    it('deve agrupar chaves guia e questionario da mesma guia em 1 stuck', async () => {
        const storage = getStorage();
        const recentAt = msAgo(60_000); // 1 min atrás
        storage.getItem.mockResolvedValue(
            makeRetryMap({
                '5555_guia': { count: 1, at: recentAt },
                '5555_questionario': { count: 1, at: recentAt },
                '6666_guia': { count: 1, at: recentAt },
            }),
        );

        const { getStuckGuiasCount } = getModule();
        // 5555 e 6666 = 2 guias stuck (não 3 entradas)
        expect(await getStuckGuiasCount()).toBe(2);
    });

    it('resetUploadRetries deve limpar a chave v2 E a chave legada', async () => {
        const storage = getStorage();
        storage.getItem.mockResolvedValue(null);

        const { resetUploadRetries } = getModule();
        await resetUploadRetries();

        expect(storage.setItem).toHaveBeenCalledWith(RETRY_KEY, '{}');
        expect(storage.removeItem).toHaveBeenCalledWith(LEGACY_KEY);
    });
});

// ---------------------------------------------------------------------------
// Casos de borda do cooldown
// ---------------------------------------------------------------------------

describe('Cooldown — casos de borda', () => {
    it('entrada a 1 segundo do fim do cooldown ainda bloqueia', async () => {
        const storage = getStorage();
        // COOLDOWN_MS - 1s atrás: Date.now() - entry.at < COOLDOWN_MS → não é maior → stuck
        storage.getItem.mockResolvedValue(
            makeRetryMap({ '7777_guia': { count: 1, at: msAgo(COOLDOWN_MS - 1000) } }),
        );

        const { getStuckGuiasCount } = getModule();
        // shouldRetry retorna false → guia ainda está em cooldown
        expect(await getStuckGuiasCount()).toBe(1);
    });

    it('mapa vazio resulta em 0 stuck', async () => {
        const storage = getStorage();
        storage.getItem.mockResolvedValue('{}');

        const { getStuckGuiasCount } = getModule();
        expect(await getStuckGuiasCount()).toBe(0);
    });

    it('mapa null resulta em 0 stuck', async () => {
        const storage = getStorage();
        storage.getItem.mockResolvedValue(null);

        const { getStuckGuiasCount } = getModule();
        expect(await getStuckGuiasCount()).toBe(0);
    });

    it('mistura de stuck e liberados — conta apenas os stuck', async () => {
        const storage = getStorage();
        storage.getItem.mockResolvedValue(
            makeRetryMap({
                '1111_guia': { count: 1, at: msAgo(2 * 60 * 1000) },         // stuck (2 min atrás)
                '2222_guia': { count: 2, at: msAgo(COOLDOWN_MS + 60_000) },   // liberado (31 min atrás)
                '3333_guia': { count: 1, at: msAgo(10 * 60 * 1000) },          // stuck (10 min atrás)
                '4444_questionario': { count: 1, at: msAgo(COOLDOWN_MS + 1) }, // borderline liberado
            }),
        );

        const { getStuckGuiasCount } = getModule();
        // 1111 stuck, 2222 liberado, 3333 stuck, 4444 borderline (> cooldown) liberado
        expect(await getStuckGuiasCount()).toBe(2);
    });

    it('após resetUploadRetries o mapa fica vazio → 0 stuck', async () => {
        const storage = getStorage();
        // Simula reset bem-sucedido: setItem grava '{}', depois getItem retorna '{}'
        storage.setItem.mockResolvedValue(undefined);
        storage.removeItem.mockResolvedValue(undefined);
        storage.getItem.mockResolvedValue('{}');

        const { resetUploadRetries, getStuckGuiasCount } = getModule();
        await resetUploadRetries();

        expect(await getStuckGuiasCount()).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Múltiplas guias — contagem correta
// ---------------------------------------------------------------------------

describe('Contagem com múltiplas guias', () => {
    it('reconhece 3 guias distintas como 3 stuck', async () => {
        const storage = getStorage();
        const recentAt = msAgo(60_000);
        storage.getItem.mockResolvedValue(
            makeRetryMap({
                '100_guia': { count: 1, at: recentAt },
                '200_guia': { count: 1, at: recentAt },
                '300_guia': { count: 1, at: recentAt },
            }),
        );

        const { getStuckGuiasCount } = getModule();
        expect(await getStuckGuiasCount()).toBe(3);
    });

    it('guia com ambos os campos stuck mas ambos no cooldown conta como 1', async () => {
        const storage = getStorage();
        const recentAt = msAgo(60_000);
        storage.getItem.mockResolvedValue(
            makeRetryMap({
                '999_guia': { count: 2, at: recentAt },
                '999_questionario': { count: 3, at: recentAt },
            }),
        );

        const { getStuckGuiasCount } = getModule();
        expect(await getStuckGuiasCount()).toBe(1);
    });
});
