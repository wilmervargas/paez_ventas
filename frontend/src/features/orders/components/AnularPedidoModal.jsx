import { zodResolver } from "@hookform/resolvers/zod";
import { Ban } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Modal } from "../../../components/ui/Modal";
import { TextArea } from "../../../components/ui/TextArea";
import { getErrorMessage } from "../../../lib/errors";
import { useAnularPedido } from "../hooks";

const schema = z.object({
  motivo: z
    .string()
    .trim()
    .min(1, "Indica el motivo de la anulación")
    .max(500, "Máximo 500 caracteres"),
});

export function AnularPedidoModal({ pedido, onClose }) {
  const [error, setError] = useState(null);
  const mutation = useAnularPedido();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { motivo: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await mutation.mutateAsync({ id: pedido.id, motivo: values.motivo });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo anular el pedido."));
    }
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Anular ${pedido.numero}`}
      description={`${pedido.cliente_nombre} · ${pedido.total} ${pedido.moneda}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="anular-pedido-form"
            variant="danger"
            loading={isSubmitting}
            icon={<Ban className="h-4 w-4" />}
          >
            Anular pedido
          </Button>
        </div>
      }
    >
      {error ? (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      ) : null}

      <Alert tone="warning" className="mb-4">
        {pedido.estado === "confirmado"
          ? "Este pedido ya descontó inventario. Al anularlo se repondrá el stock de sus líneas."
          : pedido.estado === "entregado"
            ? "Este pedido ya fue entregado. Si requiere reverso, se debe gestionar según el flujo definido."
            : "El pedido está en borrador y no ha afectado el inventario."}
      </Alert>

      <form id="anular-pedido-form" onSubmit={onSubmit} noValidate>
        <TextArea
          label="Motivo *"
          rows={3}
          placeholder="Explica por qué se anula el pedido"
          error={errors.motivo?.message}
          {...register("motivo")}
        />
      </form>
    </Modal>
  );
}
