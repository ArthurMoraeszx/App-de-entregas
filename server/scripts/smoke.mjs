// Exercita o fluxo completo do app contra a API, na mesma ordem que o app faz.
const BASE = 'http://localhost:3001/api';

let falhas = 0;

function checar(nome, condicao, detalhe = '') {
    if (condicao) {
        console.log(`  ok    ${nome}`);
    } else {
        falhas += 1;
        console.log(`  FALHA ${nome} ${detalhe}`);
    }
}

async function req(metodo, rota, { token, body, form } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers['Content-Type'] = 'application/json';

    const resposta = await fetch(`${BASE}${rota}`, {
        method: metodo,
        headers,
        body: form ?? (body ? JSON.stringify(body) : undefined),
    });
    let json = null;
    try { json = await resposta.json(); } catch { /* resposta sem corpo */ }
    return { status: resposta.status, json };
}

console.log('\n1. health');
const health = await req('GET', '/health');
checar('GET /health responde 200', health.status === 200, `(veio ${health.status})`);

console.log('\n2. login');
const senhaErrada = await req('POST', '/mobile/login', { body: { username: 'carlos', senha: 'errada' } });
checar('senha errada devolve 401', senhaErrada.status === 401, `(veio ${senhaErrada.status})`);

const login = await req('POST', '/mobile/login', { body: { username: 'CARLOS', senha: '123456' } });
checar('login aceita username em maiuscula', login.status === 200, `(veio ${login.status})`);
checar('resposta tem envelope data', !!login.json?.data);
const { token, refreshToken, user } = login.json?.data ?? {};
checar('veio token', !!token);
checar('veio refreshToken', !!refreshToken);
checar('user.id_motorista = 1', user?.id_motorista === 1, `(veio ${user?.id_motorista})`);

console.log('\n3. me');
const semToken = await req('GET', '/mobile/me');
checar('sem token devolve 401', semToken.status === 401, `(veio ${semToken.status})`);
const me = await req('GET', '/mobile/me', { token });
checar('GET /me devolve id_motorista', me.json?.data?.id_motorista === 1);

console.log('\n4. refresh');
const refresh = await req('POST', '/mobile/refresh', { body: { refreshToken } });
checar('refresh devolve token novo', !!refresh.json?.data?.token);

console.log('\n5. sync/pull (primeira sincronizacao)');
const pull = await req('GET', '/mobile/sync/pull?last_pulled_at=0&local_count=0', { token });
const mudancas = pull.json?.data?.changes;
checar('pull responde 200', pull.status === 200, `(veio ${pull.status})`);
checar('traz escolas na primeira sync', mudancas?.escolas?.updated?.length === 8,
    `(veio ${mudancas?.escolas?.updated?.length})`);
checar('traz generos na primeira sync', mudancas?.generos?.updated?.length === 5,
    `(veio ${mudancas?.generos?.updated?.length})`);
checar('created vazio (app usa sendCreatedAsUpdated)', mudancas?.entregas?.created?.length === 0);
checar('veio timestamp', typeof pull.json?.data?.timestamp === 'number');

// Sem a coordenada da escola, uma guia ainda pendente nao tem ponto nenhum para
// mostrar no mapa: a lat/long da propria entrega so nasce quando o motorista
// confirma. E o campo some com facilidade, porque escolas nao viajam em toda sync.
const escolasComCoord = (mudancas?.escolas?.updated ?? [])
    .filter((e) => typeof e.latitude === 'number' && typeof e.longitude === 'number');
checar('escolas trazem latitude e longitude', escolasComCoord.length === 8,
    `(${escolasComCoord.length} de ${mudancas?.escolas?.updated?.length} com coordenada)`);

const entregas = mudancas?.entregas?.updated ?? [];
checar('traz as 16 guias do carlos', entregas.length === 16, `(veio ${entregas.length})`);
checar('nenhuma guia de outro motorista', entregas.every((e) => e.id_motorista === 1));

const guia = entregas.find((e) => e.status === 'pendente');
checar('id do registro = num_guia em string', guia?.id === String(guia?.num_guia));
checar('produto_enviado veio do JOIN com generos', !!guia?.produto_enviado);
checar('prioridade e booleano', typeof guia?.prioridade === 'boolean',
    `(veio ${typeof guia?.prioridade})`);
checar('dt_previsao e number (epoch ms)', typeof guia?.dt_previsao === 'number');
checar('distribuicao_nome veio do JOIN', !!guia?.distribuicao_nome);

console.log('\n6. sync/pull (incremental)');
const agora = Date.now();
const incremental = await req('GET', `/mobile/sync/pull?last_pulled_at=${agora}&local_count=16`, { token });
checar('incremental nao traz nada novo',
    incremental.json?.data?.changes?.entregas?.updated?.length === 0);
checar('incremental nao reenvia escolas',
    incremental.json?.data?.changes?.escolas?.updated?.length === 0);

// ...mas reenvia quando o app avisa que migrou o esquema. Sem isso, uma coluna
// nova em escolas nasceria vazia e ficaria vazia para sempre — em silencio,
// porque escolas so viajam na primeira sync e o aparelho ja fez a dele.
const migracao = encodeURIComponent(JSON.stringify({ from: 10, tables: [], columns: [{ table: 'escolas', columns: ['latitude', 'longitude'] }] }));
const posMigracao = await req('GET',
    `/mobile/sync/pull?last_pulled_at=${agora}&local_count=16&migration=${migracao}`, { token });
checar('pull apos migracao reenvia escolas',
    posMigracao.json?.data?.changes?.escolas?.updated?.length === 8,
    `(veio ${posMigracao.json?.data?.changes?.escolas?.updated?.length})`);
checar('migration malformado nao derruba a sync', (await req('GET',
    `/mobile/sync/pull?last_pulled_at=${agora}&local_count=16&migration=%7Bquebrado`, { token })).status === 200);

// Uma correcao no cadastro de escolas precisa chegar a quem ja sincronizou.
// Antes da coluna atualizado_em, escolas so viajavam na primeira sync: corrigir
// um endereco no servidor nao mudava nada no aparelho, e sem nenhum erro.
const desdeOntem = Date.now() - 24 * 60 * 60 * 1000;
const cadastroMudou = await req('GET',
    `/mobile/sync/pull?last_pulled_at=${desdeOntem}&local_count=16`, { token });
checar('escola alterada chega em pull incremental',
    cadastroMudou.json?.data?.changes?.escolas?.updated?.length === 8,
    `(veio ${cadastroMudou.json?.data?.changes?.escolas?.updated?.length})`);
checar('genero alterado chega em pull incremental',
    cadastroMudou.json?.data?.changes?.generos?.updated?.length === 5,
    `(veio ${cadastroMudou.json?.data?.changes?.generos?.updated?.length})`);

console.log('\n7. guias/:num_guia');
const buscaOk = await req('GET', `/mobile/guias/${guia.num_guia}`, { token });
checar('acha guia do proprio motorista', buscaOk.json?.data?.num_guia === guia.num_guia);
const buscaInexistente = await req('GET', '/mobile/guias/99999', { token });
checar('guia inexistente devolve 404', buscaInexistente.status === 404, `(veio ${buscaInexistente.status})`);

// Guia da rita: o carlos nao pode enxergar.
const loginRita = await req('POST', '/mobile/login', { body: { username: 'rita', senha: '123456' } });
const pullRita = await req('GET', '/mobile/sync/pull?last_pulled_at=0&local_count=0',
    { token: loginRita.json.data.token });
const guiaDaRita = pullRita.json.data.changes.entregas.updated[0];
const buscaAlheia = await req('GET', `/mobile/guias/${guiaDaRita.num_guia}`, { token });
checar('guia de outro motorista devolve 404', buscaAlheia.status === 404, `(veio ${buscaAlheia.status})`);

console.log('\n8. fotos/upload');
// PNG 1x1 valido, so para ter bytes reais no multipart.
const pngMinimo = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
);
const form = new FormData();
form.append('foto', new Blob([pngMinimo], { type: 'image/jpeg' }), `${guia.num_guia}_guia.jpg`);
form.append('num_guia', String(guia.num_guia));
form.append('tipo', 'guia');
form.append('device_id', 'teste-automatizado');

const upload = await req('POST', '/mobile/fotos/upload', { token, form });
const caminho = upload.json?.data?.caminho;
checar('upload responde 200', upload.status === 200, `(veio ${upload.status})`);
checar('devolve caminho com prefixo guias/', caminho?.startsWith('guias/'), `(veio ${caminho})`);

const arquivoServido = await fetch(`http://localhost:3001/uploads/${caminho}`);
checar('foto fica acessivel em /uploads', arquivoServido.status === 200, `(veio ${arquivoServido.status})`);

console.log('\n9. sync/push');
const entregueEm = Date.now();
const push = await req('POST', '/mobile/sync/push', {
    token,
    body: {
        changes: {
            entregas: {
                created: [],
                deleted: [],
                updated: [{
                    id: String(guia.num_guia),
                    num_guia: String(guia.num_guia),
                    status: 'concluida',
                    qtd_entregue: guia.qtd_enviada,
                    qtd_devolvida: 0,
                    data_hora_entrega: entregueEm,
                    latitude: -23.55,
                    longitude: -46.63,
                    tipo_entrega: 'total',
                    observacao: 'Entrega registrada pelo teste automatizado.',
                    // URI local sem upload confirmado: o servidor deve ignorar e
                    // preservar a foto que o upload da etapa 8 ja gravou.
                    foto: 'file:///celular/cache/foto.jpg',
                    foto_servidor: null,
                }],
            },
        },
        last_pulled_at: agora,
    },
});
checar('push responde 200', push.status === 200, `(veio ${push.status})`);
checar('nenhuma guia rejeitada', push.json?.data?.failed_guias?.length === 0,
    `(rejeitadas: ${JSON.stringify(push.json?.data?.failed_guias)})`);

const depois = await req('GET', `/mobile/guias/${guia.num_guia}`, { token });
const gravada = depois.json?.data;
checar('status virou concluida', gravada?.status === 'concluida', `(veio ${gravada?.status})`);
checar('qtd_entregue gravada', gravada?.qtd_entregue === guia.qtd_enviada);
checar('GPS gravado', gravada?.latitude === -23.55);
checar('data_hora_entrega gravada', gravada?.data_hora_entrega === entregueEm);
checar('URI local NAO sobrescreveu a foto do servidor', gravada?.foto === caminho,
    `(veio ${gravada?.foto})`);

console.log('\n10. push de guia alheia');
const pushAlheio = await req('POST', '/mobile/sync/push', {
    token,
    body: {
        changes: {
            entregas: {
                created: [], deleted: [],
                updated: [{ id: String(guiaDaRita.num_guia), num_guia: String(guiaDaRita.num_guia), status: 'concluida' }],
            },
        },
    },
});
checar('guia de outro motorista volta em failed_guias',
    pushAlheio.json?.data?.failed_guias?.includes(String(guiaDaRita.num_guia)),
    `(veio ${JSON.stringify(pushAlheio.json?.data?.failed_guias)})`);

console.log('\n11. diagnostics');
const diag = await req('POST', '/mobile/diagnostics', {
    body: { device_id: 'teste', app_version: '1.0.0', events: [{ error_type: 'network', error_code: 'ECONNABORTED', context: 'auto_sync', occurred_at: Date.now() }] },
});
checar('aceita sem token', diag.status === 200, `(veio ${diag.status})`);

console.log('\n12. token de push');
const pushToken = await req('POST', '/mobile/token', {
    token, body: { usuario_id: user.id, pushToken: 'ExponentPushToken[teste123]' },
});
checar('registra token', pushToken.status === 200, `(veio ${pushToken.status})`);
const reenvio = await req('POST', '/mobile/token', {
    token, body: { usuario_id: user.id, pushToken: 'ExponentPushToken[teste123]' },
});
checar('reenviar o mesmo token nao quebra', reenvio.status === 200, `(veio ${reenvio.status})`);

console.log('\n13. update-profile');
const perfilSenhaErrada = await req('PUT', '/auth/update-profile', {
    token, body: { email: 'x@y.com', nomeCompleto: 'X', senhaAtual: 'errada' },
});
checar('senha atual errada devolve 401', perfilSenhaErrada.status === 401, `(veio ${perfilSenhaErrada.status})`);

const perfil = await req('PUT', '/auth/update-profile', {
    token, body: { email: 'carlos.novo@exemplo.com', nomeCompleto: 'Carlos A. Andrade', senhaAtual: '123456' },
});
checar('atualiza perfil', perfil.json?.data?.user?.email === 'carlos.novo@exemplo.com',
    `(veio ${perfil.json?.data?.user?.email})`);

console.log('\n14. rota inexistente');
const inexistente = await req('GET', '/mobile/naoexiste');
checar('devolve 404 em JSON', inexistente.status === 404 && inexistente.json?.success === false);

console.log(`\n${'='.repeat(50)}`);
console.log(falhas === 0 ? 'TODOS OS TESTES PASSARAM' : `${falhas} TESTE(S) FALHARAM`);
console.log('='.repeat(50));
process.exit(falhas === 0 ? 0 : 1);
