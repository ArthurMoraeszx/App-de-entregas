/**
 * Regra única de "esta foto ainda é local, o servidor não a tem".
 *
 * Existem quatro formatos possíveis, dependendo de onde o app está rodando:
 *   file://     câmera e sistema de arquivos no Android/iOS
 *   content://  DocumentScanner em algumas versões do Android
 *   data:       captura pela webcam no navegador (base64 embutido)
 *   blob:       arquivo escolhido no navegador
 *
 * Um caminho já confirmado pelo servidor não tem prefixo nenhum: vem como
 * "guias/2026/09/24001.jpg". É essa diferença que distingue "foto ainda no
 * aparelho" de "foto já gravada no servidor".
 *
 * Os dois últimos formatos ficaram de fora por muito tempo porque o sync não
 * rodava no navegador. Com ele rodando, esquecer 'data:' faz o app tratar um
 * base64 inteiro como se fosse caminho de arquivo no servidor — e mandar isso
 * no payload de sincronização.
 */

export const PREFIXOS_LOCAIS = ['file://', 'content://', 'data:', 'blob:'] as const;

/** Padrões equivalentes para usar em Q.like() do WatermelonDB. */
export const PADROES_LOCAIS_SQL = PREFIXOS_LOCAIS.map((p) => `${p}%`);

export function isUriLocal(uri?: string | null): boolean {
    return !!uri && PREFIXOS_LOCAIS.some((prefixo) => uri.startsWith(prefixo));
}
