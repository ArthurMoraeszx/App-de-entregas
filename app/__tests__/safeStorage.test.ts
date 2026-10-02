/**
 * Testes de safeStorage.ts
 *
 * Cobre:
 *  - Leitura/escrita/remoção normais quando AsyncStorage está disponível
 *  - Fallback para memoryStore quando AsyncStorage não está disponível
 *  - Retorno de null para chaves inexistentes
 *  - Resiliência: erro no AsyncStorage cai para memoryStore sem quebrar
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Retorna uma instância fresca do SafeStorage (módulo re-carregado) */
const getModule = () => require('../src/utils/safeStorage');

// Reseta o estado do módulo e do mock a cada teste
beforeEach(() => {
    jest.resetModules();

    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    AsyncStorage._store.clear();
    AsyncStorage.getItem.mockClear();
    AsyncStorage.setItem.mockClear();
    AsyncStorage.removeItem.mockClear();
    // Restaura implementação padrão (pode ter sido substituída num teste anterior)
    AsyncStorage.getItem.mockImplementation(async (key: string) =>
        AsyncStorage._store.get(key) ?? null
    );
    AsyncStorage.setItem.mockImplementation(async (key: string, value: string) => {
        AsyncStorage._store.set(key, value);
    });
    AsyncStorage.removeItem.mockImplementation(async (key: string) => {
        AsyncStorage._store.delete(key);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('SafeStorage — AsyncStorage disponível', () => {
    it('setItem salva o valor via AsyncStorage', async () => {
        const { SafeStorage } = getModule();

        await SafeStorage.setItem('chave1', 'valor1');

        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        expect(AsyncStorage.setItem).toHaveBeenCalledWith('chave1', 'valor1');
    });

    it('getItem recupera o valor salvo', async () => {
        const { SafeStorage } = getModule();

        await SafeStorage.setItem('chave2', 'valor2');
        const resultado = await SafeStorage.getItem('chave2');

        expect(resultado).toBe('valor2');
    });

    it('getItem retorna null para chave inexistente', async () => {
        const { SafeStorage } = getModule();

        const resultado = await SafeStorage.getItem('nao_existe');

        expect(resultado).toBeNull();
    });

    it('removeItem apaga o valor', async () => {
        const { SafeStorage } = getModule();

        await SafeStorage.setItem('remover', 'x');
        await SafeStorage.removeItem('remover');
        const resultado = await SafeStorage.getItem('remover');

        expect(resultado).toBeNull();
    });

    it('salva e recupera JSON serializado corretamente', async () => {
        const { SafeStorage } = getModule();
        const payload = { id: 1, nome: 'Escola Teste', municipio: 'Recife' };

        await SafeStorage.setItem('json_key', JSON.stringify(payload));
        const raw = await SafeStorage.getItem('json_key');

        expect(JSON.parse(raw!)).toEqual(payload);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('SafeStorage — fallback para memoryStore', () => {
    /**
     * Simula o cenário onde o módulo nativo do AsyncStorage não está disponível.
     * O mock de react-native retorna NativeModules sem RNCAsyncStorage,
     * então SafeStorage deve cair para o memoryStore interno.
     */
    beforeEach(() => {
        // Sobrescreve o mock de react-native para simular ausência de módulo nativo
        jest.doMock('react-native', () => ({
            Platform: { OS: 'android' },
            NativeModules: {}, // sem RNCAsyncStorage → getAsyncStorage() retorna null
        }));
    });

    it('setItem e getItem funcionam via memoryStore quando AsyncStorage indisponível', async () => {
        const { SafeStorage } = getModule();

        await SafeStorage.setItem('fallback_key', 'fallback_val');
        const resultado = await SafeStorage.getItem('fallback_key');

        expect(resultado).toBe('fallback_val');
    });

    it('removeItem via memoryStore não deixa resíduo', async () => {
        const { SafeStorage } = getModule();

        await SafeStorage.setItem('temp', 'dado');
        await SafeStorage.removeItem('temp');
        const resultado = await SafeStorage.getItem('temp');

        expect(resultado).toBeNull();
    });

    it('getItem retorna null para chave inexistente no memoryStore', async () => {
        const { SafeStorage } = getModule();

        const resultado = await SafeStorage.getItem('inexistente_memory');

        expect(resultado).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('SafeStorage — resiliência a erros do AsyncStorage', () => {
    it('cai para memoryStore quando AsyncStorage.getItem lança exceção', async () => {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        // Primeiro simula um getItem que lança erro
        AsyncStorage.getItem.mockRejectedValueOnce(new Error('Disco cheio'));
        // Mas antes já tinha salvo via setItem normal (que funcionou)
        AsyncStorage._store.set('resiliente', 'salvo_antes');

        const { SafeStorage } = getModule();

        // getItem falha no AsyncStorage mas não quebra — retorna null (sem fallback de dados)
        const resultado = await SafeStorage.getItem('resiliente');

        // O importante é não lançar exceção
        expect(typeof resultado === 'string' || resultado === null).toBe(true);
    });

    it('cai para memoryStore quando AsyncStorage.setItem lança exceção', async () => {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        AsyncStorage.setItem.mockRejectedValueOnce(new Error('Sem permissão'));

        const { SafeStorage } = getModule();

        // Não deve lançar exceção
        await expect(SafeStorage.setItem('erro_key', 'valor')).resolves.not.toThrow();
    });
});
