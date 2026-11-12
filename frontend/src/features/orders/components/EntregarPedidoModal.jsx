import { Truck } from "lucide-react";
import { useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Modal } from "../../../components/ui/Modal";
import { getErrorMessage } from "../../../lib/errors";
import { formatMoney } from "../../../lib/money";
import { useEntregarPedido } from "../hooks";

export function EntregarPedidoModal({ pedido, onClose }) {
  const [error, setError] = useState(null);
  const mutation = useEntregarPedido();

  async function entregar() {
    setError(null);
    try {
      await mutation.mutateAsync(pedido.id);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo marcar el pedido como entregado."));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Entregar ${pedido.numero}`}
      description={`${pedido.cliente_nombre} · ${formatMoney(pedido.total, pedido.moneda)}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            loading={mutation.isPending}
            onClick={() => void entregar()}
            icon={<Truck className="h-4 w-4" />}
          >
            Marcar entregado
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
        El pedido pasará a estado entregado. Solo los pedidos confirmados pueden entregarse.
      </Alert>
    </Modal>
  );
}
