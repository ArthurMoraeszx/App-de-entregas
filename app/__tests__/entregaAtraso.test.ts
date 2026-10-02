import { classificarAtraso, isAtrasada, isDevolucaoTotal } from '../src/utils/entregaAtraso';

// Espelha src/utils/entregaAtraso.test.ts (web) — mesmos casos, adaptados pros
// nomes de campo do mobile (dtPrevisao camelCase, sem necessidade de
// paraAtrasoClassificavel). Ver docs/34-TAG-ATRASO-ENTREGA-PROPOSTA.md.

describe('entregaAtraso (mobile)', () => {
    describe('classificarAtraso', () => {
        it('classifica pendente com prazo vencido como em_atraso', () => {
            expect(classificarAtraso({ status: 'pendente', dtPrevisao: '2020-01-01' })).toBe('em_atraso');
        });

        it('não classifica pendente com prazo futuro como atrasada', () => {
            const futuro = new Date();
            futuro.setFullYear(futuro.getFullYear() + 1);
            expect(classificarAtraso({ status: 'pendente', dtPrevisao: futuro.toISOString() })).toBeNull();
        });

        it('não classifica pendente sem prazo definido', () => {
            expect(classificarAtraso({ status: 'pendente' })).toBeNull();
        });

        it('usa data_prorrogacao antes de dtPrevisao (prazo vigente)', () => {
            const futuro = new Date();
            futuro.setFullYear(futuro.getFullYear() + 1);
            expect(
                classificarAtraso({
                    status: 'pendente',
                    dtPrevisao: '2020-01-01',
                    data_prorrogacao: futuro.toISOString(),
                }),
            ).toBeNull();
        });

        it('classifica concluída entregue depois do prazo como concluida_atrasada', () => {
            expect(
                classificarAtraso({
                    status: 'concluida',
                    dtPrevisao: '2024-01-01',
                    data_hora_entrega: '2024-01-10',
                }),
            ).toBe('concluida_atrasada');
        });

        it('não classifica concluída entregue dentro do prazo', () => {
            expect(
                classificarAtraso({
                    status: 'concluida',
                    dtPrevisao: '2024-01-10',
                    data_hora_entrega: '2024-01-05',
                }),
            ).toBeNull();
        });

        it('classifica parcial entregue com atraso como parcial_atrasada', () => {
            expect(
                classificarAtraso({
                    status: 'parcial',
                    dtPrevisao: '2024-01-01',
                    dt_entregue: '2024-01-05',
                }),
            ).toBe('parcial_atrasada');
        });

        it('classifica aguardando_questionario entregue com atraso como aguardando_atrasada', () => {
            expect(
                classificarAtraso({
                    status: 'aguardando_questionario',
                    dtPrevisao: '2024-01-01',
                    dt_entregue: '2024-01-05',
                }),
            ).toBe('aguardando_atrasada');
        });

        it('nunca classifica cancelado como atrasada', () => {
            expect(classificarAtraso({ status: 'cancelado', dtPrevisao: '2020-01-01' })).toBeNull();
        });

        it('não classifica concluída sem data real de entrega', () => {
            expect(classificarAtraso({ status: 'concluida', dtPrevisao: '2020-01-01' })).toBeNull();
        });

        it('isAtrasada é um atalho booleano equivalente', () => {
            expect(isAtrasada({ status: 'pendente', dtPrevisao: '2020-01-01' })).toBe(true);
            expect(isAtrasada({ status: 'concluida', dtPrevisao: '2024-01-10', data_hora_entrega: '2024-01-05' })).toBe(false);
        });

        it('aceita dt_previsao (snake_case, vindo direto do WatermelonDB) como alternativa a dtPrevisao', () => {
            expect(classificarAtraso({ status: 'pendente', dt_previsao: '2020-01-01' })).toBe('em_atraso');
        });
    });

    describe('isDevolucaoTotal', () => {
        it('é true para parcial com qtd_entregue explicitamente 0', () => {
            expect(isDevolucaoTotal({ status: 'parcial', qtd_entregue: 0 })).toBe(true);
        });

        it('é false para parcial com qtd_entregue positivo', () => {
            expect(isDevolucaoTotal({ status: 'parcial', qtd_entregue: 5 })).toBe(false);
        });

        it('nunca trata qtd_entregue nulo/ausente como devolução total (guia antiga)', () => {
            expect(isDevolucaoTotal({ status: 'parcial', qtd_entregue: null })).toBe(false);
            expect(isDevolucaoTotal({ status: 'parcial' })).toBe(false);
        });

        it('é false para qualquer status diferente de parcial', () => {
            expect(isDevolucaoTotal({ status: 'concluida', qtd_entregue: 0 })).toBe(false);
            expect(isDevolucaoTotal({ status: 'pendente', qtd_entregue: 0 })).toBe(false);
        });
    });
});
