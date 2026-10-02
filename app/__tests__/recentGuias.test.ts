/**
 * Testes de recentGuias.ts
 *
 * Cobre:
 *  - Adição básica de uma guia
 *  - Deduplicação: mesma guia adicionada duas vezes não duplica, apenas atualiza o timestamp
 *  - Ordem: guia mais recentemente acessada aparece primeiro
 *  - Limite: nunca armazena mais de 10 entradas
 *  - Limpeza: clearRecentGuias() esvazia o histórico
 */

// Reseta o módulo inteiro a cada teste para garantir estado limpo do SafeStorage
beforeEach(() => {
    jest.resetModules();
    // Limpa o mock do AsyncStorage entre testes
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    AsyncStorage._store.clear();
    AsyncStorage.getItem.mockClear();
    AsyncStorage.setItem.mockClear();
    AsyncStorage.removeItem.mockClear();
});

// Importa dinamicamente após resetModules
const getModule = () => require('../src/utils/recentGuias');

// ─────────────────────────────────────────────────────────────────────────────

describe('addRecentGuia', () => {
    it('adiciona uma guia nova ao histórico', async () => {
        const { addRecentGuia, getRecentIds } = getModule();

        await addRecentGuia('1001');
        const ids = await getRecentIds();

        expect(ids).toEqual(['1001']);
    });

    it('adiciona múltiplas guias distintas', async () => {
        const { addRecentGuia, getRecentIds } = getModule();

        await addRecentGuia('1001');
        await addRecentGuia('1002');
        await addRecentGuia('1003');
        const ids = await getRecentIds();

        expect(ids).toEqual(['1003', '1002', '1001']);
    });

    it('deduplicação: acessar guia existente move para o topo sem duplicar', async () => {
        const { addRecentGuia, getRecentIds } = getModule();

        await addRecentGuia('1001');
        await addRecentGuia('1002');
        await addRecentGuia('1001'); // re-acesso à 1001

        const ids = await getRecentIds();

        expect(ids).toEqual(['1001', '1002']); // 1001 volta ao topo, sem duplicata
        expect(ids).toHaveLength(2);
    });

    it('ordem: a guia mais recentemente acessada aparece sempre primeiro', async () => {
        const { addRecentGuia, getRecentIds } = getModule();

        await addRecentGuia('A');
        await addRecentGuia('B');
        await addRecentGuia('C');
        await addRecentGuia('B'); // B re-acessado → deve ir para o topo

        const ids = await getRecentIds();

        expect(ids[0]).toBe('B');
    });

    it('limite: nunca armazena mais de 10 entradas', async () => {
        const { addRecentGuia, getRecentIds } = getModule();

        // Adiciona 12 guias distintas
        for (let i = 1; i <= 12; i++) {
            await addRecentGuia(String(i));
        }

        const ids = await getRecentIds();

        expect(ids).toHaveLength(10);
        // As mais antigas devem ter sido removidas
        expect(ids).not.toContain('1');
        expect(ids).not.toContain('2');
        // A mais recente deve estar no topo
        expect(ids[0]).toBe('12');
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('getRecentIds', () => {
    it('retorna array vazio quando não há histórico', async () => {
        const { getRecentIds } = getModule();

        const ids = await getRecentIds();

        expect(ids).toEqual([]);
    });

    it('retorna os IDs na ordem de acesso (mais recente primeiro)', async () => {
        const { addRecentGuia, getRecentIds } = getModule();

        await addRecentGuia('X');
        await addRecentGuia('Y');
        await addRecentGuia('Z');

        const ids = await getRecentIds();

        expect(ids).toEqual(['Z', 'Y', 'X']);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('clearRecentGuias', () => {
    it('esvazia o histórico completamente', async () => {
        const { addRecentGuia, clearRecentGuias, getRecentIds } = getModule();

        await addRecentGuia('1001');
        await addRecentGuia('1002');
        await clearRecentGuias();

        const ids = await getRecentIds();

        expect(ids).toEqual([]);
    });

    it('não falha se o histórico já estiver vazio', async () => {
        const { clearRecentGuias } = getModule();

        await expect(clearRecentGuias()).resolves.not.toThrow();
    });
});
