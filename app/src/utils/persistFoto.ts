import * as FileSystem from 'expo-file-system/legacy';

/**
 * Copia a foto do diretório temporário (cache) para o documentDirectory,
 * que persiste entre reinicializações do app e não é apagado pelo sistema
 * nem pela limpeza de cache do Android.
 *
 * Retorna o URI persistente se a cópia for bem-sucedida, ou o URI original
 * como fallback (sem lançar exceção).
 */
export async function persistFotoUri(
    uri: string,
    numGuia: string | number,
    tipo: 'guia' | 'questionario',
): Promise<string> {
    if (!uri) return uri;
    // URI já está no documentDirectory — não precisa copiar novamente
    if (FileSystem.documentDirectory && uri.startsWith(FileSystem.documentDirectory)) return uri;
    try {
        const dir = `${FileSystem.documentDirectory}merenda_fotos/`;
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        const prefix = `${numGuia}_${tipo}_`;
        const dest = `${dir}${prefix}${Date.now()}.jpg`;
        await FileSystem.copyAsync({ from: uri, to: dest });

        // Apaga versões anteriores desta guia/tipo APÓS criar o novo arquivo.
        // Deletar antes criaria janela de risco para uploads em andamento.
        FileSystem.readDirectoryAsync(dir).then(files => {
            const deletes = files
                .filter(f => f.startsWith(prefix) && `${dir}${f}` !== dest)
                .map(f => FileSystem.deleteAsync(`${dir}${f}`, { idempotent: true }).catch(() => {}));
            Promise.all(deletes).catch(() => {});
        }).catch(() => {});

        return dest;
    } catch {
        return uri;
    }
}
