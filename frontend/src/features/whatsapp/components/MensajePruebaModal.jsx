import { Modal } from "../../../components/ui/Modal";
import { Button } from "../../../components/ui/Button";
import { EnviarMensajePrueba } from "./EnviarMensajePrueba";

export function MensajePruebaModal({
  open,
  onClose,
  initialTo = "",
  initialMessage = "",
  title = "Enviar mensaje por WhatsApp",
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={title}
      footer={
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      }
    >
      <EnviarMensajePrueba initialTo={initialTo} initialMessage={initialMessage} showTitle={false} />
    </Modal>
  );
}
