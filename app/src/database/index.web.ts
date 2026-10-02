import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { schema } from './schema';
import migrations from './migrations';
import Entrega from './models/Entrega';
import Escola from './models/Escola';
import Genero from './models/Genero';

// Adapter para Web (LokiJS salva em memória/indexeddb)
const adapter = new LokiJSAdapter({
    schema,
    // Sem isto, o adapter é criado sem suporte a migrações e o ciclo de
    // sincronização morre logo na entrada com "Migration syncs cannot be enabled
    // on a database that does not support migrations" — porque syncService.ts
    // chama synchronize() com migrationsEnabledAtVersion: 1.
    //
    // O adapter nativo (index.native.ts) sempre passou `migrations`; este aqui
    // não, e ninguém notou porque o sync era desligado na web.
    migrations,
    useWebWorker: false, // Web Workers podem ser chatos em dev
    useIncrementalIndexedDB: true,
    dbName: 'rotaescolar_db',
    // Configurações de logging opcionais
    onSetUpError: error => {
        console.error('❌ Erro no banco web:', error);
    }
});

export const database = new Database({
    adapter,
    modelClasses: [Entrega, Escola, Genero],
});
