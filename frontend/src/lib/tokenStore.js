let accessToken = null;
const listeners = new Set();
let logoutHandler = null;
export const tokenStore = {
    get() {
        return accessToken;
    },
    set(token) {
        accessToken = token;
        listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
    setLogoutHandler(handler) {
        logoutHandler = handler;
    },
    notifyLogout() {
        logoutHandler?.();
    },
};
