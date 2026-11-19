import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RoleGuard } from "./components/RoleGuard";
import { AppLayout } from "./components/layout/AppLayout";
import { FullPageLoader } from "./components/ui/Spinner";
import { REPORT_ROLES } from "./features/reports/config";
const LoginPage = lazy(() => import("./features/auth/LoginPage").then((module) => ({ default: module.LoginPage })));
const ForgotPasswordPage = lazy(() => import("./features/auth/ForgotPasswordPage").then((module) => ({
    default: module.ForgotPasswordPage,
})));
const ResetPasswordPage = lazy(() => import("./features/auth/ResetPasswordPage").then((module) => ({
    default: module.ResetPasswordPage,
})));
const ChangePasswordPage = lazy(() => import("./features/auth/ChangePasswordPage").then((module) => ({
    default: module.ChangePasswordPage,
})));
const CompanyPage = lazy(() => import("./features/company/CompanyPage").then((module) => ({
    default: module.CompanyPage,
})));
const DashboardPage = lazy(() => import("./features/dashboard/DashboardPage").then((module) => ({
    default: module.DashboardPage,
})));
const ClientesPage = lazy(() => import("./features/clients/pages/ClientesPage").then((module) => ({
    default: module.ClientesPage,
})));
const ProveedoresPage = lazy(() => import("./features/clients/pages/ProveedoresPage").then((module) => ({
    default: module.ProveedoresPage,
})));
const InventarioPage = lazy(() => import("./features/inventory/pages/InventarioPage").then((module) => ({
    default: module.InventarioPage,
})));
const ComprasPage = lazy(() => import("./features/purchases/pages/ComprasPage").then((module) => ({
    default: module.ComprasPage,
})));
const PedidosPage = lazy(() => import("./features/orders/pages/PedidosPage").then((module) => ({
    default: module.PedidosPage,
})));
const DeudoresPage = lazy(() => import("./features/finances/pages/DeudoresPage").then((module) => ({
    default: module.DeudoresPage,
})));
const CajaPage = lazy(() => import("./features/finances/pages/CajaPage").then((module) => ({
    default: module.CajaPage,
})));
const WhatsAppPage = lazy(() => import("./features/whatsapp/pages/WhatsAppPage").then((module) => ({
    default: module.WhatsAppPage,
})));
const RatesPage = lazy(() => import("./features/rates/pages/RatesPage").then((module) => ({
    default: module.RatesPage,
})));
const UsuariosPage = lazy(() => import("./features/users/pages/UsuariosPage").then((module) => ({
    default: module.UsuariosPage,
})));
const MantenimientoPage = lazy(() => import("./features/system/pages/MantenimientoPage").then((module) => ({
    default: module.MantenimientoPage,
})));
const LimpiarBaseDatosPage = lazy(() =>
    import("./features/system/pages/LimpiarBaseDatosPage").then((module) => ({
        default: module.LimpiarBaseDatosPage,
    })),
);
const NotFoundPage = lazy(() => import("./features/errors/NotFoundPage").then((module) => ({
    default: module.NotFoundPage,
})));
const ReportesPage = lazy(() => import("./features/reports/pages/ReportesPage").then((module) => ({
    default: module.ReportesPage,
})));
const ReporteDetallePage = lazy(() => import("./features/reports/pages/ReporteDetallePage").then((module) => ({
    default: module.ReporteDetalleRoute,
})));
export default function App() {
    return (<Suspense fallback={<div className="grid min-h-screen place-items-center bg-slate-100">
          <FullPageLoader label="Cargando..."/>
        </div>}>
      <Routes>
        <Route path="/login" element={<LoginPage />}/>
        <Route path="/forgot-password" element={<ForgotPasswordPage />}/>
        <Route path="/reset-password" element={<ResetPasswordPage />}/>

        <Route path="/app" element={<ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>}>
          <Route index element={<DashboardPage />}/>
          <Route path="empresa" element={<CompanyPage />}/>
          <Route path="cambiar-password" element={<ChangePasswordPage />}/>
          <Route path="clientes" element={<RoleGuard roles={["admin", "vendedor", "cobrador"]}>
                <ClientesPage />
              </RoleGuard>}/>
          <Route path="proveedores" element={<RoleGuard roles={["admin", "almacenista"]}>
                <ProveedoresPage />
              </RoleGuard>}/>
          <Route path="inventario" element={<RoleGuard roles={["admin", "vendedor", "almacenista"]}>
                <InventarioPage />
              </RoleGuard>}/>
          <Route path="compras" element={<RoleGuard roles={["admin", "almacenista"]}>
                <ComprasPage />
              </RoleGuard>}/>
          <Route path="pedidos" element={<RoleGuard roles={["admin", "vendedor", "almacenista"]}>
                <PedidosPage />
              </RoleGuard>}/>
          <Route path="deudas" element={<RoleGuard roles={["admin", "vendedor", "cobrador"]}>
                <DeudoresPage />
              </RoleGuard>}/>
          <Route path="caja" element={<RoleGuard roles={["admin", "cobrador"]}>
                <CajaPage />
              </RoleGuard>}/>
          <Route path="whatsapp" element={<RoleGuard roles={["admin", "cobrador"]}>
                <WhatsAppPage />
              </RoleGuard>}/>
          <Route path="tasas" element={<RoleGuard roles={["admin"]}>
                <RatesPage />
              </RoleGuard>}/>
          <Route path="reportes" element={<RoleGuard roles={REPORT_ROLES}>
                <ReportesPage />
              </RoleGuard>}/>
          <Route path="reportes/:tipo" element={<RoleGuard roles={REPORT_ROLES}>
                <ReporteDetallePage />
              </RoleGuard>}/>
          <Route path="usuarios" element={<RoleGuard superuserOnly>
                <UsuariosPage />
              </RoleGuard>}/>
          <Route path="mantenimiento" element={<RoleGuard superuserOnly>
                <MantenimientoPage />
              </RoleGuard>}/>
          <Route path="limpiar-base-datos" element={<RoleGuard allowedEmails={["wilmere.vargas@gmail.com"]}>
                <LimpiarBaseDatosPage />
              </RoleGuard>}/>
          <Route path="*" element={<NotFoundPage />}/>
        </Route>

        <Route path="/" element={<Navigate to="/app" replace/>}/>
        <Route path="*" element={<NotFoundPage />}/>
      </Routes>
    </Suspense>);
}
