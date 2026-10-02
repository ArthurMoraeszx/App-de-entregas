// Detecta transições de navegação interrompidas por crash nativo.
//
// Contexto (03/08/2026): motorista relatou "fotos não enviam, o app volta pra
// tela inicial" — Sentry mostra um crash fatal nativo (`[RNScreens] DecorView
// is required for applying inset correction, but was null`, mechanism
// UncaughtExceptionHandler) correlacionado no tempo. Esse tipo de crash não é
// capturável via try/catch nem pelo Error Boundary do React (é nativo, não um
// erro de render JS) — então não dá pra "pegar o erro" no ponto em que ele
// acontece. Em vez disso, este módulo marca a intenção de transição *antes*
// dela, e verifica na tela de destino se a marca ainda está lá — se estiver,
// a transição não completou normalmente (o processo foi interrompido no meio).
//
// Ver o comentario de transitionWatchdog abaixo para o caso que motivou isso.
import * as Sentry from '@sentry/react-native';
import { SafeStorage } from './safeStorage';
import { queueDiagnosticEvent } from './diagnostics';

const KEY = '@rotaescolar:pending_screen_transition';

export interface PendingTransition {
    from: string;
    to: string;
    numGuia: string | number;
    timestamp: number;
}

/** Chamar imediatamente antes de um navigation.reset()/navigate() de risco. */
export async function markTransitionRisk(from: string, to: string, numGuia: string | number): Promise<void> {
    const payload: PendingTransition = { from, to, numGuia, timestamp: Date.now() };
    await SafeStorage.setItem(KEY, JSON.stringify(payload));
}

/** Chamar quando a tela de destino esperada monta com sucesso (transição OK). */
export async function clearTransitionRisk(): Promise<void> {
    await SafeStorage.removeItem(KEY);
}

/**
 * Consome (lê e apaga) uma transição pendente, se houver. Retorna null se a
 * última transição terminou normalmente (nada pendente) ou se o valor salvo
 * estiver corrompido. Chamar no mount de telas "porto seguro" (ex.: Home) —
 * se retornar não-null, a transição anterior foi interrompida no meio.
 */
export async function consumeInterruptedTransition(): Promise<PendingTransition | null> {
    const raw = await SafeStorage.getItem(KEY);
    if (!raw) return null;
    await SafeStorage.removeItem(KEY);
    try {
        return JSON.parse(raw) as PendingTransition;
    } catch {
        return null;
    }
}

/**
 * Chamar sempre que consumeInterruptedTransition() retornar não-null.
 * Registra em mobile_diagnostics (fila offline, chega ao servidor no próximo
 * sync) e no Sentry (visibilidade imediata) — mesmo padrão dual de
 * reportError() em syncError.ts, mas para uma anomalia detectada, não uma
 * exceção capturada (esse tipo de crash nativo não gera uma no JS).
 */
export function reportInterruptedTransition(pending: PendingTransition): void {
    const msDesdeMarca = Date.now() - pending.timestamp;

    queueDiagnosticEvent({
        error_type: 'unknown',
        error_code: 'interrupted_navigation_reset',
        context: 'transition_watchdog',
        occurred_at: pending.timestamp,
        extra: { from: pending.from, to: pending.to, num_guia: pending.numGuia, ms_desde_marca: msDesdeMarca },
    }).catch(() => {});

    Sentry.captureMessage(
        `Transição de tela interrompida: ${pending.from} → ${pending.to} (guia ${pending.numGuia})`,
        {
            level: 'warning',
            tags: { context: 'transition_watchdog', from: pending.from, to: pending.to },
            extra: { numGuia: pending.numGuia, msDesdeMarca },
        },
    );
}
