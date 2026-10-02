/**
 * Mock do NetInfo para testes.
 */
const NetInfo = {
    fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
    addEventListener: jest.fn(() => jest.fn()), // retorna unsubscribe
};

export default NetInfo;
