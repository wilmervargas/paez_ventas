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
import type { Cliente } from "../../../types/clients";
import { getErrorMessage } from "../../../lib/errors";
import { useSaveCliente } from "../hooks";

const schema = z.object({
  codigo: z.string().max(20, "Máximo 20 caracteres"),
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  rif_cedula: z.string().max(20),
  telefono: z.string().max(20),
  telefono_alt: z.string().max(20),
  email: z.union([z.literal(""), z.string().email("Correo inválido")]),
  direccion: z.string(),
  limite_credito: z
    .string()
    .trim()
    .regex(/^\d{1,12}(\.\d{1,2})?$/, "Usa un monto con hasta 2 decimales"),
  notas: z.string(),
  activo: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

function toDefaults(cliente: Cliente | null): FormValues {
  return {
    codigo: cliente?.codigo ?? "",
    nombre: cliente?.nombre ?? "",
    rif_cedula: cliente?.rif_cedula ?? "",
    telefono: cliente?.telefono ?? "",
    telefono_alt: cliente?.telefono_alt ?? "",
    email: cliente?.email ?? "",
    direccion: cliente?.direccion ?? "",
    limite_credito: cliente?.limite_credito ?? "0.00",
    notas: cliente?.notas ?? "",
    activo: cliente?.activo ?? true,
  };
}

export function ClienteFormModal({
  cliente,
  onClose,
}: {
  cliente: Cliente | null;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const mutation = useSaveCliente();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(cliente),
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const payload = { ...values, codigo: values.codigo || undefined };
    try {
      if (cliente) {
        await mutation.mutateAsync({ id: cliente.id, payload });
      } else {
        await mutation.mutateAsync({ payload });
      }
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo guardar el cliente."));
    }
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={cliente ? "Editar cliente" : "Nuevo cliente"}
      description={
        cliente
          ? "Actualiza los datos de contacto y el límite de crédito."
          : "Registra un cliente. El código se genera automáticamente si lo dejas vacío."
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="cliente-form"
            loading={isSubmitting}
            icon={<Save className="h-4 w-4" />}
          >
            Guardar
          </Button>
        </div>
      }
    >
      {error ? (
        <Alert tone="error" className="mb-5">
          {error}
        </Alert>
      ) : null}

      <form id="cliente-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Nombre *"
            placeholder="Nombre o razón social"
            error={errors.nombre?.message}
            {...register("nombre")}
          />
          <Input
            label="Código"
            placeholder="Automático"
            error={errors.codigo?.message}
            {...register("codigo")}
          />
          <Input
            label="RIF / cédula"
            placeholder="V-12345678"
            error={errors.rif_cedula?.message}
            {...register("rif_cedula")}
          />
          <Input
            label="Límite de crédito"
            inputMode="decimal"
            placeholder="0.00"
            error={errors.limite_credito?.message}
            {...register("limite_credito")}
          />
          <Input
            label="Teléfono"
            placeholder="0414-1234567"
            hint="Se normaliza automáticamente a +58."
            error={errors.telefono?.message}
            {...register("telefono")}
          />
          <Input
            label="Teléfono alterno"
            placeholder="0212-5555555"
            error={errors.telefono_alt?.message}
            {...register("telefono_alt")}
          />
          <Input
            label="Correo electrónico"
            type="email"
            placeholder="cliente@correo.com"
            error={errors.email?.message}
            {...register("email")}
          />
          <label className="flex items-center gap-2 self-end pb-3 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              {...register("activo")}
            />
            Cliente activo
          </label>
        </div>

        <TextArea
          label="Dirección"
          rows={2}
          placeholder="Ciudad, estado, dirección exacta"
          {...register("direccion")}
        />
        <TextArea label="Notas" rows={2} placeholder="Observaciones internas" {...register("notas")} />
      </form>
    </Modal>
  );
}
