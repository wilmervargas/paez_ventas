import { useQueryClient } from "@tanstack/react-query";
import { Database } from "lucide-react";
import { useState } from "react";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { useAuth } from "../../context/auth-context";
import { api } from "../../lib/api";
import { getErrorMessage } from "../../lib/errors";
import { RatesManager } from "../rates/components/RatesManager";

const DB_RESET_EMAIL = "wilmere.vargas@gmail.com";

export function DashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const firstName = user?.nombre.split(/\s+/)[0] ?? "";
  const canResetDb = (user?.email || "").toLowerCase() === DB_RESET_EMAIL;
  const [showDbReset, setShowDbReset] = useState(false);
  const [dbResetLoading, setDbResetLoading] = useState(false);
  const [dbResetError, setDbResetError] = useState(null);
  const [dbResetSuccess, setDbResetSuccess] = useState(null);

  const handleDbReset = async () => {
    setDbResetError(null);
    setDbResetLoading(true);
    try {
      const { data } = await api.post("/company/limpiar-base-datos/");
      await queryClient.invalidateQueries();
      setShowDbReset(false);
      setDbResetSuccess(data?.detail || "Base de datos depurada correctamente. Se conservaron empresa, tasas de cambio y catálogos (categorías/unidades).");
    } catch (err) {
      setDbResetError(getErrorMessage(err, "No se pudo limpiar la base de datos."));
    } finally {
      setDbResetLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 p-6 text-white shadow-lg sm:p-8">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">
            Panel principal
          </p>
          <h1 className="mt-2 text-xl font-semibold sm:text-2xl">Hola, {firstName}</h1>
        </div>
      </section>

      <RatesManager />

      {canResetDb ? (
        <Card>
          <CardHeader
            title="Sistema"
            description="Acciones de mantenimiento del sistema. Disponibles solo para el usuario autorizado."
          />
          <CardBody className="space-y-4">
            {dbResetSuccess ? <Alert tone="success">{dbResetSuccess}</Alert> : null}
            <Alert tone="warning">
              <strong>Limpiar base de datos:</strong> elimina todos los registros excepto{" "}
              <strong>empresa</strong>, <strong>tasas de cambio</strong> y <strong>catálogos</strong>{" "}
              (categorías y unidades). Se conserva tu usuario autorizado. Acción irreversible, pensada para depuración y arranque en limpio.
            </Alert>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="danger"
                icon={<Database className="h-4 w-4" />}
                onClick={() => {
                  setDbResetError(null);
                  setShowDbReset(true);
                }}
              >
                Limpiar base de datos
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <ConfirmDialog
        open={showDbReset}
        title="Limpiar base de datos"
        message="¿Seguro que deseas limpiar la base de datos? Se eliminarán clientes, proveedores, productos/combos, inventario, compras, pedidos, finanzas, secuencias y demás registros, conservando solo empresa, tasas de cambio y catálogos (categorías/unidades). Esta acción no se puede deshacer."
        confirmLabel="Sí, limpiar base de datos"
        cancelLabel="Cancelar"
        loading={dbResetLoading}
        error={dbResetError}
        onConfirm={handleDbReset}
        onClose={() => {
          if (!dbResetLoading) {
            setShowDbReset(false);
            setDbResetError(null);
          }
        }}
      />
    </div>
  );
}
