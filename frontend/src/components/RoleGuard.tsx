import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../context/auth-context";
import type { Rol } from "../types/auth";

export function RoleGuard({ roles, children }: { roles: Rol[]; children: ReactNode }) {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  if (!roles.includes(user.rol)) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
}
