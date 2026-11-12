import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useMemo } from "react";
import { api } from "../lib/api";
import { useAuth } from "./auth-context";
import { CompanyContext } from "./company-context";
export function CompanyProvider({ children }) {
    const { status } = useAuth();
    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: ["company"],
        enabled: status === "authenticated",
        retry: false,
        queryFn: async () => {
            try {
                const response = await api.get("/company/");
                return response.data;
            }
            catch (error) {
                if (axios.isAxiosError(error) && error.response?.status === 404) {
                    return null;
                }
                throw error;
            }
        },
    });
    const value = useMemo(() => ({
        company: data ?? null,
        isLoading: status === "loading" || isLoading,
        isError,
        refetch: () => {
            void refetch();
        },
    }), [data, isLoading, isError, refetch, status]);
    return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}
