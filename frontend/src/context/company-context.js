import { createContext, useContext } from "react";
export const CompanyContext = createContext(null);
export function useCompany() {
    const context = useContext(CompanyContext);
    if (!context) {
        throw new Error("useCompany debe usarse dentro de <CompanyProvider>.");
    }
    return context;
}
