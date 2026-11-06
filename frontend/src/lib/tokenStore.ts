type Listener = () => void;

let accessToken: string | null = null;
const listeners = new Set<Listener>();
let logoutHandler: (() => void) | null = null;

export const tokenStore = {
  get(): string | null {
    return accessToken;
  },

  set(token: string | null): void {
    accessToken = token;
    listeners.forEach((listener) => listener());
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  setLogoutHandler(handler: (() => void) | null): void {
    logoutHandler = handler;
  },

  notifyLogout(): void {
    logoutHandler?.();
  },
};
