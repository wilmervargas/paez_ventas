import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { Select } from "../../../components/ui/Select";
import { getErrorMessage } from "../../../lib/errors";
import { formatQuantity } from "../../../lib/numbers";
import type { Combo, Producto } from "../../../types/inventory";
import { useSaveCombo } from "../hooks";

const componenteSchema = z.object({
  producto: z.string().min(1, "Selecciona un producto"),
  cantidad: z
    .string()
    .trim()
    .regex(/^\d{1,11}(\.\d{1,3})?$/, "Usa hasta 3 decimales")
    .refine((value) => Number(value) > 0, "La cantidad debe ser mayor que cero"),
});

const schema = z
  .object({
    sku: z.string().trim().min(1, "El SKU es obligatorio").max(50),
    nombre: z.string().trim().min(1, "El nombre es obligatorio").max(200),
    precio: z
      .string()
      .trim()
      .regex(/^\d{1,12}(\.\d{1,2})?$/, "Usa un monto con hasta 2 decimales"),
    activo: z.boolean(),
    componentes: z.array(componenteSchema).min(1, "Agrega al menos un componente"),
  })
  .superRefine((values, ctx) => {
    const ids = values.componentes.map((componente) => componente.producto).filter(Boolean);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        path: ["componentes"],
        message: "No repitas el mismo producto en el combo.",
      });
    }
  });

type FormValues = z.infer<typeof schema>;

function toDefaults(combo: Combo | null): FormValues {
  return {
    sku: combo?.sku ?? "",
    nombre: combo?.nombre ?? "",
    precio: combo?.precio ?? "0.00",
    activo: combo?.activo ?? true,
    componentes:
      combo && combo.detalle.length > 0
        ? combo.detalle.map((detalle) => ({
            producto: String(detalle.producto.id),
            cantidad: detalle.cantidad,
          }))
        : [{ producto: "", cantidad: "1.000" }],
  };
}

export function ComboFormModal({
  combo,
  productos,
  onClose,
}: {
  combo: Combo | null;
  productos: Producto[];
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const mutation = useSaveCombo();

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(combo),
  });

  const { fields, append, remove } = useFieldArray({ control, name: "componentes" });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const payload = {
        sku: values.sku,
        nombre: values.nombre,
        precio: values.precio,
        activo: values.activo,
        componentes: values.componentes.map((componente) => ({
          producto: Number(componente.producto),
          cantidad: componente.cantidad,
        })),
      };
      if (combo) {
        await mutation.mutateAsync({ id: combo.id, payload });
      } else {
        await mutation.mutateAsync({ payload });
      }
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo guardar el combo."));
    }
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={combo ? "Editar combo" : "Nuevo combo"}
      description="Un combo es virtual: su disponibilidad depende del stock de sus componentes."
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="combo-form"
            loading={isSubmitting}
            disabled={productos.length === 0}
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

      {productos.length === 0 ? (
        <Alert tone="warning" className="mb-5">
          No hay productos activos disponibles. Crea productos antes de armar un combo.
        </Alert>
      ) : null}

      <form id="combo-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="SKU *"
            placeholder="COMBO-001"
            error={errors.sku?.message}
            {...register("sku")}
          />
          <Input
            label="Nombre *"
            placeholder="Nombre del combo"
            error={errors.nombre?.message}
            {...register("nombre")}
          />
          <Input
            label="Precio del combo"
            inputMode="decimal"
            placeholder="0.00"
            error={errors.precio?.message}
            {...register("precio")}
          />
          <label className="flex items-center gap-2 self-end pb-3 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              {...register("activo")}
            />
            Combo activo
          </label>
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Componentes</p>
              <p className="text-xs text-slate-500">Cantidad de cada producto incluida en el combo.</p>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="px-2.5 py-1.5 text-xs"
              onClick={() => append({ producto: "", cantidad: "1.000" })}
              icon={<Plus className="h-3.5 w-3.5" />}
            >
              Agregar
            </Button>
          </div>

          {errors.componentes?.message ? (
            <p className="mb-2 text-xs font-medium text-rose-600">{errors.componentes.message}</p>
          ) : null}

          <div className="space-y-2">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="grid gap-2 sm:grid-cols-[1fr_130px_auto] sm:items-start"
              >
                <Select
                  label={`Producto ${index + 1}`}
                  error={errors.componentes?.[index]?.producto?.message}
                  {...register(`componentes.${index}.producto`)}
                >
                  <option value="">Selecciona un producto</option>
                  {productos.map((producto) => (
                    <option key={producto.id} value={producto.id}>
                      {producto.sku} · {producto.nombre} ({formatQuantity(producto.stock)}{" "}
                      {producto.unidad_abreviatura})
                    </option>
                  ))}
                </Select>
                <Input
                  label="Cantidad"
                  inputMode="decimal"
                  placeholder="1.000"
                  error={errors.componentes?.[index]?.cantidad?.message}
                  {...register(`componentes.${index}.cantidad`)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-0.5 px-2 py-2.5 text-rose-600 hover:bg-rose-50 sm:mt-7"
                  onClick={() => remove(index)}
                  disabled={fields.length === 1}
                  aria-label={`Quitar componente ${index + 1}`}
                  icon={<Trash2 className="h-4 w-4" />}
                >
                  <span className="sr-only">Quitar</span>
                </Button>
              </div>
            ))}
          </div>
        </div>

        <Alert tone="info">
          Al vender un combo se descuenta el stock de cada componente. La composición se congela en
          el pedido para conservar el historial.
        </Alert>
      </form>
    </Modal>
  );
}
