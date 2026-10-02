export type EntregaParcialInput = {
    quantidadeEntregue: string;
    qtdEnviada: number;
    selectedMotivo: string | null;
    observacoes: string;
};

export type ValidationError = {
    title: string;
    message: string;
};

/**
 * Valida os campos obrigatórios de uma entrega parcial.
 * Retorna o primeiro erro encontrado, ou null se tudo estiver válido.
 */
export function validateEntregaParcial(input: EntregaParcialInput): ValidationError | null {
    const { quantidadeEntregue, qtdEnviada, selectedMotivo, observacoes } = input;
    const qtdNum = Number(quantidadeEntregue);
    const qtdEnviadaNum = Number(qtdEnviada) || 0;

    if (quantidadeEntregue === '' || quantidadeEntregue === null || quantidadeEntregue === undefined
        || isNaN(qtdNum) || qtdNum < 0 || qtdNum > qtdEnviadaNum) {
        return {
            title: 'Atenção',
            message: `Informe uma quantidade entregue válida (de 0 a ${qtdEnviadaNum}). Use 0 para registrar devolução total.`,
        };
    }

    if (!selectedMotivo) {
        return {
            title: 'Atenção',
            message: 'Para entregas parciais, é obrigatório selecionar um motivo nas observações.',
        };
    }

    if (selectedMotivo === 'Outro' && !observacoes.trim()) {
        return {
            title: 'Atenção',
            message: 'Por favor, descreva o motivo nas observações.',
        };
    }

    return null;
}
