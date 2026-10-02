// ---------------------------------------------------------------------------
// Envelope de resposta da API.
//
// O app le SEMPRE `response.data.data` (ver services/network.ts e auth.ts no
// app), entao todo corpo de sucesso precisa sair como { success: true, data }.
// Mudar esse formato quebra o app silenciosamente: o axios recebe 200 e o
// codigo do app le undefined.
// ---------------------------------------------------------------------------

export function sendSuccess(res, data = null, status = 200) {
    return res.status(status).json({ success: true, data });
}

export function sendError(res, status, message, extra = {}) {
    return res.status(status).json({ success: false, message, error: message, ...extra });
}

export const sendValidationError = (res, message) => sendError(res, 400, message);
export const sendUnauthorized = (res, message = 'Nao autorizado') => sendError(res, 401, message);
export const sendForbidden = (res, message = 'Acesso negado') => sendError(res, 403, message);
export const sendNotFound = (res, message = 'Registro nao encontrado') => sendError(res, 404, message);

/**
 * Envolve um handler async para que qualquer throw caia no errorHandler do
 * Express em vez de virar uma promise rejeitada sem dono (que no Express 5
 * derruba a request com timeout em vez de responder 500).
 */
export const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
