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
import { useAnularCompra } from "../hooks";
const schema = z.object({
    motivo: z
        .string()
        .trim()
        .min(1, "Indica el motivo de la anulación")
        .max(500, "Máximo 500 caracteres"),
});
export function AnularCompraModal({ compra, onClose }) {
    const [error, setError] = useState(null);
    const mutation = useAnularCompra();
    const { register, handleSubmit, formState: { errors, isSubmitting }, } = useForm({
        resolver: zodResolver(schema),
        defaultValues: { motivo: "" },
    });
    const onSubmit = handleSubmit(async (values) => {
        setError(null);
        try {
            await mutation.mutateAsync({ id: compra.id, motivo: values.motivo });
            onClose();
        }
        catch (err) {
            setError(getErrorMessage(err, "No se pudo anular la compra."));
        }
    });
    return (<Modal open onClose={onClose} title={`Anular ${compra.numero}`} description={`${compra.proveedor_nombre} · ${compra.total} ${compra.moneda}`} footer={<div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="anular-compra-form" variant="danger" loading={isSubmitting} icon={<Ban className="h-4 w-4"/>}>
            Anular compra
          </Button>
        </div>}>
      {error ? (<Alert tone="error" className="mb-4">
          {error}
        </Alert>) : null}

      <Alert tone="warning" className="mb-4">
        {compra.estado === "recibida"
            ? "Esta compra ya afectó el inventario. Al anularla se registrarán salidas de reverso y el stock debe alcanzar para reversarlas."
            : "La compra está en borrador y no ha afectado el inventario."}
      </Alert>

      <form id="anular-compra-form" onSubmit={onSubmit} noValidate>
        <TextArea label="Motivo *" rows={3} placeholder="Explica por qué se anula la compra" error={errors.motivo?.message} {...register("motivo")}/>
      </form>
    </Modal>);
}
