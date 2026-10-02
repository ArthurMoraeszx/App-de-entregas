/**
 * Mock mínimo do react-native para testes de lógica pura.
 * Não carrega módulos nativos — evita erros de "Cannot find module" no Jest.
 */
export const Platform = {
    OS: 'android' as const,
    select: (obj: any) => obj['android'] ?? obj['default'],
};

export const NativeModules = {
    RNCAsyncStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
};
