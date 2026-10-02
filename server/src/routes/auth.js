// ---------------------------------------------------------------------------
// Rotas de conta do usuario logado.
//
//   PUT /api/auth/update-profile   editar nome/email e trocar a senha
//
// Fica separada de /api/mobile porque a tela de perfil do app chama esse
// caminho, e nao o prefixo mobile (ver services/auth.ts no app).
// ---------------------------------------------------------------------------
import express from 'express';
import bcrypt from 'bcryptjs';

import { get, run } from '../db.js';
import { authenticate } from '../middleware/authenticate.js';
import { sendSuccess, sendValidationError, sendUnauthorized, asyncHandler } from '../utils/respond.js';

const router = express.Router();

const CUSTO_BCRYPT = 10;

router.put('/update-profile', authenticate, asyncHandler(async (req, res) => {
    const { email, nomeCompleto, senhaAtual, novaSenha } = req.body || {};

    if (!senhaAtual) {
        return sendValidationError(res, 'Informe a senha atual para confirmar a alteracao');
    }

    const usuario = get('SELECT * FROM usuarios WHERE id = $id', { id: req.user.id });
    if (!usuario) return sendUnauthorized(res, 'Usuario nao encontrado');

    // A senha atual e exigida mesmo quando o usuario nao esta trocando de senha:
    // sem isso, um celular esquecido desbloqueado permitiria trocar o e-mail da
    // conta (e, com ele, uma eventual recuperacao de acesso).
    const confere = await bcrypt.compare(String(senhaAtual), usuario.senha_hash);
    if (!confere) return sendUnauthorized(res, 'Senha atual incorreta');

    if (novaSenha && String(novaSenha).length < 6) {
        return sendValidationError(res, 'A nova senha precisa ter ao menos 6 caracteres');
    }

    const senhaHash = novaSenha
        ? await bcrypt.hash(String(novaSenha), CUSTO_BCRYPT)
        : usuario.senha_hash;

    run(
        `UPDATE usuarios SET
             nome       = COALESCE($nome, nome),
             email      = COALESCE($email, email),
             senha_hash = $senha_hash
         WHERE id = $id`,
        {
            id: usuario.id,
            nome: nomeCompleto || null,
            email: email || null,
            senha_hash: senhaHash,
        },
    );

    const atualizado = get(
        `SELECT id, username, nome, email, setor, nivel, id_motorista
           FROM usuarios WHERE id = $id`,
        { id: usuario.id },
    );

    return sendSuccess(res, { user: atualizado });
}));

export default router;
