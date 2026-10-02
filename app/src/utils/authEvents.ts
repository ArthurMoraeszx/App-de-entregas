type Handler = () => void;
let _handler: Handler | null = null;

export function setSessionExpiredHandler(fn: Handler) {
    _handler = fn;
}

export function triggerSessionExpired() {
    _handler?.();
}
