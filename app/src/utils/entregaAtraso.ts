// Fonte única de verdade (mobile) para classificação de atraso e devolução
// total nas entregas de merenda. Ver docs/34-TAG-ATRASO-ENTREGA-PROPOSTA.md.
//
// Espelhado (não importado — não há monorepo/pacote compartilhado entre web
// e mobile) de src/utils/entregaAtraso.ts. Qualquer mudança de regra lá deve
// ser replicada aqui também.
//
// Campos aceitos em ambas as formas (string ISO, vindo do tipo `Entrega` de
// App.tsx usado na navegação, ou Date, vindo direto dos models WatermelonDB).

type DateLike = string | number | Date | null | undefined;

// Fonte única de verdade dos valores reais da coluna `status` de
// merenda.entregas — antes duplicado (e divergente) em App.tsx e
// syncService.ts; um definia 6 valores, o outro definia outros 7 (incluindo
// 3 que nunca são de fato gravados nessa coluna). Ver docs/29, seção sobre
// STATUS_NIVEL (31/07/2026) — o mesmo tipo de lacuna que deixou 'cancelado'
// de fora do STATUS_NIVEL também deixou 'cancelado'/'devolvido' de fora do
// badge do mobile, por não haver um único tipo compartilhado até agora.
export type EntregaStatusValue =
    | 'pendente'
    | 'aguardando_questionario'
    | 'parcial'
    | 'concluida'
    | 'devolvido'
    | 'cancelado';

export interface EntregaClassificavel {
    status?: EntregaStatusValue | null;
    // dtPrevisao (camelCase) vem do tipo `Entrega` de App.tsx (navegação);
    // dt_previsao (snake_case) vem direto dos models WatermelonDB
    // (mobile/src/database/models/Entrega.ts). Aceita os dois.
    dtPrevisao?: DateLike;
    dt_previsao?: DateLike;
    data_prorrogacao?: DateLike;
    data_antecipacao?: DateLike;
    data_hora_entrega?: DateLike;
    dt_entregue?: DateLike;
    qtd_entregue?: number | null;
}

export type AtrasoClassificacao =
    | 'em_atraso'
    | 'aguardando_atrasada'
    | 'parcial_atrasada'
    | 'concluida_atrasada';

const toDate = (value?: DateLike): Date | null => {
    if (value === null || value === undefined || value === '') return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
};

// Compara só a data (sem hora), igual ao CURRENT_DATE do Postgres.
const soData = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export function getPrazoVigente(guia: EntregaClassificavel): Date | null {
    return (
        toDate(guia.data_prorrogacao) ??
        toDate(guia.data_antecipacao) ??
        toDate(guia.dtPrevisao) ??
        toDate(guia.dt_previsao)
    );
}

export function getDataRealEntrega(guia: EntregaClassificavel): Date | null {
    // dt_entregue primeiro: em guias importadas/migradas em lote,
    // data_hora_entrega fica com o carimbo do momento da importação (não da
    // entrega real) — descoberto em teste em 30/07/2026. dt_entregue é o
    // campo confiável (espelha src/utils/entregaAtraso.ts na web).
    return toDate(guia.dt_entregue) ?? toDate(guia.data_hora_entrega);
}

export function classificarAtraso(guia: EntregaClassificavel): AtrasoClassificacao | null {
    const status = guia.status;
    if (!status || status === 'cancelado') return null;

    const prazoVigente = getPrazoVigente(guia);

    if (status === 'pendente') {
        if (prazoVigente && soData(prazoVigente) < soData(new Date())) {
            return 'em_atraso';
        }
        return null;
    }

    if (status === 'aguardando_questionario' || status === 'parcial' || status === 'concluida') {
        if (!prazoVigente) return null;
        const dataReal = getDataRealEntrega(guia);
        if (!dataReal) return null;
        if (soData(dataReal) > soData(prazoVigente)) {
            if (status === 'aguardando_questionario') return 'aguardando_atrasada';
            if (status === 'parcial') return 'parcial_atrasada';
            return 'concluida_atrasada';
        }
        return null;
    }

    return null;
}

export function isAtrasada(guia: EntregaClassificavel): boolean {
    return classificarAtraso(guia) !== null;
}

// status='parcial' com qtd_entregue explicitamente 0 (nunca null/ausente —
// guia antiga sem quantidade informada não é devolução total). Só decide
// algo quando qtd_entregue está disponível no objeto recebido.
export function isDevolucaoTotal(guia: EntregaClassificavel): boolean {
    if (guia.status !== 'parcial') return false;
    if (guia.qtd_entregue === null || guia.qtd_entregue === undefined) return false;
    return Number(guia.qtd_entregue) === 0;
}
