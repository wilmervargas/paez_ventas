import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useMemo, type ReactNode } from "react";

import { api } from "../lib/api";
import type { Empresa } from "../types/company";
import { useAuth } from "./auth-context";
import { CompanyContext, type CompanyContextValue } from "./company-context";

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  const { data, isLoading, isError, refetch } = useQuery<Empresa | null>({
    queryKey: ["company"],
    enabled: status === "authenticated",
    retry: false,
    queryFn: async () => {
      try {
        const response = await api.get<Empresa>("/company/");
        return response.data;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          return null;
        }
        throw error;
      }
    },
  });

  const value = useMemo<CompanyContextValue>(
    () => ({
      company: data ?? null,
      isLoading: status === "loading" || isLoading,
      isError,
      refetch: () => {
        void refetch();
      },
    }),
    [data, isLoading, isError, refetch, status],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}
