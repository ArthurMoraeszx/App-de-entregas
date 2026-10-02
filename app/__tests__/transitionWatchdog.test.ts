/**
 * Testes de transitionWatchdog.ts
 *
 * Contexto: detecta transições de navegação interrompidas por um crash nativo
 * (ver o comentario do modulo transitionWatchdog) que não é capturável via try/catch nem Error
 * Boundary. Cobre:
 *  - markTransitionRisk grava a marca corretamente
 *  - clearTransitionRisk apaga a marca (transição concluída com sucesso)
 *  - consumeInterruptedTransition retorna null quando não há nada pendente
 *  - consumeInterruptedTransition retorna e APAGA a marca quando há uma pendente
 *  - consumeInterruptedTransition não lança exceção com JSON corrompido
 *  - reportInterruptedTransition envia tanto para mobile_diagnostics quanto Sentry
 */

beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
});

jest.mock('@sentry/react-native', () => ({
    captureMessage: jest.fn(),
}));

jest.mock('../src/utils/diagnostics', () => ({
    queueDiagnosticEvent: jest.fn(() => Promise.resolve()),
}));

const getModule = () => require('../src/utils/transitionWatchdog');
const getSentry = () => require('@sentry/react-native');
const getDiagnostics = () => require('../src/utils/diagnostics');
const getSafeStorage = () => require('../src/utils/safeStorage').SafeStorage;

describe('markTransitionRisk / clearTransitionRisk', () => {
    it('markTransitionRisk grava from/to/numGuia/timestamp na storage', async () => {
        const { markTransitionRisk } = getModule();
        const SafeStorage = getSafeStorage();

        await markTransitionRisk('RegistroEntrega(Parcial)', 'RegistroQuestionario', 1350891);

        const raw = await SafeStorage.getItem('@rotaescolar:pending_screen_transition');
        expect(raw).not.toBeNull();
        const parsed = JSON.parse(raw!);
        expect(parsed.from).toBe('RegistroEntrega(Parcial)');
        expect(parsed.to).toBe('RegistroQuestionario');
        expect(parsed.numGuia).toBe(1350891);
        expect(typeof parsed.timestamp).toBe('number');
    });

    it('clearTransitionRisk apaga a marca (transição concluída com sucesso)', async () => {
        const { markTransitionRisk, clearTransitionRisk } = getModule();
        const SafeStorage = getSafeStorage();

        await markTransitionRisk('RegistroQuestionario', 'EntregaDetalhes', 999);
        await clearTransitionRisk();

        const raw = await SafeStorage.getItem('@rotaescolar:pending_screen_transition');
        expect(raw).toBeNull();
    });
});

describe('consumeInterruptedTransition', () => {
    it('retorna null quando não há transição pendente', async () => {
        const { consumeInterruptedTransition } = getModule();

        const resultado = await consumeInterruptedTransition();

        expect(resultado).toBeNull();
    });

    it('retorna a transição pendente e a remove da storage (não fica presa pra sempre)', async () => {
        const { markTransitionRisk, consumeInterruptedTransition } = getModule();
        const SafeStorage = getSafeStorage();

        await markTransitionRisk('RegistroEntrega(Total)', 'RegistroQuestionario', 1350731);

        const resultado = await consumeInterruptedTransition();
        expect(resultado).toEqual(expect.objectContaining({
            from: 'RegistroEntrega(Total)',
            to: 'RegistroQuestionario',
            numGuia: 1350731,
        }));

        // Consumida uma vez, não pode ser detectada de novo no próximo mount da Home
        const raw = await SafeStorage.getItem('@rotaescolar:pending_screen_transition');
        expect(raw).toBeNull();
        const segunda = await consumeInterruptedTransition();
        expect(segunda).toBeNull();
    });

    it('retorna null (sem lançar exceção) quando o valor salvo está corrompido', async () => {
        const SafeStorage = getSafeStorage();
        await SafeStorage.setItem('@rotaescolar:pending_screen_transition', '{ json quebrado');

        const { consumeInterruptedTransition } = getModule();

        await expect(consumeInterruptedTransition()).resolves.toBeNull();
    });
});

describe('reportInterruptedTransition', () => {
    it('envia o evento para mobile_diagnostics (queueDiagnosticEvent)', () => {
        const { reportInterruptedTransition } = getModule();
        const { queueDiagnosticEvent } = getDiagnostics();

        reportInterruptedTransition({ from: 'RegistroEntrega(Parcial)', to: 'RegistroQuestionario', numGuia: 1350891, timestamp: Date.now() });

        expect(queueDiagnosticEvent).toHaveBeenCalledWith(expect.objectContaining({
            error_type: 'unknown',
            error_code: 'interrupted_navigation_reset',
            context: 'transition_watchdog',
            extra: expect.objectContaining({ num_guia: 1350891 }),
        }));
    });

    it('envia também para o Sentry (captureMessage) para visibilidade imediata', () => {
        const { reportInterruptedTransition } = getModule();
        const Sentry = getSentry();

        reportInterruptedTransition({ from: 'RegistroQuestionario', to: 'EntregaDetalhes', numGuia: 42, timestamp: Date.now() });

        expect(Sentry.captureMessage).toHaveBeenCalledWith(
            expect.stringContaining('RegistroQuestionario'),
            expect.objectContaining({ level: 'warning' }),
        );
    });
});
