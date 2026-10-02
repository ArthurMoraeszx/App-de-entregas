import { Model } from '@nozbe/watermelondb';
import { text, readonly, date } from '@nozbe/watermelondb/decorators';

export default class Genero extends Model {
    static table = 'generos';

    // @ts-ignore
    @text('id_genero') id_genero!: string;
    // @ts-ignore
    @text('nome_genero') nome_genero!: string;

    // @ts-ignore
    @readonly @date('created_at') createdAt!: Date;
    // @ts-ignore
    @readonly @date('updated_at') updatedAt!: Date;
}
