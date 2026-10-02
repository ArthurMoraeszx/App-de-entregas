import { isUriLocal } from './fotoUri';

export type FotoRow = {
    foto?: string | null;
    foto_servidor?: string | null;
    foto_questionario?: string | null;
    foto_questionario_servidor?: string | null;
    num_guia?: string;
};

// Prepara os campos de foto de uma guia para o payload do push WatermelonDB.
//
// Prioridade:
//   1. Campo já tem caminho de servidor ('guias/...') → usa como está.
//   2. Campo tem URI local com foto_servidor confirmada → substitui pelo caminho do servidor.
//   3. Campo tem URI local SEM foto_servidor → envia null.
//      O backend usa COALESCE: foto existente no servidor não é apagada.
//      A foto será enviada separadamente pelo uploadPendingPhotos.
//   4. Campo é null mas foto_servidor está setado (ex: pull limpou o campo depois do upload) →
//      usa foto_servidor para que o push inclua o caminho correto.
//      ATENÇÃO: foto_servidor só deve estar setado por uploadPendingPhotos desta sessão.
//      Paths vindos de backup SafeStorage devem ser excluídos no ponto de restauração
//      (ver pullChanges em syncService.ts), não aqui.
//
// Base64 foi removida: o payload de push deve ser sempre leve.
function processCampo(
    row: FotoRow,
    campo: 'foto' | 'foto_questionario',
    campoServidor: 'foto_servidor' | 'foto_questionario_servidor',
): void {
    const valor = row[campo];

    // Campo vazio: se há caminho de servidor conhecido, usa-o.
    // Isso cobre o caso onde o pull limpou o campo com o valor null do servidor
    // depois que uploadPendingPhotos já havia setado foto_servidor nesta sessão.
    if (!valor) {
        if (row[campoServidor]) row[campo] = row[campoServidor]!;
        return;
    }

    // Já é caminho de servidor — nada a fazer.
    // A lista de prefixos locais vive em utils/fotoUri. Se 'data:' e 'blob:'
    // ficarem de fora, uma foto tirada pela webcam passa por aqui como se já
    // fosse caminho do servidor, e o base64 inteiro entra no payload do push.
    if (!isUriLocal(valor)) return;

    // URI local: usa caminho do servidor se pré-upload já confirmou
    if (row[campoServidor]) {
        row[campo] = row[campoServidor]!;
        return;
    }

    // URI local sem confirmação de upload → null.
    row[campo] = null;
}

export function processRowFoto(row: FotoRow): void {
    processCampo(row, 'foto', 'foto_servidor');
    processCampo(row, 'foto_questionario', 'foto_questionario_servidor');
}
