import { createContext, useContext } from "react";

import type { Empresa } from "../types/company";

export interface CompanyContextValue {
  company: Empresa | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export const CompanyContext = createContext<CompanyContextValue | null>(null);

export function useCompany(): CompanyContextValue {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error("useCompany debe usarse dentro de <CompanyProvider>.");
  }
  return context;
}
