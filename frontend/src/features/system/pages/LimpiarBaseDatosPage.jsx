import { useQueryClient } from "@tanstack/react-query";
import { Database } from "lucide-react";
import { useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../../components/ui/Card";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { PageHeader } from "../../../components/ui/PageHeader";
import { api } from "../../../lib/api";
import { getErrorMessage } from "../../../lib/errors";

export function LimpiarBaseDatosPage() {
  const queryClient = useQueryClient();
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  async function handleConfirm() {
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post("/company/limpiar-base-datos/");
      await queryClient.invalidateQueries();
      setShowConfirm(false);
      setSuccess(
        data?.detail ||
          "Base de datos depurada correctamente. Se conservaron empresa, tasas de cambio, categorías, unidades, clientes, proveedores, usuarios, productos, combos y movimientos de inventario (sin referencias huérfanas)."
      );
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo limpiar la base de datos."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Database}
        title="Limpiar base de datos"
        description="Depura los registros operativos y conserva la configuración base del sistema."
      />

      {success ? <Alert tone="success">{success}</Alert> : null}

      <Card>
        <CardHeader
          title="Acción de mantenimiento"
          description="Disponible solo para superusuarios o el usuario autorizado."
        />
        <CardBody className="space-y-4">
          <Alert tone="warning">
            <strong>Esta acción elimina de forma irreversible</strong> compras, pedidos, finanzas
            (deudas, cuotas, pagos y caja), secuencias, sesiones y demás registros operativos. Se
            conservan sin alterarlos <strong>empresa</strong>, <strong>tasas de cambio</strong>,{" "}
            <strong>categorías</strong>, <strong>unidades de medida</strong>,{" "}
            <strong>clientes</strong>, <strong>proveedores</strong>, <strong>usuarios</strong>,{" "}
            <strong>productos</strong>, <strong>combos</strong> y{" "}
            <strong>movimientos de inventario</strong> (se limpian solo las referencias a
            documentos purgados para no dejar vínculos huérfanos).
          </Alert>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="danger"
              icon={<Database className="h-4 w-4" />}
              onClick={() => {
                setError(null);
                setShowConfirm(true);
              }}
            >
              Limpiar base de datos
            </Button>
          </div>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={showConfirm}
        title="Limpiar base de datos"
        message="¿Seguro que deseas limpiar la base de datos? Se eliminarán compras, pedidos, finanzas (deudas, cuotas, pagos y caja), secuencias, sesiones y demás registros operativos. Se conservarán sin alterarlos empresa, tasas de cambio, categorías, unidades de medida, clientes, proveedores, usuarios, productos, combos y movimientos de inventario (limpiando solo referencias huérfanas a documentos purgados). Esta acción no se puede deshacer."
        confirmLabel="Sí, limpiar base de datos"
        cancelLabel="Cancelar"
        loading={loading}
        error={error}
        onConfirm={handleConfirm}
        onClose={() => {
          if (!loading) {
            setShowConfirm(false);
            setError(null);
          }
        }}
      />
    </div>
  );
}
