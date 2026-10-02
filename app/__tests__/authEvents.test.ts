beforeEach(() => {
    jest.resetModules();
});

const getModule = () => require('../src/utils/authEvents');

describe('authEvents', () => {
    it('dispara o handler registrado', () => {
        const { setSessionExpiredHandler, triggerSessionExpired } = getModule();
        const handler = jest.fn();
        setSessionExpiredHandler(handler);
        triggerSessionExpired();
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('não lança exceção quando nenhum handler está registrado', () => {
        const { triggerSessionExpired } = getModule();
        expect(() => triggerSessionExpired()).not.toThrow();
    });

    it('substitui handler antigo ao registrar novo', () => {
        const { setSessionExpiredHandler, triggerSessionExpired } = getModule();
        const handler1 = jest.fn();
        const handler2 = jest.fn();
        setSessionExpiredHandler(handler1);
        setSessionExpiredHandler(handler2);
        triggerSessionExpired();
        expect(handler1).not.toHaveBeenCalled();
        expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('acumula chamadas — cada triggerSessionExpired dispara o handler uma vez', () => {
        const { setSessionExpiredHandler, triggerSessionExpired } = getModule();
        const handler = jest.fn();
        setSessionExpiredHandler(handler);
        triggerSessionExpired();
        triggerSessionExpired();
        expect(handler).toHaveBeenCalledTimes(2);
    });
});
