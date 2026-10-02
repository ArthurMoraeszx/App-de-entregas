import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
    version: 11,
    tables: [
        tableSchema({
            name: 'entregas',
            columns: [
                { name: 'num_guia', type: 'string' },
                { name: 'of_numero', type: 'string' },
                { name: 'lote', type: 'string' },
                { name: 'status', type: 'string' },
                { name: 'observacao', type: 'string', isOptional: true },
                { name: 'produto_enviado', type: 'string' },
                { name: 'qtd_enviada', type: 'number' },
                { name: 'qtd_entregue', type: 'number', isOptional: true },
                { name: 'qtd_devolvida', type: 'number', isOptional: true },
                { name: 'dt_validade', type: 'number', isOptional: true },
                { name: 'dt_saida', type: 'number', isOptional: true },
                { name: 'dt_entregue', type: 'number', isOptional: true },
                { name: 'dt_previsao', type: 'number', isOptional: true },
                { name: 'dt_inicio_cronograma', type: 'number', isOptional: true },
                { name: 'foto', type: 'string', isOptional: true },
                { name: 'foto_servidor', type: 'string', isOptional: true },
                { name: 'foto_questionario', type: 'string', isOptional: true },
                { name: 'foto_questionario_servidor', type: 'string', isOptional: true },
                { name: 'cod_escola', type: 'string', isIndexed: true },
                { name: 'id_genero', type: 'string', isIndexed: true },
                { name: 'id_dist', type: 'string', isIndexed: true },
                { name: 'distribuicao_nome', type: 'string', isOptional: true },
                { name: 'latitude', type: 'number', isOptional: true },
                { name: 'longitude', type: 'number', isOptional: true },
                { name: 'data_hora_entrega', type: 'number', isOptional: true },
                { name: 'tipo_entrega', type: 'string', isOptional: true },
                { name: 'status_sincronizacao', type: 'string', isIndexed: true },
                { name: 'device_id', type: 'string', isOptional: true },
                { name: 'synced_at', type: 'number', isOptional: true },
                { name: 'prioridade', type: 'boolean', isOptional: true },
                { name: 'emergencial', type: 'boolean', isOptional: true },
                { name: 'data_prevista_fornecedor', type: 'number', isOptional: true },
                { name: 'data_antecipacao', type: 'number', isOptional: true },
                { name: 'data_prorrogacao', type: 'number', isOptional: true },
                { name: 'id_motorista', type: 'number', isOptional: true, isIndexed: true },
                { name: 'created_at_device', type: 'number', isOptional: true },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
            ],
        }),
        tableSchema({
            name: 'escolas',
            columns: [
                { name: 'cod_escola', type: 'string', isIndexed: true },
                { name: 'nome_escola', type: 'string' },
                { name: 'endereco', type: 'string', isOptional: true },
                { name: 'bairro', type: 'string', isOptional: true },
                { name: 'municipio', type: 'string', isOptional: true },
                { name: 'cep', type: 'string', isOptional: true },
                { name: 'gre', type: 'string', isOptional: true },
                // Coordenada da escola. É o destino da entrega — diferente da
                // latitude/longitude da tabela 'entregas', que é onde o motorista
                // estava no momento em que confirmou. Sem esta, uma guia ainda
                // pendente não tem nenhum ponto para mostrar no mapa.
                { name: 'latitude', type: 'number', isOptional: true },
                { name: 'longitude', type: 'number', isOptional: true },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
            ],
        }),
        tableSchema({
            name: 'generos',
            columns: [
                { name: 'id_genero', type: 'string', isIndexed: true },
                { name: 'nome_genero', type: 'string' },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
            ],
        }),
    ],
});
