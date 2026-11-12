import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, } from "react";
import { api } from "../lib/api";
import { tokenStore } from "../lib/tokenStore";
import { AuthContext } from "./auth-context";
export function AuthProvider({ children }) {
    const queryClient = useQueryClient();
    const [user, setUser] = useState(null);
    const [initializing, setInitializing] = useState(true);
    const accessToken = useSyncExternalStore(tokenStore.subscribe, tokenStore.get, tokenStore.get);
    const clearSession = useCallback(() => {
        tokenStore.set(null);
        setUser(null);
        queryClient.clear();
    }, [queryClient]);
    useEffect(() => {
        tokenStore.setLogoutHandler(clearSession);
        return () => tokenStore.setLogoutHandler(null);
    }, [clearSession]);
    const refreshSession = useCallback(async () => {
        try {
            const { data } = await api.post("/auth/token/refresh/");
            tokenStore.set(data.access);
            const me = await api.get("/auth/me/");
            setUser(me.data);
        }
        catch {
            tokenStore.set(null);
            setUser(null);
        }
        finally {
            setInitializing(false);
        }
    }, []);
    const didInit = useRef(false);
    useEffect(() => {
        if (didInit.current) {
            return;
        }
        didInit.current = true;
        void refreshSession();
    }, [refreshSession]);
    const login = useCallback(async (email, password) => {
        const { data } = await api.post("/auth/token/", {
            email,
            password,
        });
        tokenStore.set(data.access);
        setUser(data.user);
    }, []);
    const logout = useCallback(async () => {
        try {
            await api.post("/auth/logout/");
        }
        catch {
            // Aunque falle la revocación, se limpia la sesión local.
        }
        clearSession();
    }, [clearSession]);
    const status = initializing
        ? "loading"
        : user && accessToken
            ? "authenticated"
            : "anonymous";
    const value = useMemo(() => ({
        user,
        accessToken,
        status,
        login,
        logout,
        refreshSession,
        setUser,
    }), [user, accessToken, status, login, logout, refreshSession]);
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
