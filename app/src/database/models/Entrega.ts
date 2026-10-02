import { Model } from '@nozbe/watermelondb';
import { field, date, readonly, text } from '@nozbe/watermelondb/decorators';

export default class Entrega extends Model {
    static table = 'entregas';

    // @ts-ignore
    @text('num_guia') num_guia!: string;
    // @ts-ignore
    @text('of_numero') of_numero!: string;
    // @ts-ignore
    @text('lote') lote!: string;
    // @ts-ignore
    @text('status') status!: string;
    // @ts-ignore
    @text('observacao') observacao?: string;
    // @ts-ignore
    @text('produto_enviado') produto_enviado!: string;

    // @ts-ignore
    @field('qtd_enviada') qtd_enviada!: number;
    // @ts-ignore
    @field('qtd_entregue') qtd_entregue?: number;
    // @ts-ignore
    @field('qtd_devolvida') qtd_devolvida?: number;

    // @ts-ignore
    @date('dt_validade') dt_validade?: Date;
    // @ts-ignore
    @date('dt_saida') dt_saida?: Date;
    // @ts-ignore
    @date('dt_entregue') dt_entregue?: Date;
    // @ts-ignore
    @field('dt_previsao') dt_previsao?: number;

    // @ts-ignore
    @text('foto') foto?: string;
    // @ts-ignore
    @text('foto_servidor') foto_servidor?: string;
    // @ts-ignore
    @text('foto_questionario') foto_questionario?: string;
    // @ts-ignore
    @text('foto_questionario_servidor') foto_questionario_servidor?: string;

    // @ts-ignore
    @field('cod_escola') cod_escola!: string;
    // @ts-ignore
    @field('id_genero') id_genero!: string;
    // @ts-ignore
    @field('id_dist') id_dist!: string;

    // Sync fields
    // @ts-ignore
    @field('latitude') latitude?: number;
    // @ts-ignore
    @field('longitude') longitude?: number;
    // @ts-ignore
    @date('data_hora_entrega') data_hora_entrega?: Date;
    // @ts-ignore
    @text('tipo_entrega') tipo_entrega?: string;
    // @ts-ignore
    @text('status_sincronizacao') status_sincronizacao!: string;
    // @ts-ignore
    @text('device_id') device_id?: string;
    // @ts-ignore
    @date('synced_at') synced_at?: Date;
    // @ts-ignore
    @field('prioridade') prioridade?: boolean;
    // @ts-ignore
    @field('emergencial') emergencial?: boolean;
    // @ts-ignore
    @date('data_prevista_fornecedor') data_prevista_fornecedor?: Date;
    // @ts-ignore
    @date('data_antecipacao') data_antecipacao?: Date;
    // @ts-ignore
    @date('data_prorrogacao') data_prorrogacao?: Date;
    // @ts-ignore
    @field('dt_inicio_cronograma') dt_inicio_cronograma?: number;
    // @ts-ignore
    @text('distribuicao_nome') distribuicao_nome?: string;
    // @ts-ignore
    @field('id_motorista') id_motorista?: number;
    // @ts-ignore
    @date('created_at_device') created_at_device!: Date;

    // @ts-ignore
    @readonly @date('created_at') createdAt!: Date;
    // @ts-ignore
    @readonly @date('updated_at') updatedAt!: Date;
}
