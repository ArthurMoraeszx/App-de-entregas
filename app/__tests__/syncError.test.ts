beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
});

jest.mock('@sentry/react-native', () => ({
    captureException: jest.fn(),
    captureMessage: jest.fn(),
}));

jest.mock('../src/utils/diagnostics', () => ({
    queueDiagnosticEvent: jest.fn(() => Promise.resolve()),
}));

const getModule = () => require('../src/utils/syncError');
const getSentry = () => require('@sentry/react-native');
const getDiagnostics = () => require('../src/utils/diagnostics');

// ---------------------------------------------------------------------------
// classifySyncError — mensagens exibidas ao motorista para erros de rede/upload
// ---------------------------------------------------------------------------

describe('classifySyncError', () => {
    it('401 → sessão expirada, isAuthError true', () => {
        const { classifySyncError } = getModule();
        const result = classifySyncError({ isAxiosError: true, response: { status: 401 } });
        expect(result.isAuthError).toBe(true);
        expect(result.title).toBe('Sessão expirada');
    });

    it('403 → acesso negado', () => {
        const { classifySyncError } = getModule();
        const result = classifySyncError({ isAxiosError: true, response: { status: 403 } });
        expect(result.title).toBe('Acesso negado');
        expect(result.isAuthError).toBe(false);
    });

    it('500+ → erro no servidor, avisa que dados estão salvos localmente', () => {
        const { classifySyncError } = getModule();
        const result = classifySyncError({ isAxiosError: true, response: { status: 503 } });
        expect(result.title).toBe('Erro no servidor');
        expect(result.message).toMatch(/dados estão salvos/i);
    });

    it('ECONNABORTED → conexão lenta', () => {
        const { classifySyncError } = getModule();
        const result = classifySyncError({ isAxiosError: true, code: 'ECONNABORTED' });
        expect(result.title).toBe('Conexão lenta');
    });

    it('sem response e sem timeout → sem conexão com o servidor', () => {
        const { classifySyncError } = getModule();
        const result = classifySyncError({ isAxiosError: true, code: 'ERR_NETWORK', message: 'Network Error' });
        expect(result.title).toBe('Sem conexão com o servidor');
    });

    it('erro axios genérico (ex.: 400) → falha na sincronização', () => {
        const { classifySyncError } = getModule();
        const result = classifySyncError({ isAxiosError: true, response: { status: 400 } });
        expect(result.title).toBe('Falha na sincronização');
    });

    it('erro não-axios → erro inesperado', () => {
        const { classifySyncError } = getModule();
        const result = classifySyncError(new Error('qualquer coisa'));
        expect(result.title).toBe('Erro inesperado');
        expect(result.isAuthError).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// classifyLocalError — mensagens para falhas de escrita local (WDB/SQLite)
// ---------------------------------------------------------------------------

describe('classifyLocalError', () => {
    it('"not initialized" → app não inicializado', () => {
        const { classifyLocalError } = getModule();
        const result = classifyLocalError(new Error('Database not initialized'));
        expect(result.title).toBe('App não inicializado');
    });

    it('GUIA_NAO_ENCONTRADA → mensagem específica orientando voltar à Home', () => {
        const { classifyLocalError } = getModule();
        const result = classifyLocalError(new Error('GUIA_NAO_ENCONTRADA'));
        expect(result.title).toBe('Guia não encontrada');
        expect(result.message).toMatch(/reatribuída/i);
    });

    it('erro com palavra-chave de banco/sql/constraint → orienta reiniciar o app', () => {
        const { classifyLocalError } = getModule();
        const result = classifyLocalError(new Error('SQLite constraint failed'));
        expect(result.title).toBe('Erro ao salvar');
        expect(result.message).toMatch(/Feche o app/i);
    });

    it('erro desconhecido → fallback genérico', () => {
        const { classifyLocalError } = getModule();
        const result = classifyLocalError(new Error('algo inesperado e não classificado'));
        expect(result.title).toBe('Erro ao salvar');
        expect(result.message).toBe('Não foi possível completar a operação. Tente novamente.');
    });
});

// ---------------------------------------------------------------------------
// reportError — deve sempre enfileirar diagnóstico; Sentry só fora de 'auth'
// ---------------------------------------------------------------------------

describe('reportError', () => {
    it('401 axios → error_type auth, NÃO manda pro Sentry (fluxo normal)', () => {
        const { reportError } = getModule();
        const diag = getDiagnostics();
        const sentry = getSentry();

        reportError({ isAxiosError: true, response: { status: 401 } }, 'auto_sync');

        expect(diag.queueDiagnosticEvent).toHaveBeenCalledWith(
            expect.objectContaining({ error_type: 'auth', error_code: '401', context: 'auto_sync' }),
        );
        expect(sentry.captureException).not.toHaveBeenCalled();
    });

    it('500 axios → error_type server, manda pro Sentry com tags', () => {
        const { reportError } = getModule();
        const diag = getDiagnostics();
        const sentry = getSentry();

        reportError({ isAxiosError: true, response: { status: 500 } }, 'sync_push');

        expect(diag.queueDiagnosticEvent).toHaveBeenCalledWith(
            expect.objectContaining({ error_type: 'server', error_code: '500', context: 'sync_push' }),
        );
        expect(sentry.captureException).toHaveBeenCalledWith(
            expect.any(Error),
            expect.objectContaining({ tags: { context: 'sync_push', error_type: 'server', error_code: '500' } }),
        );
    });

    it('erro local não-axios → usa a mensagem do erro como error_code (não só "Error")', () => {
        const { reportError } = getModule();
        const diag = getDiagnostics();

        reportError(new Error('GUIA_NAO_ENCONTRADA'), 'registrar_entrega_parcial', { num_guia: '9999' });

        expect(diag.queueDiagnosticEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                error_type: 'local_db',
                error_code: 'GUIA_NAO_ENCONTRADA',
                context: 'registrar_entrega_parcial',
                extra: { num_guia: '9999' },
            }),
        );
    });

    it('timeout axios → error_type timeout, manda pro Sentry', async () => {
        const { reportError } = getModule();
        const diag = getDiagnostics();
        const sentry = getSentry();

        reportError({ isAxiosError: true, code: 'ETIMEDOUT' }, 'photo_upload');
        // network/timeout enriquecem com NetInfo.fetch() (async) antes de reportar — aguarda o flush.
        await Promise.resolve();
        await Promise.resolve();

        expect(diag.queueDiagnosticEvent).toHaveBeenCalledWith(
            expect.objectContaining({ error_type: 'timeout', error_code: 'ETIMEDOUT', context: 'photo_upload' }),
        );
        expect(sentry.captureException).toHaveBeenCalled();
    });
});
