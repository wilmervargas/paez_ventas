import { AlertTriangle, DatabaseZap } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../../components/ui/Card";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { PageHeader } from "../../../components/ui/PageHeader";
import { useAuth } from "../../../context/auth-context";
import { api } from "../../../lib/api";
import { getErrorMessage } from "../../../lib/errors";

export function MantenimientoPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  if (!user?.is_superuser) {
    return (
      <Alert tone="warning" title="Acceso restringido">
        Solo los superusuarios pueden acceder a las rutinas de mantenimiento.
      </Alert>
    );
  }

  async function handleReset() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post("/company/limpiar-base-datos/");
      await queryClient.invalidateQueries();
      setOpen(false);
      setSuccess(data?.detail || "Base de datos depurada correctamente.");
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo limpiar la base de datos."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={DatabaseZap}
        title="Mantenimiento"
        description="Rutinas administrativas del sistema. Disponibles solo para superusuarios."
      />

      {success ? <Alert tone="success">{success}</Alert> : null}

      <Card>
        <CardHeader
          title="Limpiar base de datos"
          description="Depura datos operativos y transaccionales para reiniciar la operación conservando la configuración base."
        />
        <CardBody className="space-y-4">
          <Alert tone="warning" title="Acción irreversible">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Se eliminarán clientes, proveedores, productos/combos, inventario, compras, pedidos, finanzas
                (deudas, cuotas, pagos y caja), secuencias, sesiones y demás registros operativos. Se conservarán
                <strong> empresa</strong>, <strong>tasas de cambio</strong>, <strong>categorías</strong>,{" "}
                <strong>unidades de medida</strong> y <strong>usuarios</strong> (incluidos correos adicionales).
              </p>
            </div>
          </Alert>
          <div className="flex justify-end">
            <Button
              variant="danger"
              icon={<DatabaseZap className="h-4 w-4" />}
              onClick={() => {
                setError(null);
                setOpen(true);
              }}
            >
              Limpiar base de datos
            </Button>
          </div>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={open}
        title="Limpiar base de datos"
        message="¿Confirmas que deseas depurar la base de datos? Se eliminarán los registros operativos y transaccionales, conservando solo empresa, tasas de cambio, categorías, unidades de medida y usuarios. Esta acción no se puede deshacer."
        confirmLabel="Sí, limpiar base de datos"
        cancelLabel="Cancelar"
        loading={loading}
        error={error}
        onConfirm={handleReset}
        onClose={() => {
          if (!loading) {
            setOpen(false);
            setError(null);
          }
        }}
      />
    </div>
  );
}
