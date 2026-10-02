import { Database } from '@nozbe/watermelondb';
import { schema } from './schema';
import migrations from './migrations';
import Entrega from './models/Entrega';
import Escola from './models/Escola';
import Genero from './models/Genero';

let database: Database | null = null;

try {
    const SQLiteAdapter = require('@nozbe/watermelondb/adapters/sqlite').default;

    const adapter = new SQLiteAdapter({
        schema,
        migrations,
        dbName: 'rotaescolar_db',
        onSetUpError: (error: any) => {
            console.error('[DB] Erro ao inicializar banco de dados:', error);
        },
    });

    database = new Database({
        adapter,
        modelClasses: [Entrega, Escola, Genero],
    });

    console.log('[DB] WatermelonDB inicializado com sucesso (SQLiteAdapter)');
} catch (error) {
    console.error('[DB] Falha ao inicializar WatermelonDB nativo:', error);
    database = null;
}

export { database };
