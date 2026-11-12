import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { TextArea } from "../../../components/ui/TextArea";
import { getErrorMessage } from "../../../lib/errors";
import { useSaveProveedor } from "../hooks";
const schema = z.object({
    codigo: z.string().max(20, "Máximo 20 caracteres"),
    nombre: z.string().trim().min(1, "El nombre es obligatorio").max(200),
    rif: z.string().max(20),
    telefono: z.string().max(20),
    email: z.union([z.literal(""), z.string().email("Correo inválido")]),
    direccion: z.string(),
    activo: z.boolean(),
});
function toDefaults(proveedor) {
    return {
        codigo: proveedor?.codigo ?? "",
        nombre: proveedor?.nombre ?? "",
        rif: proveedor?.rif ?? "",
        telefono: proveedor?.telefono ?? "",
        email: proveedor?.email ?? "",
        direccion: proveedor?.direccion ?? "",
        activo: proveedor?.activo ?? true,
    };
}
export function ProveedorFormModal({ proveedor, onClose, }) {
    const [error, setError] = useState(null);
    const mutation = useSaveProveedor();
    const { register, handleSubmit, formState: { errors, isSubmitting }, } = useForm({
        resolver: zodResolver(schema),
        defaultValues: toDefaults(proveedor),
    });
    const onSubmit = handleSubmit(async (values) => {
        setError(null);
        const payload = { ...values, codigo: values.codigo || undefined };
        try {
            if (proveedor) {
                await mutation.mutateAsync({ id: proveedor.id, payload });
            }
            else {
                await mutation.mutateAsync({ payload });
            }
            onClose();
        }
        catch (err) {
            setError(getErrorMessage(err, "No se pudo guardar el proveedor."));
        }
    });
    return (<Modal open onClose={onClose} size="lg" title={proveedor ? "Editar proveedor" : "Nuevo proveedor"} description="Los proveedores se usan en el registro de compras." footer={<div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="proveedor-form" loading={isSubmitting} icon={<Save className="h-4 w-4"/>}>
            Guardar
          </Button>
        </div>}>
      {error ? (<Alert tone="error" className="mb-5">
          {error}
        </Alert>) : null}

      <form id="proveedor-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nombre *" placeholder="Razón social del proveedor" error={errors.nombre?.message} {...register("nombre")}/>
          <Input label="Código" placeholder="Automático" error={errors.codigo?.message} {...register("codigo")}/>
          <Input label="RIF" placeholder="J-12345678-9" error={errors.rif?.message} {...register("rif")}/>
          <Input label="Teléfono" placeholder="0212-5555555" error={errors.telefono?.message} {...register("telefono")}/>
          <Input label="Correo electrónico" type="email" placeholder="proveedor@correo.com" error={errors.email?.message} {...register("email")}/>
          <label className="flex items-center gap-2 self-end pb-3 text-sm font-medium text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" {...register("activo")}/>
            Proveedor activo
          </label>
        </div>

        <TextArea label="Dirección" rows={2} placeholder="Ciudad, estado, dirección exacta" {...register("direccion")}/>
      </form>
    </Modal>);
}
