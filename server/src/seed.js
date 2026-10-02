// ---------------------------------------------------------------------------
// Popula o banco com dados ficticios para desenvolvimento e apresentacao.
//
//   npm run seed          insere so o que ainda nao existe
//   npm run seed:reset    apaga tudo e recria do zero
//
// Nenhum dado aqui e real: escolas, motoristas e guias sao inventados.
// ---------------------------------------------------------------------------
import 'dotenv/config';
import bcrypt from 'bcryptjs';

import { db, migrate, run, get } from './db.js';

const RESET = process.argv.includes('--reset');

const DIA = 24 * 60 * 60 * 1000;
const AGORA = Date.now();

migrate();

if (RESET) {
    console.log('Limpando tabelas...');
    // Ordem importa: filhas antes das pais, senao a FK bloqueia o delete.
    for (const tabela of ['diagnosticos', 'push_tokens', 'entregas', 'usuarios', 'motoristas', 'escolas', 'generos', 'distribuicoes']) {
        db.exec(`DELETE FROM ${tabela}`);
    }
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('usuarios', 'push_tokens', 'diagnosticos')");
}

// ---------------------------------------------------------------------------
// Motoristas
// ---------------------------------------------------------------------------
const MOTORISTAS = [
    { id_motorista: 1, nome: 'Carlos Andrade', cnh: '01234567890', telefone: '(11) 98800-1001' },
    { id_motorista: 2, nome: 'Rita Nogueira', cnh: '01234567891', telefone: '(11) 98800-1002' },
    { id_motorista: 3, nome: 'Joel Bastos', cnh: '01234567892', telefone: '(11) 98800-1003' },
];

for (const motorista of MOTORISTAS) {
    run(
        `INSERT INTO motoristas (id_motorista, nome, cnh, telefone)
         VALUES ($id_motorista, $nome, $cnh, $telefone)
         ON CONFLICT(id_motorista) DO UPDATE SET
             nome = excluded.nome, cnh = excluded.cnh, telefone = excluded.telefone`,
        motorista,
    );
}

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------
const SENHA_PADRAO = '123456';
const senhaHash = await bcrypt.hash(SENHA_PADRAO, 10);

const USUARIOS = [
    { username: 'carlos', nome: 'Carlos Andrade', email: 'carlos@exemplo.com', setor: 'Logística', nivel: 'driver', id_motorista: 1 },
    { username: 'rita', nome: 'Rita Nogueira', email: 'rita@exemplo.com', setor: 'Logística', nivel: 'driver', id_motorista: 2 },
    { username: 'joel', nome: 'Joel Bastos', email: 'joel@exemplo.com', setor: 'Logística', nivel: 'driver', id_motorista: 3 },
    { username: 'admin', nome: 'Administração', email: 'admin@exemplo.com', setor: 'Gestão', nivel: 'admin', id_motorista: null },
];

for (const usuario of USUARIOS) {
    run(
        `INSERT INTO usuarios (username, senha_hash, nome, email, setor, nivel, id_motorista, criado_em)
         VALUES ($username, $senha_hash, $nome, $email, $setor, $nivel, $id_motorista, $criado_em)
         ON CONFLICT(username) DO UPDATE SET
             nome = excluded.nome, email = excluded.email,
             nivel = excluded.nivel, id_motorista = excluded.id_motorista`,
        { ...usuario, senha_hash: senhaHash, criado_em: AGORA },
    );
}

// ---------------------------------------------------------------------------
// Escolas
//
// Os nomes das escolas são inventados, mas endereço, bairro, CEP e coordenada
// são reais e correspondem entre si: o endereço mostrado no card é o mesmo que
// a geocodificação reversa devolve para aquela coordenada no mapa.
//
// Isso importa porque o componente de mapa consulta o Nominatim e exibe o
// endereço que ele encontra. Com endereço inventado sobre coordenada real, a
// tela mostrava uma rua e o mapa mostrava outra, logo abaixo.
// ---------------------------------------------------------------------------
const ESCOLAS = [
    { cod_escola: '1001', nome_escola: 'EM Professora Alzira Mendes', endereco: 'Rua Ribeiro de Lima, 680', bairro: 'Bairro da Luz', municipio: 'São Paulo', cep: '01122-000', gre: 'Regional 1', latitude: -23.5320, longitude: -46.6390 },
    { cod_escola: '1002', nome_escola: 'EM Doutor Aristides Lobo', endereco: 'Avenida Mercúrio, 320', bairro: 'Glicério', municipio: 'São Paulo', cep: '03007-000', gre: 'Regional 1', latitude: -23.5445, longitude: -46.6280 },
    { cod_escola: '1003', nome_escola: 'EM Monteiro Lobato', endereco: 'Rua Professor Picarolo, 163', bairro: 'Morro dos Ingleses', municipio: 'São Paulo', cep: '01332-903', gre: 'Regional 1', latitude: -23.5610, longitude: -46.6550 },
    { cod_escola: '1004', nome_escola: 'EM Cecília Meireles', endereco: 'Rua Italia Fausto, 95', bairro: 'Cambuci', municipio: 'São Paulo', cep: '01543-001', gre: 'Regional 2', latitude: -23.5750, longitude: -46.6180 },
    { cod_escola: '1005', nome_escola: 'EM Anísio Teixeira', endereco: 'Rua Doutor Moisés Kahan, 70', bairro: 'Barra Funda', municipio: 'São Paulo', cep: '01139-040', gre: 'Regional 2', latitude: -23.5180, longitude: -46.6710 },
    { cod_escola: '1006', nome_escola: 'EM Paulo Freire', endereco: 'Rua Comandante Ferreira Carneiro, 210', bairro: 'Parque Monteiro Soares', municipio: 'São Paulo', cep: '02925-000', gre: 'Regional 2', latitude: -23.5010, longitude: -46.7020 },
    { cod_escola: '1007', nome_escola: 'EM Darcy Ribeiro', endereco: 'Rua Silva Bueno, 1255', bairro: 'Ipiranga', municipio: 'São Paulo', cep: '04208-053', gre: 'Regional 3', latitude: -23.5895, longitude: -46.6015 },
    { cod_escola: '1008', nome_escola: 'EM Carolina Maria de Jesus', endereco: 'Rua Napoleão de Barros, 715', bairro: 'Mirandópolis', municipio: 'São Paulo', cep: '04043-200', gre: 'Regional 3', latitude: -23.6020, longitude: -46.6440 },
];

for (const escola of ESCOLAS) {
    run(
        `INSERT INTO escolas (cod_escola, nome_escola, endereco, bairro, municipio, cep, gre,
                              latitude, longitude, atualizado_em)
         VALUES ($cod_escola, $nome_escola, $endereco, $bairro, $municipio, $cep, $gre,
                 $latitude, $longitude, $atualizado_em)
         ON CONFLICT(cod_escola) DO UPDATE SET
             nome_escola = excluded.nome_escola, endereco = excluded.endereco,
             bairro = excluded.bairro, municipio = excluded.municipio,
             cep = excluded.cep, gre = excluded.gre,
             latitude = excluded.latitude, longitude = excluded.longitude,
             atualizado_em = excluded.atualizado_em`,
        { ...escola, atualizado_em: AGORA },
    );
}

// ---------------------------------------------------------------------------
// Generos alimenticios
// ---------------------------------------------------------------------------
const GENEROS = [
    { id_genero: '1', nome_genero: 'Arroz' },
    { id_genero: '2', nome_genero: 'Feijão' },
    { id_genero: '3', nome_genero: 'Frango' },
    { id_genero: '4', nome_genero: 'Ovo' },
    { id_genero: '5', nome_genero: 'Leite' },
];

for (const genero of GENEROS) {
    run(
        `INSERT INTO generos (id_genero, nome_genero, atualizado_em)
         VALUES ($id_genero, $nome_genero, $atualizado_em)
         ON CONFLICT(id_genero) DO UPDATE SET
             nome_genero = excluded.nome_genero,
             atualizado_em = excluded.atualizado_em`,
        { ...genero, atualizado_em: AGORA },
    );
}

// ---------------------------------------------------------------------------
// Distribuicoes
// ---------------------------------------------------------------------------
const DISTRIBUICOES = [
    { id_dist: '10', nome: 'Distribuição Regular — Setembro', periodo: '2026-09', emergencial: 0 },
    { id_dist: '11', nome: 'Distribuição Regular — Outubro', periodo: '2026-10', emergencial: 0 },
    { id_dist: '12', nome: 'Reposição Emergencial', periodo: '2026-09', emergencial: 1 },
];

for (const dist of DISTRIBUICOES) {
    run(
        `INSERT INTO distribuicoes (id_dist, nome, periodo, emergencial)
         VALUES ($id_dist, $nome, $periodo, $emergencial)
         ON CONFLICT(id_dist) DO UPDATE SET
             nome = excluded.nome, periodo = excluded.periodo,
             emergencial = excluded.emergencial`,
        dist,
    );
}

// ---------------------------------------------------------------------------
// Guias (entregas)
//
// A maioria fica com o motorista 1 (usuario "carlos") e em status pendente,
// para que o primeiro login ja tenha o que mostrar na tela inicial.
// ---------------------------------------------------------------------------
const ENTREGAS = [];
let numGuia = 24001;

// Guias pendentes do motorista 1 — o cenario principal da demonstracao.
const pendentesCarlos = [
    { escola: '1001', genero: '1', qtd: 250, prioridade: 1, prazoEmDias: 1 },
    { escola: '1001', genero: '2', qtd: 180, prioridade: 0, prazoEmDias: 1 },
    { escola: '1002', genero: '3', qtd: 120, prioridade: 0, prazoEmDias: 2 },
    { escola: '1002', genero: '5', qtd: 300, prioridade: 0, prazoEmDias: 2 },
    { escola: '1003', genero: '1', qtd: 200, prioridade: 1, prazoEmDias: 3 },
    { escola: '1003', genero: '4', qtd: 90, prioridade: 0, prazoEmDias: 3 },
    { escola: '1004', genero: '2', qtd: 160, prioridade: 0, prazoEmDias: 4 },
    { escola: '1005', genero: '3', qtd: 140, prioridade: 0, prazoEmDias: 5 },
    // Prazo ja vencido: exercita a marcacao de atraso na lista do app.
    { escola: '1006', genero: '1', qtd: 220, prioridade: 1, prazoEmDias: -2 },
    { escola: '1007', genero: '5', qtd: 260, prioridade: 0, prazoEmDias: -1 },
];

for (const item of pendentesCarlos) {
    ENTREGAS.push({
        num_guia: numGuia++,
        cod_escola: item.escola,
        id_genero: item.genero,
        id_dist: '10',
        id_motorista: 1,
        status: 'pendente',
        qtd_enviada: item.qtd,
        prioridade: item.prioridade,
        dt_previsao: AGORA + item.prazoEmDias * DIA,
    });
}

// Guias ja concluidas do motorista 1 — alimentam o historico e o perfil.
const concluidasCarlos = [
    { escola: '1001', genero: '3', qtd: 110, diasAtras: 2 },
    { escola: '1002', genero: '1', qtd: 240, diasAtras: 3 },
    { escola: '1004', genero: '5', qtd: 280, diasAtras: 5 },
    { escola: '1008', genero: '2', qtd: 150, diasAtras: 8 },
];

for (const item of concluidasCarlos) {
    const entregueEm = AGORA - item.diasAtras * DIA;
    ENTREGAS.push({
        num_guia: numGuia++,
        cod_escola: item.escola,
        id_genero: item.genero,
        id_dist: '10',
        id_motorista: 1,
        status: 'concluida',
        qtd_enviada: item.qtd,
        qtd_entregue: item.qtd,
        qtd_devolvida: 0,
        prioridade: 0,
        dt_previsao: entregueEm,
        dt_entregue: entregueEm,
        data_hora_entrega: entregueEm,
        tipo_entrega: 'total',
        latitude: -23.55,
        longitude: -46.63,
        updated_at: entregueEm,
    });
}

// Uma parcial e uma devolvida, para as duas telas de registro terem exemplo.
ENTREGAS.push({
    num_guia: numGuia++,
    cod_escola: '1005',
    id_genero: '4',
    id_dist: '10',
    id_motorista: 1,
    status: 'parcial',
    qtd_enviada: 200,
    qtd_entregue: 150,
    qtd_devolvida: 50,
    prioridade: 0,
    dt_previsao: AGORA - DIA,
    dt_entregue: AGORA - DIA,
    data_hora_entrega: AGORA - DIA,
    tipo_entrega: 'parcial',
    observacao: 'Escola sem espaço na câmara fria para o restante da carga.',
    latitude: -23.518,
    longitude: -46.671,
    updated_at: AGORA - DIA,
});

ENTREGAS.push({
    num_guia: numGuia++,
    cod_escola: '1006',
    id_genero: '3',
    id_dist: '12',
    id_motorista: 1,
    status: 'devolvido',
    qtd_enviada: 80,
    qtd_entregue: 0,
    qtd_devolvida: 80,
    prioridade: 1,
    dt_previsao: AGORA - 2 * DIA,
    dt_entregue: AGORA - 2 * DIA,
    data_hora_entrega: AGORA - 2 * DIA,
    tipo_entrega: 'devolucao',
    observacao: 'Escola fechada por reforma. Carga devolvida ao depósito.',
    updated_at: AGORA - 2 * DIA,
});

// Guias dos outros motoristas: garantem que o filtro por motorista tem o que
// esconder. Se o pull do carlos trouxer alguma delas, o filtro esta quebrado.
for (const idMotorista of [2, 3]) {
    for (let i = 0; i < 5; i += 1) {
        ENTREGAS.push({
            num_guia: numGuia++,
            cod_escola: ESCOLAS[(i + idMotorista) % ESCOLAS.length].cod_escola,
            id_genero: String((i % 5) + 1),
            id_dist: '11',
            id_motorista: idMotorista,
            status: 'pendente',
            qtd_enviada: 100 + i * 20,
            prioridade: 0,
            dt_previsao: AGORA + (i + 1) * DIA,
        });
    }
}

let lote = 1;
for (const entrega of ENTREGAS) {
    run(
        `INSERT INTO entregas (
             num_guia, of_numero, lote, status, observacao,
             qtd_enviada, qtd_entregue, qtd_devolvida,
             dt_previsao, dt_entregue, data_hora_entrega, dt_inicio_cronograma,
             cod_escola, id_genero, id_dist, id_motorista,
             latitude, longitude, tipo_entrega, prioridade,
             status_sincronizacao, created_at, updated_at
         ) VALUES (
             $num_guia, $of_numero, $lote, $status, $observacao,
             $qtd_enviada, $qtd_entregue, $qtd_devolvida,
             $dt_previsao, $dt_entregue, $data_hora_entrega, $dt_inicio_cronograma,
             $cod_escola, $id_genero, $id_dist, $id_motorista,
             $latitude, $longitude, $tipo_entrega, $prioridade,
             'sincronizado', $created_at, $updated_at
         )
         ON CONFLICT(num_guia) DO NOTHING`,
        {
            num_guia: entrega.num_guia,
            of_numero: `OF-${2600 + (lote % 40)}`,
            lote: `L${String(lote).padStart(3, '0')}`,
            status: entrega.status,
            observacao: entrega.observacao ?? null,
            qtd_enviada: entrega.qtd_enviada,
            qtd_entregue: entrega.qtd_entregue ?? null,
            qtd_devolvida: entrega.qtd_devolvida ?? null,
            dt_previsao: entrega.dt_previsao ?? null,
            dt_entregue: entrega.dt_entregue ?? null,
            data_hora_entrega: entrega.data_hora_entrega ?? null,
            dt_inicio_cronograma: entrega.dt_previsao ?? null,
            cod_escola: entrega.cod_escola,
            id_genero: entrega.id_genero,
            id_dist: entrega.id_dist,
            id_motorista: entrega.id_motorista,
            latitude: entrega.latitude ?? null,
            longitude: entrega.longitude ?? null,
            tipo_entrega: entrega.tipo_entrega ?? null,
            prioridade: entrega.prioridade ?? 0,
            created_at: AGORA - 30 * DIA,
            updated_at: entrega.updated_at ?? AGORA,
        },
    );
    lote += 1;
}

const total = get('SELECT COUNT(*) AS total FROM entregas');
const doCarlos = get("SELECT COUNT(*) AS total FROM entregas WHERE id_motorista = 1 AND status = 'pendente'");

console.log('');
console.log('  Banco populado com dados ficticios.');
console.log('');
console.log(`  Escolas ............ ${ESCOLAS.length}`);
console.log(`  Generos ............ ${GENEROS.length}`);
console.log(`  Motoristas ......... ${MOTORISTAS.length}`);
console.log(`  Guias no total ..... ${total.total}`);
console.log(`  Pendentes do carlos  ${doCarlos.total}`);
console.log('');
console.log('  Logins (a senha e a mesma para todos):');
for (const usuario of USUARIOS) {
    console.log(`    ${usuario.username.padEnd(8)} / ${SENHA_PADRAO}   ${usuario.nivel}`);
}
console.log('');
