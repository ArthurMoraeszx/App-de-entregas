/**
 * recentGuias.ts
 *
 * Persiste o histórico de guias acessadas pelo motorista na sessão.
 * Armazena até MAX_RECENT entradas no SafeStorage, ordenadas da mais
 * recente para a mais antiga.
 *
 * Estrutura salva:
 *   [{ id: string, accessedAt: number (timestamp ms) }, ...]
 */

import { SafeStorage } from './safeStorage';

const STORAGE_KEY = '@Merenda:recentGuias';
const MAX_RECENT = 10;

interface RecentEntry {
    id: string;
    accessedAt: number;
}

/**
 * Registra uma guia como acessada agora.
 * Se já existir no histórico, apenas atualiza o timestamp (move para o topo).
 */
export async function addRecentGuia(id: string): Promise<void> {
    try {
        const current = await loadEntries();

        // Remove entrada anterior com mesmo id (evita duplicatas)
        const filtered = current.filter(e => e.id !== id);

        // Insere no início com timestamp atual
        const updated: RecentEntry[] = [
            { id, accessedAt: Date.now() },
            ...filtered,
        ].slice(0, MAX_RECENT);

        await SafeStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (error) {
        console.warn('[recentGuias] Erro ao registrar acesso:', error);
    }
}

/**
 * Retorna os IDs na ordem de acesso (mais recente primeiro).
 */
export async function getRecentIds(): Promise<string[]> {
    try {
        const entries = await loadEntries();
        return entries.map(e => e.id);
    } catch (error) {
        console.warn('[recentGuias] Erro ao ler histórico:', error);
        return [];
    }
}

/**
 * Limpa todo o histórico (útil no logout).
 */
export async function clearRecentGuias(): Promise<void> {
    try {
        await SafeStorage.removeItem(STORAGE_KEY);
    } catch (error) {
        console.warn('[recentGuias] Erro ao limpar histórico:', error);
    }
}

// ─── Interno ────────────────────────────────────────────────────────────────

async function loadEntries(): Promise<RecentEntry[]> {
    const raw = await SafeStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw) as RecentEntry[];
    } catch {
        return [];
    }
}
