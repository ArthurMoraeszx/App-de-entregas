import axios from 'axios';
import * as Sentry from '@sentry/react-native';
import NetInfo from '@react-native-community/netinfo';
import { queueDiagnosticEvent, type ErrorType } from './diagnostics';

export interface SyncErrorInfo {
    title: string;
    message: string;
    /** true quando a causa é sessão expirada — app deve sugerir novo login */
    isAuthError: boolean;
}

/**
 * Classifica um erro de sync/upload e retorna título e mensagem adequados
 * para exibir ao motorista, sem expor detalhes técnicos.
 */
export function classifySyncError(error: unknown): SyncErrorInfo {
    if (!axios.isAxiosError(error)) {
        return {
            title: 'Erro inesperado',
            message: 'Ocorreu um problema interno. Feche e abra o app novamente.',
            isAuthError: false,
        };
    }

    const status = error.response?.status;

    if (status === 401) {
        return {
            title: 'Sessão expirada',
            message: 'Sua sessão expirou. Saia do aplicativo e faça login novamente para continuar.',
            isAuthError: true,
        };
    }

    if (status === 403) {
        return {
            title: 'Acesso negado',
            message: 'Você não tem permissão para esta operação. Contate o administrador.',
            isAuthError: false,
        };
    }

    if (status && status >= 500) {
        return {
            title: 'Erro no servidor',
            message: 'O servidor encontrou um problema. Seus dados estão salvos no celular — aguarde alguns minutos e tente novamente.',
            isAuthError: false,
        };
    }

    const isTimeout =
        error.code === 'ECONNABORTED' ||
        error.code === 'ETIMEDOUT' ||
        (typeof error.message === 'string' && error.message.toLowerCase().includes('timeout'));

    if (isTimeout) {
        return {
            title: 'Conexão lenta',
            message: 'A conexão demorou muito para responder. Verifique o sinal e tente novamente.',
            isAuthError: false,
        };
    }

    // Requisição saiu do app mas não chegou resposta (rede caída, IP bloqueado, etc.)
    if (!error.response) {
        return {
            title: 'Sem conexão com o servidor',
            message: 'O app não conseguiu alcançar o servidor. Verifique se há internet e se o sinal está estável.',
            isAuthError: false,
        };
    }

    return {
        title: 'Falha na sincronização',
        message: 'Não foi possível sincronizar. Seus dados estão salvos no celular — tente novamente em instantes.',
        isAuthError: false,
    };
}

/**
 * Enfileira um evento de diagnóstico para o erro dado.
 * Chame nos catch blocks após classifySyncError/classifyLocalError.
 * Fire-and-forget — nunca lança exceção.
 */
export function reportError(error: unknown, context: string, extra?: Record<string, unknown>): void {
    let error_type: ErrorType = 'unknown';
    let error_code: string | undefined;

    if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401 || status === 403) {
            error_type = 'auth';
            error_code = String(status);
        } else if (status && status >= 500) {
            error_type = 'server';
            error_code = String(status);
        } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' ||
                   (typeof error.message === 'string' && error.message.toLowerCase().includes('timeout'))) {
            error_type = 'timeout';
            error_code = error.code ?? 'timeout';
        } else if (!error.response) {
            error_type = 'network';
            error_code = error.code ?? 'no_response';
        } else {
            error_type = 'unknown';
            error_code = status ? String(status) : error.code;
        }
    } else {
        error_type = 'local_db';
        // A mensagem identifica o problema (ex.: "GUIA_NAO_ENCONTRADA"); o nome da classe
        // sozinho ("Error") não distingue causas diferentes no mobile_diagnostics.
        error_code = error instanceof Error ? error.message.slice(0, 100) || error.constructor.name : 'non_axios';
    }

    const finish = (netExtra?: Record<string, unknown>): void => {
        const fullExtra = netExtra ? { ...extra, ...netExtra } : extra;

        queueDiagnosticEvent({
            error_type,
            error_code,
            context,
            occurred_at: Date.now(),
            extra: fullExtra,
        }).catch(() => {});

        // Erros de auth (401/403) são fluxo normal — não poluem o Sentry
        if (error_type !== 'auth') {
            const sentryError = error instanceof Error ? error : new Error(String(error_code ?? context));
            Sentry.captureException(sentryError, { tags: { context, error_type, error_code }, extra: fullExtra });
        }
    };

    // Para erros de rede/timeout, anexa o estado de conectividade do SO no momento da falha —
    // permite diferenciar no Sentry "sem sinal" de "tinha sinal mas a requisição falhou mesmo assim"
    // (ex.: operadora bloqueando a porta, DNS, TLS) sem precisar cruzar com o banco.
    if (error_type === 'network' || error_type === 'timeout') {
        NetInfo.fetch()
            .then((state) => finish({
                net_connected: state.isConnected,
                net_internet_reachable: state.isInternetReachable,
                net_type: state.type,
            }))
            .catch(() => finish());
    } else {
        finish();
    }
}

/** Mensagem curta para toast (Android ToastAndroid / notificações passageiras). */
export function syncErrorToast(error: unknown): string {
    const { isAuthError, title } = classifySyncError(error);
    if (isAuthError) return 'Sessão expirada — faça login novamente.';
    return `${title}. Seus dados estão salvos localmente.`;
}

// ─── Erros de banco local (WatermelonDB / SQLite) ────────────────────────────

export interface LocalErrorInfo {
    title: string;
    message: string;
}

/**
 * Classifica erros de escrita local (WDB/SQLite).
 * Nunca expõe a mensagem técnica original ao motorista.
 */
export function classifyLocalError(error: unknown): LocalErrorInfo {
    const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    if (msg.includes('guia_nao_encontrada')) {
        return {
            title: 'Guia não encontrada',
            message: 'Esta guia não está mais disponível no seu celular — pode ter sido reatribuída. Volte à tela inicial, aguarde a sincronização e tente de novo.',
        };
    }

    if (msg.includes('not initialized') || msg.includes('não inicializado')) {
        return {
            title: 'App não inicializado',
            message: 'O banco de dados ainda não carregou. Feche o app completamente e abra novamente.',
        };
    }

    if (msg.includes('database') || msg.includes('sql') || msg.includes('constraint') || msg.includes('banco')) {
        return {
            title: 'Erro ao salvar',
            message: 'Não foi possível salvar no celular. Feche o app e tente de novo. Se persistir, procure o suporte.',
        };
    }

    return {
        title: 'Erro ao salvar',
        message: 'Não foi possível completar a operação. Tente novamente.',
    };
}

// ─── Erros de login ──────────────────────────────────────────────────────────

export interface LoginErrorInfo {
    title: string;
    message: string;
}

/**
 * Classifica erros de login sem expor mensagens internas do servidor.
 */
export function classifyLoginError(error: unknown): LoginErrorInfo {
    if (!axios.isAxiosError(error)) {
        return {
            title: 'Erro no login',
            message: 'Ocorreu um problema inesperado. Feche o app e tente novamente.',
        };
    }

    const status = error.response?.status;

    // 400 = validação (usuário/senha incorretos, o caso mais comum);
    // 401 = conta inativa; 403 = nível não autorizado no app mobile.
    if (status === 400 || status === 401 || status === 403) {
        return {
            title: 'Dados incorretos',
            message: 'Usuário ou senha incorretos. Verifique seus dados e tente novamente.',
        };
    }

    if (status === 429) {
        return {
            title: 'Muitas tentativas',
            message: 'Aguarde alguns minutos antes de tentar novamente.',
        };
    }

    if (status && status >= 500) {
        return {
            title: 'Servidor indisponível',
            message: 'O servidor está com problema. Aguarde alguns minutos e tente novamente.',
        };
    }

    const isTimeout =
        error.code === 'ECONNABORTED' ||
        error.code === 'ETIMEDOUT' ||
        (typeof error.message === 'string' && error.message.toLowerCase().includes('timeout'));

    if (isTimeout) {
        return {
            title: 'Conexão lenta',
            message: 'O servidor demorou muito para responder. Verifique o sinal e tente novamente.',
        };
    }

    if (!error.response) {
        return {
            title: 'Sem conexão',
            message: 'Não foi possível alcançar o servidor. Verifique sua conexão com a internet.',
        };
    }

    return {
        title: 'Erro no login',
        message: 'Não foi possível fazer login. Tente novamente.',
    };
}
