import { schemaMigrations, addColumns } from '@nozbe/watermelondb/Schema/migrations';

export default schemaMigrations({
    migrations: [
        {
            toVersion: 2,
            steps: [
                // Migração para adicionar campos de timestamp e geolocalização se não existirem
                addColumns({
                    table: 'entregas',
                    columns: [
                        { name: 'created_at', type: 'number' },
                        { name: 'updated_at', type: 'number' },
                        { name: 'latitude', type: 'number', isOptional: true },
                        { name: 'longitude', type: 'number', isOptional: true },
                        { name: 'data_hora_entrega', type: 'number', isOptional: true },
                        { name: 'tipo_entrega', type: 'string', isOptional: true },
                        { name: 'status_sincronizacao', type: 'string', isIndexed: true },
                        { name: 'device_id', type: 'string', isOptional: true },
                        { name: 'synced_at', type: 'number', isOptional: true },
                        { name: 'created_at_device', type: 'number' },
                    ],
                }),
                addColumns({
                    table: 'escolas',
                    columns: [
                        { name: 'latitude', type: 'number', isOptional: true },
                        { name: 'longitude', type: 'number', isOptional: true },
                    ]
                })
            ],
        },
        {
            toVersion: 3,
            steps: [
                addColumns({
                    table: 'escolas',
                    columns: [
                        { name: 'bairro', type: 'string', isOptional: true },
                        { name: 'created_at', type: 'number' },
                        { name: 'updated_at', type: 'number' },
                    ],
                }),
                addColumns({
                    table: 'generos',
                    columns: [
                        { name: 'created_at', type: 'number' },
                        { name: 'updated_at', type: 'number' },
                    ],
                }),
            ],
        },
        {
            toVersion: 4,
            steps: [
                addColumns({
                    table: 'escolas',
                    columns: [
                        { name: 'cep', type: 'string', isOptional: true },
                    ],
                }),
            ],
        },
        {
            toVersion: 5,
            steps: [
                // Versão 5 apenas remove as colunas latitude/longitude do modelo.
                // No SQLite elas continuarão existindo mas serão ignoradas pelo WatermelonDB.
            ],
        },
        {
            toVersion: 6,
            steps: [
                // Separa foto_local (URI no dispositivo) de foto_servidor (caminho no servidor).
                // Isso evita que o WatermelonDB detecte mudança no campo foto a cada sync
                // (o servidor retorna um caminho diferente do URI local), o que causava
                // _status = 'updated' e reenvio da foto em toda sincronização.
                addColumns({
                    table: 'entregas',
                    columns: [
                        { name: 'foto_servidor', type: 'string', isOptional: true },
                    ],
                }),
            ],
        },
        {
            toVersion: 7,
            steps: [
                addColumns({
                    table: 'entregas',
                    columns: [
                        { name: 'prioridade', type: 'boolean', isOptional: true },
                        { name: 'emergencial', type: 'boolean', isOptional: true },
                        { name: 'data_prevista_fornecedor', type: 'number', isOptional: true },
                        { name: 'data_antecipacao', type: 'number', isOptional: true },
                        { name: 'data_prorrogacao', type: 'number', isOptional: true },
                    ],
                }),
            ],
        },
        {
            toVersion: 8,
            steps: [
                addColumns({
                    table: 'entregas',
                    columns: [
                        { name: 'dt_inicio_cronograma', type: 'number', isOptional: true },
                        { name: 'distribuicao_nome', type: 'string', isOptional: true },
                    ],
                }),
            ],
        },
        {
            toVersion: 9,
            steps: [
                addColumns({
                    table: 'entregas',
                    columns: [
                        { name: 'id_motorista', type: 'number', isOptional: true },
                    ],
                }),
            ],
        },
        {
            toVersion: 10,
            steps: [
                addColumns({
                    table: 'entregas',
                    columns: [
                        { name: 'foto_questionario', type: 'string', isOptional: true },
                        { name: 'foto_questionario_servidor', type: 'string', isOptional: true },
                    ],
                }),
            ],
        },
        {
            toVersion: 11,
            steps: [
                // Devolve latitude/longitude às escolas. A versão 2 chegou a criá-las
                // e a 5 as retirou do modelo; agora voltam com um uso claro: mostrar
                // no mapa o destino de uma guia que ainda não foi entregue.
                //
                // Até aqui o mapa dependia da coordenada que o motorista grava no
                // momento da confirmação — ou seja, guia pendente, que é justamente
                // a que ele precisa localizar, não tinha nada para exibir.
                addColumns({
                    table: 'escolas',
                    columns: [
                        { name: 'latitude', type: 'number', isOptional: true },
                        { name: 'longitude', type: 'number', isOptional: true },
                    ],
                }),
            ],
        },
    ],
});
