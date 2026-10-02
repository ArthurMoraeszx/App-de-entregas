beforeEach(() => {
    jest.resetModules();
});

const getModule = () => require('../src/utils/entregaValidation');

const base = {
    quantidadeEntregue: '5',
    qtdEnviada: 10,
    selectedMotivo: 'Falta de espaço de armazenamento',
    observacoes: '',
};

describe('validateEntregaParcial — quantidade', () => {
    it('retorna null para entrada completamente válida', () => {
        const { validateEntregaParcial } = getModule();
        expect(validateEntregaParcial(base)).toBeNull();
    });

    it('aceita quantidade zero (devolução total)', () => {
        const { validateEntregaParcial } = getModule();
        // 0 é válido: representa devolução total sem entrega parcial
        const err = validateEntregaParcial({ ...base, quantidadeEntregue: '0' });
        expect(err).toBeNull();
    });

    it('rejeita quantidade negativa', () => {
        const { validateEntregaParcial } = getModule();
        expect(validateEntregaParcial({ ...base, quantidadeEntregue: '-1' })).not.toBeNull();
    });

    it('rejeita quantidade maior que a enviada', () => {
        const { validateEntregaParcial } = getModule();
        expect(validateEntregaParcial({ ...base, quantidadeEntregue: '11' })).not.toBeNull();
    });

    it('aceita quantidade igual à enviada', () => {
        const { validateEntregaParcial } = getModule();
        expect(validateEntregaParcial({ ...base, quantidadeEntregue: '10' })).toBeNull();
    });

    it('rejeita campo de quantidade vazio', () => {
        const { validateEntregaParcial } = getModule();
        expect(validateEntregaParcial({ ...base, quantidadeEntregue: '' })).not.toBeNull();
    });

    it('rejeita valor não numérico', () => {
        const { validateEntregaParcial } = getModule();
        expect(validateEntregaParcial({ ...base, quantidadeEntregue: 'abc' })).not.toBeNull();
    });

    it('aceita valor decimal válido dentro do intervalo', () => {
        const { validateEntregaParcial } = getModule();
        // "5.5" é > 0 e <= 10 — aceito; servidor arredondará se necessário
        expect(validateEntregaParcial({ ...base, quantidadeEntregue: '5.5' })).toBeNull();
    });
});

describe('validateEntregaParcial — motivo', () => {
    it('rejeita quando motivo não selecionado', () => {
        const { validateEntregaParcial } = getModule();
        const err = validateEntregaParcial({ ...base, selectedMotivo: null });
        expect(err).not.toBeNull();
        expect(err?.message).toContain('motivo');
    });

    it('aceita motivo padrão sem texto de observações', () => {
        const { validateEntregaParcial } = getModule();
        expect(validateEntregaParcial(base)).toBeNull();
    });

    it('rejeita motivo "Outro" com observações vazias', () => {
        const { validateEntregaParcial } = getModule();
        const err = validateEntregaParcial({ ...base, selectedMotivo: 'Outro', observacoes: '' });
        expect(err).not.toBeNull();
        expect(err?.message).toContain('motivo');
    });

    it('rejeita motivo "Outro" com observações só de espaços', () => {
        const { validateEntregaParcial } = getModule();
        expect(
            validateEntregaParcial({ ...base, selectedMotivo: 'Outro', observacoes: '   ' })
        ).not.toBeNull();
    });

    it('aceita motivo "Outro" com observações preenchidas', () => {
        const { validateEntregaParcial } = getModule();
        expect(
            validateEntregaParcial({ ...base, selectedMotivo: 'Outro', observacoes: 'Escola fechada' })
        ).toBeNull();
    });
});

describe('validateEntregaParcial — ordem de validação', () => {
    it('reporta erro de motivo quando quantidade é 0 (válida) mas motivo não selecionado', () => {
        const { validateEntregaParcial } = getModule();
        // 0 é válido para quantidade; a validação prossegue para motivo
        const err = validateEntregaParcial({ ...base, quantidadeEntregue: '0', selectedMotivo: null });
        expect(err).not.toBeNull();
        expect(err?.message).toContain('motivo');
    });
});
