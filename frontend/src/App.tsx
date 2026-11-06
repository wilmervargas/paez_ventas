import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "./components/ProtectedRoute";
import { RoleGuard } from "./components/RoleGuard";
import { AppLayout } from "./components/layout/AppLayout";
import { FullPageLoader } from "./components/ui/Spinner";

const LoginPage = lazy(() =>
  import("./features/auth/LoginPage").then((module) => ({ default: module.LoginPage })),
);
const ChangePasswordPage = lazy(() =>
  import("./features/auth/ChangePasswordPage").then((module) => ({
    default: module.ChangePasswordPage,
  })),
);
const CompanyPage = lazy(() =>
  import("./features/company/CompanyPage").then((module) => ({
    default: module.CompanyPage,
  })),
);
const DashboardPage = lazy(() =>
  import("./features/dashboard/DashboardPage").then((module) => ({
    default: module.DashboardPage,
  })),
);
const ClientesPage = lazy(() =>
  import("./features/clients/pages/ClientesPage").then((module) => ({
    default: module.ClientesPage,
  })),
);
const ProveedoresPage = lazy(() =>
  import("./features/clients/pages/ProveedoresPage").then((module) => ({
    default: module.ProveedoresPage,
  })),
);
const InventarioPage = lazy(() =>
  import("./features/inventory/pages/InventarioPage").then((module) => ({
    default: module.InventarioPage,
  })),
);
const ComprasPage = lazy(() =>
  import("./features/purchases/pages/ComprasPage").then((module) => ({
    default: module.ComprasPage,
  })),
);
const NotFoundPage = lazy(() =>
  import("./features/errors/NotFoundPage").then((module) => ({
    default: module.NotFoundPage,
  })),
);

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-slate-100">
          <FullPageLoader label="Cargando..." />
        </div>
      }
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="empresa" element={<CompanyPage />} />
          <Route path="cambiar-password" element={<ChangePasswordPage />} />
          <Route
            path="clientes"
            element={
              <RoleGuard roles={["admin", "vendedor", "cobrador"]}>
                <ClientesPage />
              </RoleGuard>
            }
          />
          <Route
            path="proveedores"
            element={
              <RoleGuard roles={["admin", "almacenista"]}>
                <ProveedoresPage />
              </RoleGuard>
            }
          />
          <Route
            path="inventario"
            element={
              <RoleGuard roles={["admin", "vendedor", "almacenista"]}>
                <InventarioPage />
              </RoleGuard>
            }
          />
          <Route
            path="compras"
            element={
              <RoleGuard roles={["admin", "almacenista"]}>
                <ComprasPage />
              </RoleGuard>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
