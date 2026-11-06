import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../context/auth-context";
import { useCompany } from "../context/company-context";
import { PageLoader } from "./ui/Spinner";

/**
 * Gate de primer arranque:
 * 1. Si el usuario debe cambiar la contraseña, lo fuerza a hacerlo.
 * 2. Si la empresa no está configurada, lo lleva a la pantalla de configuración.
 */
export function CompanyGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { company, isLoading } = useCompany();
  const location = useLocation();

  if (isLoading) {
    return <PageLoader label="Cargando configuración..." />;
  }

  // Primer arranque: la empresa se configura antes que cualquier otra cosa,
  // incluso antes de cambiar la contraseña temporal.
  if (!company) {
    if (location.pathname !== "/app/empresa") {
      return <Navigate to="/app/empresa" replace />;
    }
    return <>{children}</>;
  }

  if (user?.must_change_password && location.pathname !== "/app/cambiar-password") {
    return <Navigate to="/app/cambiar-password" replace />;
  }

  return <>{children}</>;
}
