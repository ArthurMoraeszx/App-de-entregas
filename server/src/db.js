// ---------------------------------------------------------------------------
// Camada de banco de dados — SQLite embutido no proprio Node (node:sqlite).
//
// Optamos pelo modulo nativo do Node em vez de better-sqlite3/sqlite3 porque
// aqueles exigem compilacao com node-gyp: em maquina Windows sem Visual Studio
// Build Tools o `npm install` quebra. Com node:sqlite o projeto instala e roda
// em qualquer maquina que tenha Node >= 22.5.
// ---------------------------------------------------------------------------
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const dbFile = path.resolve(ROOT, process.env.DB_FILE || './data/rotaescolar.db');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

export const db = new DatabaseSync(dbFile);

// WAL deixa leitura e escrita concorrentes sem travar o arquivo — importante
// porque o sync do app dispara pull e push quase ao mesmo tempo.
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    senha_hash    TEXT    NOT NULL,
    nome          TEXT    NOT NULL,
    email         TEXT,
    setor         TEXT,
    -- 'driver' enxerga apenas as proprias guias; 'admin' enxerga todas.
    nivel         TEXT    NOT NULL DEFAULT 'driver',
    id_motorista  INTEGER REFERENCES motoristas(id_motorista),
    criado_em     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS motoristas (
    id_motorista INTEGER PRIMARY KEY,
    nome         TEXT NOT NULL,
    cnh          TEXT,
    telefone     TEXT
);

-- 'atualizado_em' existe nestas duas tabelas pelo mesmo motivo que em entregas:
-- e por ele que o pull incremental sabe o que mudou. Sem essa coluna, escolas e
-- generos so chegariam ao aparelho na primeira sincronizacao, e qualquer
-- correcao posterior (um endereco, o nome de um genero) ficaria invisivel no
-- app para sempre, sem nenhum erro que denunciasse isso.
CREATE TABLE IF NOT EXISTS escolas (
    cod_escola    TEXT PRIMARY KEY,
    nome_escola   TEXT NOT NULL,
    endereco      TEXT,
    bairro        TEXT,
    municipio     TEXT,
    cep           TEXT,
    gre           TEXT,
    latitude      REAL,
    longitude     REAL,
    atualizado_em INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS generos (
    id_genero     TEXT PRIMARY KEY,
    nome_genero   TEXT NOT NULL,
    atualizado_em INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS distribuicoes (
    id_dist     TEXT PRIMARY KEY,
    nome        TEXT NOT NULL,
    periodo     TEXT,
    emergencial INTEGER NOT NULL DEFAULT 0
);

-- Uma linha por guia. num_guia e a chave que o app usa como id do WatermelonDB,
-- por isso e INTEGER PRIMARY KEY e nao um uuid.
CREATE TABLE IF NOT EXISTS entregas (
    num_guia                 INTEGER PRIMARY KEY,
    of_numero                TEXT,
    lote                     TEXT,
    -- pendente | aguardando_questionario | parcial | concluida | devolvido | cancelado
    status                   TEXT    NOT NULL DEFAULT 'pendente',
    observacao               TEXT,
    qtd_enviada              REAL    NOT NULL DEFAULT 0,
    qtd_entregue             REAL,
    qtd_devolvida            REAL,
    -- Todas as datas sao epoch em milissegundos: e o formato que o
    -- WatermelonDB espera receber e devolver, entao evita conversao nas bordas.
    dt_previsao              INTEGER,
    dt_entregue              INTEGER,
    data_hora_entrega        INTEGER,
    dt_inicio_cronograma     INTEGER,
    data_prevista_fornecedor INTEGER,
    data_antecipacao         INTEGER,
    data_prorrogacao         INTEGER,
    cod_escola               TEXT    NOT NULL REFERENCES escolas(cod_escola),
    id_genero                TEXT    NOT NULL REFERENCES generos(id_genero),
    id_dist                  TEXT    NOT NULL REFERENCES distribuicoes(id_dist),
    id_motorista             INTEGER REFERENCES motoristas(id_motorista),
    latitude                 REAL,
    longitude                REAL,
    tipo_entrega             TEXT,
    foto                     TEXT,
    foto_questionario        TEXT,
    prioridade               INTEGER NOT NULL DEFAULT 0,
    status_sincronizacao     TEXT    NOT NULL DEFAULT 'sincronizado',
    synced_at                INTEGER,
    created_at               INTEGER NOT NULL,
    updated_at               INTEGER NOT NULL
);

-- O pull incremental filtra por updated_at; sem indice ele varre a tabela toda
-- a cada ciclo de sync de cada aparelho.
CREATE INDEX IF NOT EXISTS idx_entregas_updated  ON entregas(updated_at);
CREATE INDEX IF NOT EXISTS idx_entregas_motorista ON entregas(id_motorista);
CREATE INDEX IF NOT EXISTS idx_entregas_status    ON entregas(status);

CREATE TABLE IF NOT EXISTS push_tokens (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
    token        TEXT    NOT NULL UNIQUE,
    device_id    TEXT,
    plataforma   TEXT,
    atualizado_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS diagnosticos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id  INTEGER,
    device_id   TEXT,
    app_version TEXT,
    error_type  TEXT,
    error_code  TEXT,
    context     TEXT,
    extra       TEXT,
    occurred_at INTEGER,
    criado_em   INTEGER NOT NULL
);
`;

/**
 * Adiciona uma coluna se ela ainda nao existir.
 *
 * `CREATE TABLE IF NOT EXISTS` nao altera tabela ja criada: mudar o SCHEMA acima
 * so tem efeito em banco novo. Sem isto, quem ja rodou o projeto antes ficaria
 * com o banco velho e veria erro de "no such column" na primeira consulta.
 */
function garantirColuna(tabela, coluna, definicao) {
    const colunas = db.prepare(`PRAGMA table_info(${tabela})`).all();
    if (!colunas.some((c) => c.name === coluna)) {
        db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
        console.log(`[db] coluna ${tabela}.${coluna} criada`);
    }
}

export function migrate() {
    db.exec(SCHEMA);

    garantirColuna('escolas', 'latitude', 'REAL');
    garantirColuna('escolas', 'longitude', 'REAL');
    garantirColuna('escolas', 'atualizado_em', 'INTEGER NOT NULL DEFAULT 0');
    garantirColuna('generos', 'atualizado_em', 'INTEGER NOT NULL DEFAULT 0');
}

/**
 * node:sqlite so aceita null, number, bigint, string e Uint8Array como valor de
 * bind. Booleano e undefined — que aparecem o tempo todo no payload do app —
 * estouram com "Provided value cannot be bound to SQLite parameter". Normalizar
 * aqui, num lugar so, evita ter que lembrar disso em cada query.
 */
function normalize(params) {
    const out = {};
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) out[key] = null;
        else if (typeof value === 'boolean') out[key] = value ? 1 : 0;
        else if (value instanceof Date) out[key] = value.getTime();
        else out[key] = value;
    }
    return out;
}

/**
 * Monta a lista de argumentos do bind. Query sem parametro precisa ser chamada
 * SEM argumento nenhum: passar {} faz o node:sqlite reclamar de valor a mais.
 */
const bind = (params) => (Object.keys(params).length ? [normalize(params)] : []);

/** Executa uma query que devolve varias linhas. */
export function all(sql, params = {}) {
    return db.prepare(sql).all(...bind(params));
}

/** Executa uma query que devolve no maximo uma linha. */
export function get(sql, params = {}) {
    return db.prepare(sql).get(...bind(params)) ?? null;
}

/** Executa INSERT/UPDATE/DELETE e devolve { changes, lastInsertRowid }. */
export function run(sql, params = {}) {
    return db.prepare(sql).run(...bind(params));
}

/**
 * Roda `fn` dentro de uma transacao. Se `fn` lancar, faz ROLLBACK.
 * Usado no push: ou a guia inteira entra, ou nao entra nada dela.
 */
export function transaction(fn) {
    db.exec('BEGIN');
    try {
        const result = fn();
        db.exec('COMMIT');
        return result;
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
}
