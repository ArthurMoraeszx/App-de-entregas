/**
 * Mock do AsyncStorage para testes.
 * Usa um Map em memória para simular o comportamento real.
 */
const store = new Map<string, string>();

const AsyncStorage = {
    getItem: jest.fn(async (key: string) => store.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { store.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { store.delete(key); }),
    clear: jest.fn(async () => { store.clear(); }),
    getAllKeys: jest.fn(async () => Array.from(store.keys())),
    _store: store, // exposto para inspeção nos testes
};

export default AsyncStorage;
