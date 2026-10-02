// ---------------------------------------------------------------------------
// Rotas consumidas pelo aplicativo. Sao exatamente as que o app chama —
// nem uma a mais.
//
//   POST   /api/mobile/login          autentica o motorista
//   POST   /api/mobile/refresh        renova o access token
//   GET    /api/mobile/me             devolve o id_motorista do usuario logado
//   GET    /api/mobile/guias/:num     busca uma guia avulsa pelo numero
//   GET    /api/mobile/sync/pull      baixa entregas/escolas/generos
//   POST   /api/mobile/sync/push      recebe as entregas registradas offline
//   POST   /api/mobile/fotos/upload   recebe a foto da guia (multipart)
//   POST   /api/mobile/token          registra o token de push do aparelho
//   POST   /api/mobile/diagnostics    recebe eventos de erro do app
// ---------------------------------------------------------------------------
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { all, get, run, transaction } from '../db.js';
import { authenticate, requireDriver } from '../middleware/authenticate.js';
import {
    sendSuccess, sendValidationError, sendUnauthorized, sendNotFound, asyncHandler,
} from '../utils/respond.js';

const router = express.Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const UPLOADS_DIR = path.resolve(ROOT, process.env.UPLOADS_DIR || './uploads');

const JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-desenvolvimento';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'segredo-refresh-de-desenvolvimento';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '15d';

// Primeira sincronizacao nao baixa o historico inteiro — so os ultimos 90 dias.
// Sem isso, o primeiro pull de um aparelho novo puxa anos de guias de uma vez.
const JANELA_PRIMEIRA_SYNC_MS = 90 * 24 * 60 * 60 * 1000;

// memoryStorage, e nao diskStorage, de proposito: o app monta o FormData com o
// arquivo ANTES dos campos de texto, entao dentro do callback de filename do
// diskStorage o req.body ainda esta vazio e nao da para nomear o arquivo pelo
// num_guia. Gravamos manualmente depois que o multer terminou de parsear tudo.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gerarTokens(usuario) {
    const token = jwt.sign(
        { id: usuario.id, username: usuario.username, nivel: usuario.nivel },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN },
    );
    const refreshToken = jwt.sign(
        { id: usuario.id, tipo: 'refresh' },
        JWT_REFRESH_SECRET,
        { expiresIn: JWT_REFRESH_EXPIRES_IN },
    );
    return { token, refreshToken };
}

function usuarioPublico(usuario) {
    return {
        id: usuario.id,
        username: usuario.username,
        nome: usuario.nome,
        email: usuario.email || '',
        setor: usuario.setor || '',
        nivel: usuario.nivel,
        id_motorista: usuario.id_motorista ?? null,
    };
}

const ms = (valor) => (valor == null ? null : Number(valor));

/**
 * Converte uma linha do banco no formato que o WatermelonDB espera receber.
 *
 * Dois detalhes que quebram o app se mudarem:
 *  - `id` precisa ser o num_guia em string: e a chave primaria do registro no
 *    banco local do aparelho. Se vier diferente entre dois pulls, o WatermelonDB
 *    cria registro duplicado em vez de atualizar.
 *  - `foto`/`foto_servidor` (e o par do questionario) espelham o mesmo valor.
 *    O app trata "servidor mandou null com valor local preenchido" como
 *    "o push ainda nao chegou" e preserva o local; mandar so um dos dois faz
 *    ele reprocessar a guia inteira em todo ciclo de sync.
 */
function mapEntrega(row) {
    return {
        id: String(row.num_guia),
        num_guia: String(row.num_guia),
        of_numero: row.of_numero != null ? String(row.of_numero) : '',
        lote: row.lote != null ? String(row.lote) : '',
        status: row.status,
        produto_enviado: row.produto_enviado || '',
        qtd_enviada: Number(row.qtd_enviada) || 0,
        qtd_entregue: row.qtd_entregue != null ? Number(row.qtd_entregue) : null,
        qtd_devolvida: row.qtd_devolvida != null ? Number(row.qtd_devolvida) : null,
        dt_previsao: ms(row.dt_previsao),
        dt_entregue: ms(row.dt_entregue),
        data_hora_entrega: ms(row.data_hora_entrega),
        dt_inicio_cronograma: ms(row.dt_inicio_cronograma),
        data_prevista_fornecedor: ms(row.data_prevista_fornecedor),
        data_antecipacao: ms(row.data_antecipacao),
        data_prorrogacao: ms(row.data_prorrogacao),
        cod_escola: row.cod_escola != null ? String(row.cod_escola) : '',
        id_genero: row.id_genero != null ? String(row.id_genero) : '',
        id_dist: row.id_dist != null ? String(row.id_dist) : '',
        distribuicao_nome: row.distribuicao_nome || '',
        prioridade: row.prioridade === 1 || row.prioridade === true,
        emergencial: row.is_emergencial === 1 || row.is_emergencial === true,
        observacao: row.observacao ?? null,
        foto: row.foto || null,
        foto_servidor: row.foto || null,
        foto_questionario: row.foto_questionario || null,
        foto_questionario_servidor: row.foto_questionario || null,
        latitude: row.latitude != null ? Number(row.latitude) : null,
        longitude: row.longitude != null ? Number(row.longitude) : null,
        tipo_entrega: row.tipo_entrega || null,
        id_motorista: row.id_motorista != null ? Number(row.id_motorista) : null,
        status_sincronizacao: row.status_sincronizacao || 'sincronizado',
    };
}

const SELECT_ENTREGA = `
    SELECT e.num_guia, e.of_numero, e.lote, e.status, e.observacao,
           g.nome_genero AS produto_enviado,
           e.qtd_enviada, e.qtd_entregue, e.qtd_devolvida,
           e.dt_previsao, e.dt_entregue, e.data_hora_entrega, e.dt_inicio_cronograma,
           e.data_prevista_fornecedor, e.data_antecipacao, e.data_prorrogacao,
           e.cod_escola, e.id_genero, e.id_dist,
           e.latitude, e.longitude, e.tipo_entrega,
           e.foto, e.foto_questionario, e.prioridade,
           e.id_motorista, e.status_sincronizacao,
           d.nome AS distribuicao_nome, d.emergencial AS is_emergencial
      FROM entregas e
      JOIN generos       g ON g.id_genero  = e.id_genero
      JOIN distribuicoes d ON d.id_dist    = e.id_dist
      JOIN escolas       s ON s.cod_escola = e.cod_escola
`;

// ---------------------------------------------------------------------------
// POST /api/mobile/login
// ---------------------------------------------------------------------------
router.post('/login', asyncHandler(async (req, res) => {
    const { username, senha } = req.body || {};

    if (!username || !senha) {
        return sendValidationError(res, 'Usuario e senha sao obrigatorios');
    }

    const usuario = get(
        'SELECT * FROM usuarios WHERE lower(username) = $username',
        { username: String(username).trim().toLowerCase() },
    );

    // Mesma mensagem para usuario inexistente e senha errada: nao entregamos
    // para quem esta tentando adivinhar qual dos dois campos ja esta certo.
    const senhaConfere = usuario ? await bcrypt.compare(String(senha), usuario.senha_hash) : false;
    if (!senhaConfere) {
        return sendUnauthorized(res, 'Usuario ou senha invalidos');
    }

    const { token, refreshToken } = gerarTokens(usuario);

    return sendSuccess(res, {
        message: 'Login realizado com sucesso',
        token,
        refreshToken,
        user: usuarioPublico(usuario),
    });
}));

// ---------------------------------------------------------------------------
// POST /api/mobile/refresh
// ---------------------------------------------------------------------------
router.post('/refresh', asyncHandler(async (req, res) => {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return sendValidationError(res, 'refreshToken e obrigatorio');

    let payload;
    try {
        payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch {
        return sendUnauthorized(res, 'Refresh token invalido ou expirado');
    }

    const usuario = get('SELECT * FROM usuarios WHERE id = $id', { id: payload.id });
    if (!usuario) return sendUnauthorized(res, 'Usuario nao encontrado');

    const tokens = gerarTokens(usuario);
    return sendSuccess(res, { token: tokens.token, refreshToken: tokens.refreshToken });
}));

// ---------------------------------------------------------------------------
// GET /api/mobile/me
// ---------------------------------------------------------------------------
router.get('/me', authenticate, requireDriver, asyncHandler(async (req, res) => {
    return sendSuccess(res, usuarioPublico(req.user));
}));

// ---------------------------------------------------------------------------
// GET /api/mobile/guias/:num_guia
//
// Busca avulsa: o motorista digita o numero da guia na home e o app pergunta
// ao servidor, mesmo que ela nao tenha vindo no pull.
// ---------------------------------------------------------------------------
router.get('/guias/:num_guia', authenticate, requireDriver, asyncHandler(async (req, res) => {
    const numGuia = Number.parseInt(req.params.num_guia, 10);
    if (!Number.isFinite(numGuia)) {
        return sendValidationError(res, 'Numero de guia invalido');
    }

    const row = get(`${SELECT_ENTREGA} WHERE e.num_guia = $num_guia`, { num_guia: numGuia });
    if (!row) return sendNotFound(res, 'Guia nao encontrada');

    // Motorista so ve guia atribuida a ele ou ainda sem dono. Admin ve tudo.
    // Respondemos 404 (e nao 403) para nao confirmar que a guia existe.
    const ehDono = row.id_motorista == null || row.id_motorista === req.user.id_motorista;
    if (req.user.nivel !== 'admin' && !ehDono) {
        return sendNotFound(res, 'Guia nao encontrada');
    }

    return sendSuccess(res, mapEntrega(row));
}));

// ---------------------------------------------------------------------------
// GET /api/mobile/sync/pull
// ---------------------------------------------------------------------------
router.get('/sync/pull', authenticate, requireDriver, asyncHandler(async (req, res) => {
    const lastPulledAtRaw = req.query.last_pulled_at ?? req.query.lastPulledAt;
    const localCount = Number.parseInt(req.query.local_count ?? '0', 10) || 0;
    const parsed = Number(lastPulledAtRaw);

    // Vale como primeira sync tambem quando o aparelho diz ter zero registros:
    // e o caso de reinstalar o app, em que o lastPulledAt volta salvo do storage
    // mas o banco local esta vazio — um pull incremental deixaria o app sem nada.
    const isFirstSync =
        !lastPulledAtRaw ||
        lastPulledAtRaw === '0' ||
        lastPulledAtRaw === 'null' ||
        lastPulledAtRaw === 'undefined' ||
        !Number.isFinite(parsed) ||
        localCount === 0;

    // Quando o esquema local do aplicativo muda, o WatermelonDB manda em
    // `migration` a descricao do que foi criado, para o servidor reenviar o que
    // preencheria as colunas novas. Sem tratar isso, uma coluna adicionada a
    // escolas (foi o caso de latitude/longitude) nasce vazia e fica vazia para
    // sempre: escolas so viajam na primeira sincronizacao, e o aparelho ja fez a
    // dele. O sintoma seria mudo — nenhum erro, so um mapa que nunca aparece.
    let houveMigracao = false;
    try {
        const migracao = JSON.parse(req.query.migration ?? 'null');
        houveMigracao = migracao != null;
    } catch {
        // `migration` malformado nao deve derrubar a sincronizacao inteira;
        // no pior caso o aparelho segue sem os dados das colunas novas.
        houveMigracao = false;
    }

    // Reenvia as tabelas de apoio na primeira sync e sempre que o app migrar.
    const enviarTabelasDeApoio = isFirstSync || houveMigracao;

    const ehAdmin = req.user.nivel === 'admin';
    const idMotorista = req.user.id_motorista ?? null;

    let entregas = [];

    if (!ehAdmin && idMotorista == null) {
        // Usuario driver sem motorista vinculado: nao ha o que sincronizar.
        console.warn(`[pull] ${req.user.username} e driver mas nao tem id_motorista vinculado`);
    } else {
        const filtros = [];
        const params = {};

        if (!ehAdmin) {
            filtros.push('e.id_motorista = $id_motorista');
            params.id_motorista = idMotorista;
        }

        if (isFirstSync) {
            filtros.push('e.updated_at >= $corte');
            params.corte = Date.now() - JANELA_PRIMEIRA_SYNC_MS;
        } else {
            filtros.push('e.updated_at > $last_pulled_at');
            params.last_pulled_at = parsed;
        }

        const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
        entregas = all(`${SELECT_ENTREGA} ${where} ORDER BY e.num_guia`, params).map(mapEntrega);
    }

    // Escolas e generos nao viajam em toda sincronizacao: mudam raramente e sao
    // a maior parte do payload. Vao na primeira e sempre que o app migrar o
    // esquema — nos demais pulls o aparelho reusa o que ja gravou.
    // Vao inteiras na primeira sync e depois de uma migracao de esquema; nos
    // demais pulls, so as linhas alteradas desde a ultima sincronizacao. Esse
    // filtro por atualizado_em e o que faz uma correcao no cadastro (um endereco
    // errado, o nome de um genero) efetivamente chegar a um aparelho que ja
    // sincronizou — antes dele, so reinstalando o app.
    const filtroApoio = enviarTabelasDeApoio ? '' : 'WHERE atualizado_em > $desde';
    const paramsApoio = enviarTabelasDeApoio ? {} : { desde: parsed };

    const escolas = all(
        `SELECT cod_escola, nome_escola, endereco, bairro, municipio, cep, gre,
                latitude, longitude
           FROM escolas ${filtroApoio}`,
        paramsApoio,
    ).map((row) => {
        const partes = [row.endereco, row.bairro, row.municipio]
            .filter(Boolean)
            .map((parte) => String(parte).trim());
        return {
            id: String(row.cod_escola),
            cod_escola: String(row.cod_escola),
            nome_escola: row.nome_escola,
            gre: row.gre || '',
            endereco: partes.join(', ') || 'Endereço não informado',
            bairro: row.bairro || '',
            municipio: row.municipio || '',
            cep: row.cep || '',
            // Coordenada da escola: e o que permite mostrar o destino no mapa
            // antes de a entrega acontecer. A latitude/longitude da propria
            // entrega so existe depois que o motorista registra.
            latitude: row.latitude != null ? Number(row.latitude) : null,
            longitude: row.longitude != null ? Number(row.longitude) : null,
        };
    });

    const generos = all(
        `SELECT id_genero, nome_genero FROM generos ${filtroApoio}`,
        paramsApoio,
    ).map((row) => ({
        id: String(row.id_genero),
        id_genero: String(row.id_genero),
        nome_genero: row.nome_genero,
    }));

    console.log(
        `[pull] ${req.user.username} | primeira=${isFirstSync} migracao=${houveMigracao} | `
        + `entregas=${entregas.length} escolas=${escolas.length} generos=${generos.length}`,
    );

    // Tudo sai como 'updated' e nada como 'created' porque o app roda o sync com
    // sendCreatedAsUpdated: true. Mandar algo em 'created' faz o WatermelonDB
    // reclamar no console e, se o registro ja existir localmente, falhar o ciclo.
    return sendSuccess(res, {
        changes: {
            entregas: { created: [], updated: entregas, deleted: [] },
            escolas: { created: [], updated: escolas, deleted: [] },
            generos: { created: [], updated: generos, deleted: [] },
        },
        timestamp: Date.now(),
    });
}));

// ---------------------------------------------------------------------------
// POST /api/mobile/sync/push
// ---------------------------------------------------------------------------
router.post('/sync/push', authenticate, requireDriver, asyncHandler(async (req, res) => {
    const { changes } = req.body || {};
    const idMotorista = req.user.id_motorista ?? null;
    const agora = Date.now();

    const failedGuias = [];
    const atualizadas = [];

    const updated = changes?.entregas?.updated ?? [];

    // Foto ainda como URI local significa que o pre-upload nao confirmou:
    // gravar isso no banco criaria um caminho que so existe no aparelho.
    // Mandamos null e o COALESCE preserva o que ja havia no servidor.
    //
    // 'data:' e 'blob:' sao os formatos que aparecem quando o app roda no
    // navegador. Sem eles nesta lista, um base64 de varios megabytes seria
    // gravado na coluna foto como se fosse um caminho de arquivo.
    const PREFIXOS_LOCAIS = ['file://', 'content://', 'data:', 'blob:'];
    const caminhoValido = (valor) => (
        typeof valor === 'string' && valor
        && !PREFIXOS_LOCAIS.some((prefixo) => valor.startsWith(prefixo))
            ? valor
            : null
    );

    for (const entrega of updated) {
        const numGuia = Number.parseInt(entrega.num_guia ?? entrega.id, 10);
        if (!Number.isFinite(numGuia)) {
            console.warn('[push] registro sem num_guia utilizavel, ignorado');
            continue;
        }

        try {
            const resultado = transaction(() => run(
                `UPDATE entregas SET
                     status               = COALESCE($status, status),
                     observacao           = COALESCE($observacao, observacao),
                     qtd_entregue         = COALESCE($qtd_entregue, qtd_entregue),
                     qtd_devolvida        = COALESCE($qtd_devolvida, qtd_devolvida),
                     data_hora_entrega    = COALESCE($data_hora_entrega, data_hora_entrega),
                     dt_entregue          = COALESCE($data_hora_entrega, dt_entregue),
                     latitude             = COALESCE($latitude, latitude),
                     longitude            = COALESCE($longitude, longitude),
                     tipo_entrega         = COALESCE($tipo_entrega, tipo_entrega),
                     foto                 = COALESCE($foto, foto),
                     foto_questionario    = COALESCE($foto_questionario, foto_questionario),
                     id_motorista         = COALESCE(id_motorista, $id_motorista),
                     status_sincronizacao = 'sincronizado',
                     synced_at            = $agora,
                     updated_at           = $agora
                 WHERE num_guia = $num_guia
                   AND ($id_motorista IS NULL OR id_motorista IS NULL OR id_motorista = $id_motorista)`,
                {
                    num_guia: numGuia,
                    status: entrega.status ?? null,
                    observacao: entrega.observacao ?? null,
                    qtd_entregue: entrega.qtd_entregue ?? null,
                    qtd_devolvida: entrega.qtd_devolvida ?? null,
                    data_hora_entrega: entrega.data_hora_entrega ?? null,
                    latitude: entrega.latitude ?? null,
                    longitude: entrega.longitude ?? null,
                    tipo_entrega: entrega.tipo_entrega ?? null,
                    foto: caminhoValido(entrega.foto) ?? caminhoValido(entrega.foto_servidor),
                    foto_questionario: caminhoValido(entrega.foto_questionario)
                        ?? caminhoValido(entrega.foto_questionario_servidor),
                    id_motorista: idMotorista,
                    agora,
                },
            ));

            // UPDATE que nao pegou nenhuma linha: guia inexistente ou de outro
            // motorista. Devolvemos na lista para o app reenfileirar, em vez de
            // deixar ele marcar como enviada — senao o registro some do aparelho
            // sem nunca ter chegado ao servidor.
            if (resultado.changes === 0) {
                failedGuias.push(String(numGuia));
                console.warn(`[push] guia ${numGuia} nao atualizada (inexistente ou de outro motorista)`);
            } else {
                atualizadas.push(numGuia);
            }
        } catch (error) {
            failedGuias.push(String(numGuia));
            console.error(`[push] erro ao gravar guia ${numGuia}:`, error.message);
        }
    }

    console.log(`[push] ${req.user.username} | gravadas=${atualizadas.length} falhas=${failedGuias.length}`);

    return sendSuccess(res, {
        updated: atualizadas.length,
        failed_guias: failedGuias,
    });
}));

// ---------------------------------------------------------------------------
// POST /api/mobile/fotos/upload
// ---------------------------------------------------------------------------
router.post(
    '/fotos/upload',
    authenticate,
    requireDriver,
    upload.single('foto'),
    asyncHandler(async (req, res) => {
        const { num_guia: numGuiaRaw, tipo = 'guia' } = req.body || {};
        const numGuia = Number.parseInt(numGuiaRaw, 10);

        if (!Number.isFinite(numGuia)) return sendValidationError(res, 'num_guia e obrigatorio');
        if (tipo !== 'guia' && tipo !== 'questionario') {
            return sendValidationError(res, 'tipo deve ser guia ou questionario');
        }

        // O app manda multipart; o campo base64 fica como alternativa para
        // testar a rota por curl ou Insomnia sem montar um multipart.
        let buffer = req.file?.buffer ?? null;
        if (!buffer && typeof req.body.foto_base64 === 'string') {
            buffer = Buffer.from(req.body.foto_base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        }
        if (!buffer?.length) return sendValidationError(res, 'Nenhuma imagem recebida');

        const guia = get('SELECT num_guia FROM entregas WHERE num_guia = $num_guia', { num_guia: numGuia });
        if (!guia) return sendNotFound(res, 'Guia nao encontrada');

        const agora = new Date();
        const pastaRelativa = path.posix.join(
            'guias',
            String(agora.getFullYear()),
            String(agora.getMonth() + 1).padStart(2, '0'),
        );
        const nomeArquivo = tipo === 'questionario' ? `${numGuia}_questionario.jpg` : `${numGuia}.jpg`;
        const caminhoRelativo = path.posix.join(pastaRelativa, nomeArquivo);

        const pastaAbsoluta = path.join(UPLOADS_DIR, pastaRelativa);
        await fs.mkdir(pastaAbsoluta, { recursive: true });
        // Sobrescrever e proposital: reenviar a mesma guia e idempotente, senao
        // cada retentativa de upload duplicaria o arquivo.
        await fs.writeFile(path.join(pastaAbsoluta, nomeArquivo), buffer);

        const coluna = tipo === 'questionario' ? 'foto_questionario' : 'foto';
        run(
            `UPDATE entregas SET ${coluna} = $caminho, updated_at = $agora WHERE num_guia = $num_guia`,
            { caminho: caminhoRelativo, agora: Date.now(), num_guia: numGuia },
        );

        console.log(`[foto] guia ${numGuia} (${tipo}) -> ${caminhoRelativo} (${buffer.length} bytes)`);

        // O app grava esse caminho em foto_servidor e o usa como prova de que o
        // upload foi confirmado; o prefixo 'guias/' e verificado no lado dele.
        return sendSuccess(res, { caminho: caminhoRelativo });
    }),
);

// ---------------------------------------------------------------------------
// POST /api/mobile/token — registro do token de push do aparelho
// ---------------------------------------------------------------------------
router.post('/token', authenticate, asyncHandler(async (req, res) => {
    const body = req.body || {};
    const token = body.token || body.expoPushToken || body.pushToken;
    const deviceId = body.device_id || body.deviceId || null;
    const plataforma = body.plataforma || body.platform || null;

    if (!token) return sendValidationError(res, 'token e obrigatorio');

    run(
        `INSERT INTO push_tokens (usuario_id, token, device_id, plataforma, atualizado_em)
         VALUES ($usuario_id, $token, $device_id, $plataforma, $agora)
         ON CONFLICT(token) DO UPDATE SET
             usuario_id    = excluded.usuario_id,
             device_id     = excluded.device_id,
             plataforma    = excluded.plataforma,
             atualizado_em = excluded.atualizado_em`,
        {
            usuario_id: req.user.id,
            token: String(token),
            device_id: deviceId,
            plataforma,
            agora: Date.now(),
        },
    );

    return sendSuccess(res, { registrado: true });
}));

// ---------------------------------------------------------------------------
// POST /api/mobile/diagnostics
//
// Sem authenticate de proposito: o app envia evento de erro justamente quando
// o login ou o token falharam. Exigir token aqui perderia esses casos.
// ---------------------------------------------------------------------------
router.post('/diagnostics', asyncHandler(async (req, res) => {
    const body = req.body ?? {};

    // O app envia a fila como array puro no corpo (ver flushDiagnosticQueue em
    // utils/diagnostics.ts) e carrega device_id/app_version dentro de cada
    // evento. As outras duas formas ficam aceitas para facilitar teste manual.
    const eventos = Array.isArray(body)
        ? body
        : (Array.isArray(body.events) ? body.events : [body]);

    let gravados = 0;

    for (const evento of eventos.slice(0, 50)) {
        // Um item que nao seja objeto nao tem o que gravar, e inserir assim mesmo
        // enche a tabela de linhas totalmente nulas que escondem os erros reais.
        if (!evento || typeof evento !== 'object' || Array.isArray(evento)) continue;

        run(
            `INSERT INTO diagnosticos
                 (usuario_id, device_id, app_version, error_type, error_code,
                  context, extra, occurred_at, criado_em)
             VALUES ($usuario_id, $device_id, $app_version, $error_type, $error_code,
                     $context, $extra, $occurred_at, $criado_em)`,
            {
                usuario_id: evento.usuario_id ?? body.usuario_id ?? null,
                device_id: evento.device_id ?? body.device_id ?? null,
                app_version: evento.app_version ?? body.app_version ?? null,
                error_type: evento.error_type ?? null,
                error_code: evento.error_code ?? null,
                context: evento.context ?? null,
                extra: evento.extra ? JSON.stringify(evento.extra) : null,
                occurred_at: evento.occurred_at ?? null,
                criado_em: Date.now(),
            },
        );
        gravados += 1;
    }

    if (gravados > 0) {
        console.log(`[diag] ${gravados} evento(s) recebido(s) do aplicativo`);
    }

    return sendSuccess(res, { recebidos: gravados });
}));

export default router;
