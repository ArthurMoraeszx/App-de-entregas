import jwt from 'jsonwebtoken';
import { get } from '../db.js';
import { sendUnauthorized, sendForbidden } from '../utils/respond.js';

const JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-desenvolvimento';

/**
 * Le o Bearer token, valida a assinatura e carrega o usuario do banco.
 *
 * O usuario e recarregado do banco a cada request (em vez de confiar so no
 * payload do JWT) porque nivel e id_motorista podem mudar durante a validade
 * do token — um motorista desligado continuaria sincronizando ate o token
 * expirar se lessemos apenas o que foi assinado.
 */
export function authenticate(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) return sendUnauthorized(res, 'Token nao enviado');

    let payload;
    try {
        payload = jwt.verify(token, JWT_SECRET);
    } catch (error) {
        const expirou = error.name === 'TokenExpiredError';
        // 401 e obrigatorio aqui: o interceptor do app so tenta renovar o token
        // quando recebe exatamente 401. Qualquer outro status derruba a sessao.
        return sendUnauthorized(res, expirou ? 'Token expirado' : 'Token invalido');
    }

    const usuario = get(
        `SELECT id, username, nome, email, setor, nivel, id_motorista
           FROM usuarios WHERE id = $id`,
        { id: payload.id },
    );

    if (!usuario) return sendUnauthorized(res, 'Usuario nao encontrado');

    req.user = usuario;
    next();
}

/**
 * Exige que o usuario seja motorista (ou admin, que enxerga tudo).
 * Espelha o requireDriver das rotas mobile: o app so e usado por motoristas.
 */
export function requireDriver(req, res, next) {
    if (req.user?.nivel === 'driver' || req.user?.nivel === 'admin') return next();
    return sendForbidden(res, 'Esta area e exclusiva de motoristas');
}
