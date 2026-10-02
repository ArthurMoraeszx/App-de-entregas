import * as SecureStore from 'expo-secure-store';

const KEY = 'sic_device_id';
let cached: string | null = null;

function generate(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

/**
 * Retorna um ID único e persistente para este dispositivo.
 * Gerado na primeira chamada e armazenado em SecureStore.
 * Sobrevive a atualizações do app; é perdido apenas na desinstalação.
 */
export async function getDeviceId(): Promise<string> {
    if (cached) return cached;

    try {
        let id = await SecureStore.getItemAsync(KEY);
        if (!id) {
            id = generate();
            await SecureStore.setItemAsync(KEY, id);
        }
        cached = id;
        return id;
    } catch {
        // SecureStore indisponível (emulador sem keychain, web) — usa valor efêmero
        cached = cached ?? generate();
        return cached;
    }
}
