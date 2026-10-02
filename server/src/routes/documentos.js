// ---------------------------------------------------------------------------
// Gera as guias de entrega em papel, para demonstracao.
//
//   GET /guias-modelo              indice com todas as guias pendentes
//   GET /guias-modelo/:num_guia    uma guia, pronta para imprimir/fotografar
//
// O motorista, na vida real, recebe esse documento impresso e fotografa no
// aplicativo. Aqui ele e montado com os dados que estao no banco, entao o que
// aparece no papel bate com o que aparece na tela do app.
// ---------------------------------------------------------------------------
import express from 'express';
import { all, get } from '../db.js';
import { asyncHandler } from '../utils/respond.js';

const router = express.Router();

/** Escapa texto antes de interpolar no HTML. */
function esc(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function dataBR(ms) {
    if (!ms) return '—';
    return new Date(Number(ms)).toLocaleDateString('pt-BR');
}

/**
 * Barras decorativas derivadas do numero da guia.
 *
 * Nao e um codigo de barras de verdade — e so um elemento visual para o
 * documento parecer um formulario impresso. Como a largura de cada barra sai
 * dos digitos do proprio numero, cada guia ganha um desenho diferente e
 * estavel, em vez de um borrao aleatorio que muda a cada refresh.
 */
function barras(numGuia) {
    const digitos = String(numGuia).padStart(8, '0').split('').map(Number);
    return digitos
        .flatMap((d) => [d % 3 + 1, 1])
        .map((largura, i) => `<i style="width:${largura * 2}px;background:${i % 2 ? 'transparent' : '#111'}"></i>`)
        .join('');
}

const ESTILO = `
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
        margin: 0;
        padding: 24px;
        background: #e8eaed;
        font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: #111;
    }
    .folha {
        width: 210mm;
        max-width: 100%;
        margin: 0 auto 24px;
        background: #fff;
        padding: 18mm 16mm;
        box-shadow: 0 2px 12px rgba(0,0,0,.18);
    }
    .cabecalho { display: flex; justify-content: space-between; align-items: flex-start;
        border-bottom: 3px solid #111; padding-bottom: 12px; }
    .orgao { font-size: 13px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
    .subtitulo { font-size: 11px; color: #555; margin-top: 2px; }
    .numero { text-align: right; }
    .numero span { display: block; font-size: 10px; text-transform: uppercase;
        letter-spacing: 1px; color: #555; }
    .numero strong { font-size: 26px; font-family: "Consolas", "Courier New", monospace; }
    h1 { font-size: 15px; text-transform: uppercase; letter-spacing: 2px;
        text-align: center; margin: 18px 0 14px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    th, td { border: 1px solid #999; padding: 7px 9px; font-size: 12px; vertical-align: top; }
    th { background: #f0f0f0; text-align: left; font-size: 9px; text-transform: uppercase;
        letter-spacing: .8px; color: #444; font-weight: 700; width: 26%; }
    td.valor-forte { font-weight: 700; font-size: 13px; }
    .destaque { background: #fafafa; }
    .quantia { font-family: "Consolas", "Courier New", monospace; font-size: 15px; font-weight: 700; }
    .tarja { margin: 14px 0; padding: 8px 10px; border: 2px solid #111;
        font-size: 11px; text-transform: uppercase; letter-spacing: 1px; text-align: center; font-weight: 700; }
    .assinaturas { display: flex; gap: 24px; margin-top: 34px; }
    .assinatura { flex: 1; border-top: 1px solid #111; padding-top: 5px;
        font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: #333; text-align: center; }
    .barras { display: flex; align-items: flex-end; height: 44px; margin-top: 22px; }
    .barras i { display: block; height: 100%; }
    .codigo { font-family: "Consolas", "Courier New", monospace; font-size: 12px;
        letter-spacing: 5px; text-align: center; margin-top: 4px; }
    .rodape { margin-top: 10px; font-size: 9px; color: #777; text-align: center;
        border-top: 1px dashed #bbb; padding-top: 7px; }
    .aviso { max-width: 210mm; margin: 0 auto 20px; padding: 14px 18px; background: #fff8dd;
        border-left: 5px solid #d9a400; font-size: 13px; line-height: 1.5; }
    .aviso strong { display: block; margin-bottom: 4px; }
    .indice { max-width: 210mm; margin: 0 auto; background: #fff; padding: 22px 26px;
        box-shadow: 0 2px 12px rgba(0,0,0,.18); }
    .indice h2 { margin: 0 0 4px; font-size: 20px; }
    .indice p { margin: 0 0 18px; color: #555; font-size: 13px; }
    .lista { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
    .item { display: block; border: 1px solid #ccc; border-radius: 6px; padding: 11px 13px;
        text-decoration: none; color: inherit; }
    .item:hover { border-color: #0F766E; background: #f3fbfa; }
    .item b { display: block; font-family: "Consolas", "Courier New", monospace; font-size: 17px; }
    .item span { display: block; font-size: 12px; color: #555; margin-top: 3px; }
    @media print {
        body { background: #fff; padding: 0; }
        .folha { box-shadow: none; margin: 0; page-break-after: always; }
        .aviso { display: none; }
    }
`;

function pagina(titulo, conteudo) {
    return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<style>${ESTILO}</style>
</head>
<body>${conteudo}</body>
</html>`;
}

function folhaDaGuia(guia) {
    const enderecoEscola = [guia.endereco, guia.bairro, guia.municipio]
        .filter(Boolean).join(', ');

    return `
<div class="folha">
    <div class="cabecalho">
        <div>
            <div class="orgao">Secretaria Municipal de Educação</div>
            <div class="subtitulo">Coordenadoria de Alimentação Escolar</div>
        </div>
        <div class="numero">
            <span>Guia nº</span>
            <strong>${esc(guia.num_guia)}</strong>
        </div>
    </div>

    <h1>Guia de Entrega de Gêneros Alimentícios</h1>

    <table>
        <tr>
            <th>Escola</th>
            <td class="valor-forte" colspan="3">${esc(guia.nome_escola)}</td>
        </tr>
        <tr>
            <th>Endereço</th>
            <td colspan="3">${esc(enderecoEscola || 'Não informado')}</td>
        </tr>
        <tr>
            <th>Código da escola</th>
            <td>${esc(guia.cod_escola)}</td>
            <th>Regional</th>
            <td>${esc(guia.gre || '—')}</td>
        </tr>
    </table>

    <table>
        <tr class="destaque">
            <th>Produto</th>
            <td class="valor-forte">${esc(guia.nome_genero)}</td>
            <th>Quantidade</th>
            <td class="quantia">${esc(guia.qtd_enviada)} kg</td>
        </tr>
        <tr>
            <th>Lote</th>
            <td>${esc(guia.lote)}</td>
            <th>Ordem de fornecimento</th>
            <td>${esc(guia.of_numero)}</td>
        </tr>
        <tr>
            <th>Distribuição</th>
            <td>${esc(guia.distribuicao_nome)}</td>
            <th>Entrega prevista</th>
            <td class="valor-forte">${dataBR(guia.dt_previsao)}</td>
        </tr>
        <tr>
            <th>Motorista</th>
            <td colspan="3">${esc(guia.motorista_nome || 'Não atribuído')}</td>
        </tr>
    </table>

    ${guia.prioridade ? '<div class="tarja">Entrega prioritária</div>' : ''}

    <div class="assinaturas">
        <div class="assinatura">Assinatura do motorista</div>
        <div class="assinatura">Recebido por (nome legível)</div>
        <div class="assinatura">Data do recebimento</div>
    </div>

    <div class="barras">${barras(guia.num_guia)}</div>
    <div class="codigo">${esc(guia.num_guia)}</div>

    <div class="rodape">
        Documento fictício, gerado para demonstração do aplicativo Rota Escolar.
        Não possui validade fiscal ou administrativa.
    </div>
</div>`;
}

const SELECT_GUIA = `
    SELECT e.num_guia, e.of_numero, e.lote, e.qtd_enviada, e.dt_previsao, e.prioridade,
           e.cod_escola, e.status,
           s.nome_escola, s.endereco, s.bairro, s.municipio, s.gre,
           g.nome_genero,
           d.nome AS distribuicao_nome,
           m.nome AS motorista_nome
      FROM entregas e
      JOIN escolas       s ON s.cod_escola = e.cod_escola
      JOIN generos       g ON g.id_genero  = e.id_genero
      JOIN distribuicoes d ON d.id_dist    = e.id_dist
 LEFT JOIN motoristas    m ON m.id_motorista = e.id_motorista
`;

// Indice
router.get('/', asyncHandler(async (req, res) => {
    const guias = all(`${SELECT_GUIA} WHERE e.status = 'pendente' ORDER BY e.id_motorista, e.num_guia`);

    const itens = guias.map((guia) => `
        <a class="item" href="/guias-modelo/${esc(guia.num_guia)}">
            <b>${esc(guia.num_guia)}</b>
            <span>${esc(guia.nome_genero)} · ${esc(guia.qtd_enviada)} kg</span>
            <span>${esc(guia.nome_escola)}</span>
            <span>${esc(guia.motorista_nome || 'sem motorista')}</span>
        </a>`).join('');

    return res.type('html').send(pagina('Guias de entrega — modelos', `
        <div class="aviso">
            <strong>Como usar na demonstração</strong>
            Abra uma guia, deixe-a na tela (ou imprima) e fotografe pelo aplicativo na etapa
            de registro da entrega. Os dados do papel são os mesmos que estão no banco, então
            o número da guia no documento corresponde ao da lista no aplicativo.
        </div>
        <div class="indice">
            <h2>Guias de entrega pendentes</h2>
            <p>${guias.length} documento(s) disponível(is). Clique para abrir em tamanho de impressão.</p>
            <div class="lista">${itens || '<p>Nenhuma guia pendente. Rode <code>npm run seed:reset</code>.</p>'}</div>
        </div>`));
}));

// Uma guia especifica
router.get('/:num_guia', asyncHandler(async (req, res) => {
    const numGuia = Number.parseInt(req.params.num_guia, 10);
    if (!Number.isFinite(numGuia)) {
        return res.status(400).type('html').send(pagina('Guia inválida', '<div class="aviso">Número de guia inválido.</div>'));
    }

    const guia = get(`${SELECT_GUIA} WHERE e.num_guia = $num_guia`, { num_guia: numGuia });
    if (!guia) {
        return res.status(404).type('html').send(pagina('Guia não encontrada', `
            <div class="aviso">Guia ${esc(numGuia)} não existe no banco. <a href="/guias-modelo">Ver a lista</a>.</div>`));
    }

    return res.type('html').send(pagina(`Guia ${guia.num_guia}`, `
        <div class="aviso">
            <strong>Guia ${esc(guia.num_guia)}</strong>
            Deixe esta página aberta e fotografe pelo aplicativo, ou use Ctrl+P para imprimir.
            <a href="/guias-modelo">Voltar à lista</a>.
        </div>
        ${folhaDaGuia(guia)}`));
}));

export default router;
