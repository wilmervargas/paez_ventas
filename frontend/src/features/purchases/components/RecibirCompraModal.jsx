import { PackageCheck } from "lucide-react";
import { useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Modal } from "../../../components/ui/Modal";
import { getErrorMessage } from "../../../lib/errors";
import { formatMoney } from "../../../lib/money";
import { useRecibirCompra } from "../hooks";
export function RecibirCompraModal({ compra, onClose }) {
    const [error, setError] = useState(null);
    const mutation = useRecibirCompra();
    async function confirmar() {
        setError(null);
        try {
            await mutation.mutateAsync(compra.id);
            onClose();
        }
        catch (err) {
            setError(getErrorMessage(err, "No se pudo recibir la compra."));
        }
    }
    return (<Modal open onClose={onClose} title={`Recibir ${compra.numero}`} description={`${compra.proveedor_nombre} · ${formatMoney(compra.total, compra.moneda)}`} footer={<div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" loading={mutation.isPending} onClick={() => void confirmar()} icon={<PackageCheck className="h-4 w-4"/>}>
            Confirmar recepción
          </Button>
        </div>}>
      {error ? (<Alert tone="error" className="mb-4">
          {error}
        </Alert>) : null}

      <Alert tone="info">
        Se generarán movimientos de entrada en el kardex por cada línea y se actualizará el costo
        promedio de los productos. La compra quedará bloqueada para edición.
      </Alert>

      <div className="mt-4 rounded-xl border border-slate-200 p-4 text-sm">
        <p className="font-semibold text-slate-900">{compra.lineas.length} líneas</p>
        <p className="mt-1 text-slate-600">
          {compra.lineas.map((linea) => linea.producto_nombre).join(", ")}
        </p>
      </div>
    </Modal>);
}
