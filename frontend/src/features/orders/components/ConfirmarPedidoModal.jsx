import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Modal } from "../../../components/ui/Modal";
import { getErrorMessage } from "../../../lib/errors";
import { formatMoney } from "../../../lib/money";
import { useConfirmarPedido } from "../hooks";

export function ConfirmarPedidoModal({ pedido, onClose }) {
  const [error, setError] = useState(null);
  const mutation = useConfirmarPedido();

  async function confirmar() {
    setError(null);
    try {
      await mutation.mutateAsync(pedido.id);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo confirmar el pedido."));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Confirmar ${pedido.numero}`}
      description={`${pedido.cliente_nombre} · ${formatMoney(pedido.total, pedido.moneda)}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            loading={mutation.isPending}
            onClick={() => void confirmar()}
            icon={<CheckCircle2 className="h-4 w-4" />}
          >
            Confirmar pedido
          </Button>
        </div>
      }
    >
      {error ? (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      ) : null}

      <Alert tone="info">
        Al confirmar se descontará el inventario de las líneas del pedido.
        {pedido.tipo_pago === "credito"
          ? " Al ser un pedido a crédito, se generará la deuda correspondiente según la configuración del sistema."
          : " Este pedido es de contado."}{" "}
        Un pedido confirmado no se edita: para corregirlo debe anularse y crearse uno nuevo.
      </Alert>

      <div className="mt-4 rounded-xl border border-slate-200 p-4 text-sm">
        <p className="font-semibold text-slate-900">{pedido.lineas.length} líneas</p>
        <p className="mt-1 text-slate-600">
          {pedido.lineas
            .map((l) => l.descripcion || l.producto_nombre || l.combo_nombre)
            .filter(Boolean)
            .join(", ")}
        </p>
      </div>
    </Modal>
  );
}
