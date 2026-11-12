import { zodResolver } from "@hookform/resolvers/zod";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { Select } from "../../../components/ui/Select";
import { useAuth } from "../../../context/auth-context";
import { getErrorMessage } from "../../../lib/errors";
import { formatQuantity } from "../../../lib/numbers";
import { isAdmin } from "../../../lib/roles";
import { useAjusteInventario } from "../hooks";
const schema = z.object({
    direccion: z.enum(["entrada", "salida"]),
    cantidad: z
        .string()
        .trim()
        .regex(/^\d{1,11}(\.\d{1,3})?$/, "Usa una cantidad con hasta 3 decimales")
        .refine((value) => Number(value) > 0, "La cantidad debe ser mayor que cero"),
    costo_unitario: z
        .string()
        .trim()
        .regex(/^\d{1,12}(\.\d{1,4})?$/, "Usa un costo con hasta 4 decimales"),
    motivo: z.string().trim().min(1, "Indica el motivo del ajuste").max(200),
});
export function AjusteStockModal({ producto, onClose, }) {
    const { user } = useAuth();
    const puedeVerCostos = isAdmin(user?.rol);
    const [error, setError] = useState(null);
    const mutation = useAjusteInventario();
    const { register, handleSubmit, formState: { errors, isSubmitting }, } = useForm({
        resolver: zodResolver(schema),
        defaultValues: {
            direccion: "entrada",
            cantidad: "",
            costo_unitario: producto.costo ?? "0.0000",
            motivo: "",
        },
    });
    const onSubmit = handleSubmit(async (values) => {
        setError(null);
        try {
            await mutation.mutateAsync({
                producto: producto.id,
                cantidad: values.cantidad,
                direccion: values.direccion,
                motivo: values.motivo,
                costo_unitario: puedeVerCostos ? values.costo_unitario : undefined,
            });
            onClose();
        }
        catch (err) {
            setError(getErrorMessage(err, "No se pudo registrar el ajuste."));
        }
    });
    return (<Modal open onClose={onClose} title="Ajustar stock" description={`${producto.sku} · ${producto.nombre}`} footer={<div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="ajuste-form" loading={isSubmitting} icon={<SlidersHorizontal className="h-4 w-4"/>}>
            Registrar ajuste
          </Button>
        </div>}>
      <div className="mb-5 rounded-xl bg-slate-50 p-4 text-sm">
        <p className="text-slate-500">Stock actual</p>
        <p className="mt-1 text-xl font-bold text-slate-900">
          {formatQuantity(producto.stock)} {producto.unidad_abreviatura}
        </p>
      </div>

      {error ? (<Alert tone="error" className="mb-5">
          {error}
        </Alert>) : null}

      <form id="ajuste-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Tipo de ajuste" error={errors.direccion?.message} {...register("direccion")}>
            <option value="entrada">Entrada (suma stock)</option>
            <option value="salida">Salida (resta stock)</option>
          </Select>
          <Input label="Cantidad *" inputMode="decimal" placeholder="0.000" error={errors.cantidad?.message} {...register("cantidad")}/>
        </div>

        {puedeVerCostos ? (<Input label="Costo unitario" inputMode="decimal" placeholder="0.0000" hint="Solo se aplica en entradas y recalcula el costo promedio." error={errors.costo_unitario?.message} {...register("costo_unitario")}/>) : null}

        <Input label="Motivo *" placeholder="Ej. merma, reposición, conteo físico" error={errors.motivo?.message} {...register("motivo")}/>

        <Alert tone="info">
          Los movimientos de inventario no se editan ni se eliminan. Si hubo un error, registra el
          ajuste inverso con su motivo.
        </Alert>
      </form>
    </Modal>);
}
