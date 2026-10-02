import { Model } from '@nozbe/watermelondb';
import { text, field, readonly, date } from '@nozbe/watermelondb/decorators';

export default class Escola extends Model {
    static table = 'escolas';

    // @ts-ignore
    @text('cod_escola') cod_escola!: string;
    // @ts-ignore
    @text('nome_escola') nome_escola!: string;
    // @ts-ignore
    @text('endereco') endereco?: string;
    // @ts-ignore
    @text('bairro') bairro?: string;
    // @ts-ignore
    @text('municipio') municipio?: string;
    // @ts-ignore
    @text('cep') cep?: string;
    // @ts-ignore
    @text('gre') gre?: string;

    // Coordenada da escola — o destino da entrega. Não confundir com a
    // latitude/longitude de Entrega, que é onde o motorista estava ao confirmar.
    // @ts-ignore
    @field('latitude') latitude?: number;
    // @ts-ignore
    @field('longitude') longitude?: number;

    // @ts-ignore
    @readonly @date('created_at') createdAt!: Date;
    // @ts-ignore
    @readonly @date('updated_at') updatedAt!: Date;
}
