import { AlertTriangle } from "lucide-react";
import { Alert } from "./Alert";
import { Button } from "./Button";
import { Modal } from "./Modal";
/**
 * Confirmación genérica para acciones destructivas o irreversibles.
 *
 * El botón principal usa el estilo `danger`: se reserva para operaciones que
 * no se pueden deshacer (borrados físicos, anulaciones).
 */
export function ConfirmDialog({ open, title, message, confirmLabel = "Confirmar", cancelLabel = "Cancelar", loading = false, error = null, onConfirm, onClose, }) {
    return (<Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <div className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>
          <p>{message}</p>
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>);
}
