import { classificarAtraso, isDevolucaoTotal, EntregaClassificavel, EntregaStatusValue } from './entregaAtraso';

type BadgeStatus = 'concluida' | 'parcial' | 'pendente' | 'sincronizado' | 'sincronizando' | 'erro' | 'warning' | 'error';

interface EntregaBadgeProps {
    label: string;
    status: BadgeStatus;
}

/**
 * Aceita tanto o status cru (compatibilidade com chamadas existentes) quanto
 * a entrega completa — quando a entrega completa é passada, também sinaliza
 * atraso e devolução total (badge vermelho 'erro'), reaproveitando a mesma
 * classificação usada na web (ver docs/34-TAG-ATRASO-ENTREGA-PROPOSTA.md).
 */
export function getEntregaBadgeProps(entrega: EntregaStatusValue | null | undefined | EntregaClassificavel): EntregaBadgeProps {
    const guia: EntregaClassificavel = typeof entrega === 'object' && entrega !== null ? entrega : { status: entrega };
    const status = guia.status;

    if (isDevolucaoTotal(guia)) {
        return { label: 'Devolução Total', status: 'erro' };
    }

    // "Em atraso" é o único caso ainda em aberto (pendente, prazo vencido) —
    // o único que justifica vermelho/urgência. As outras 3 variantes já
    // foram entregues, só tardiamente: mantêm a cor normal do status,
    // igual à web (ver docs/34-TAG-ATRASO-ENTREGA-PROPOSTA.md) — vermelho
    // ali assustaria à toa quem usa web e mobile no mesmo dia.
    const atraso = classificarAtraso(guia);
    if (atraso === 'em_atraso') {
        return { label: 'Em atraso', status: 'erro' };
    }
    if (atraso === 'concluida_atrasada') {
        return { label: 'Concluída (atraso)', status: 'concluida' };
    }
    if (atraso === 'parcial_atrasada') {
        return { label: 'Parcial (atraso)', status: 'parcial' };
    }
    if (atraso === 'aguardando_atrasada') {
        return { label: 'Aguardando Questionário (atraso)', status: 'warning' };
    }

    switch (status) {
        case 'concluida':
            return { label: 'Concluída', status: 'concluida' };
        case 'parcial':
            return { label: 'Parcial', status: 'parcial' };
        case 'pendente':
            return { label: 'Pendente', status: 'pendente' };
        case 'aguardando_questionario':
            return { label: 'Aguardando Questionário', status: 'warning' };
        // Cancelado é real (web pode cancelar uma guia — backend/routes/merenda.js)
        // e chega ao celular via sync; devolvido não é usado pelo backend hoje,
        // mas está incluído aqui pelo mesmo motivo do STATUS_NIVEL: nenhum dos
        // dois pode cair no default de 'Pendente', senão o motorista acha que
        // uma guia cancelada ainda está pendente de entrega.
        case 'cancelado':
            return { label: 'Cancelada', status: 'erro' };
        case 'devolvido':
            return { label: 'Devolvida', status: 'erro' };
        default:
            return { label: 'Pendente', status: 'pendente' };
    }
}
