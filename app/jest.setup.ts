/**
 * Configuração global do Jest para o projeto mobile.
 *
 * Executado depois que o framework Jest é carregado mas antes dos testes.
 */

// Silencia log/warn para output mais limpo. Mantém error visível.
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});

// jest-expo não inclui um mock padrão para expo-secure-store (usado por getDeviceId).
// Sem isso, qualquer teste que importe (mesmo transitivamente) src/utils/deviceId.ts
// falha com "Cannot find native module 'ExpoSecureStore'".
jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn().mockResolvedValue(null),
    setItemAsync: jest.fn().mockResolvedValue(undefined),
    deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// jest-expo setup instala lazy getters via expo/src/winter que chamam require() quando
// acessados. Jest 30 proíbe require() entre testes (throwIfBetweenTests). A solução é
// forçar a avaliação de todos esses getters aqui (após jest-expo rodar), convertendo-os
// de getters lazy para propriedades regulares antes do primeiro teste executar.
const expoWinterGlobals = [
    'TextDecoder', 'TextDecoderStream', 'TextEncoderStream',
    'URL', 'URLSearchParams', '__ExpoImportMetaRegistry', 'structuredClone',
];
expoWinterGlobals.forEach((key) => {
    try {
        void (globalThis as any)[key]; // força avaliação do getter
    } catch {
        // ignora se o módulo não estiver disponível no ambiente de teste
    }
});
