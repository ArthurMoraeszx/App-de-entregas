import { Platform, NativeModules } from 'react-native';

// In-memory fallback store
const memoryStore = new Map<string, string>();

// Helper to get AsyncStorage safely without crashing the module evaluation
const getAsyncStorage = () => {
    // Only attempt on mobile
    if (Platform.OS === 'web') return null;

    try {
        // PREVENÇÃO EXTRA: Verificar se o módulo nativo existe antes de dar o require.
        // Se o require rodar, a biblioteca tenta se inicializar e printa o erro no console
        // mesmo que a gente capture a exceção.
        const hasNativeModule =
            NativeModules.RNCAsyncStorage ||
            NativeModules.PlatformLocalStorage ||
            NativeModules.AsyncSQLiteDBStorage;

        if (!hasNativeModule) {
            return null;
        }

        // Use require inside the function to avoid top-level crash
        const mod = require('@react-native-async-storage/async-storage');
        const instance = mod.default || mod;

        return instance;
    } catch (e) {
        return null;
    }
};

// Cache the instance
let storageInstance: any = null;
let instanceChecked = false;

const getInstance = () => {
    if (!instanceChecked) {
        storageInstance = getAsyncStorage();
        instanceChecked = true;
        if (!storageInstance) {
            console.warn('[SAFE-STORAGE] AsyncStorage Nativo não encontrado ou incompleto. Usando memoryStore.');
        } else {
            console.log('[SAFE-STORAGE] AsyncStorage Nativo carregado.');
        }
    }
    return storageInstance;
};

// Safe wrapper
export const SafeStorage = {
    async getItem(key: string): Promise<string | null> {
        try {
            const instance = getInstance();
            if (instance) {
                return await instance.getItem(key);
            }
        } catch (error) {
            console.warn(`[SafeStorage] Erro ao ler ${key}:`, error);
        }
        return memoryStore.get(key) ?? null;
    },

    async setItem(key: string, value: string): Promise<void> {
        try {
            const instance = getInstance();
            if (instance) {
                await instance.setItem(key, value);
                return;
            }
        } catch (error) {
            console.warn(`[SafeStorage] Erro ao salvar ${key}`);
        }
        memoryStore.set(key, value);
    },

    async removeItem(key: string): Promise<void> {
        try {
            const instance = getInstance();
            if (instance) {
                await instance.removeItem(key);
                return;
            }
        } catch (error) {
            console.warn(`[SafeStorage] Erro ao remover ${key}`);
        }
        memoryStore.delete(key);
    }
};

export default SafeStorage;
