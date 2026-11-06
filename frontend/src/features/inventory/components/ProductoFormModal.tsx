import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Save } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { Select } from "../../../components/ui/Select";
import { getErrorMessage } from "../../../lib/errors";
import type { CategoriaProducto, Producto, UnidadMedida } from "../../../types/inventory";
import { useSaveProducto } from "../hooks";

const monto = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Usa un monto con hasta 2 decimales");

const cantidad = z
  .string()
  .trim()
  .regex(/^\d{1,11}(\.\d{1,3})?$/, "Usa hasta 3 decimales");

const schema = z.object({
  sku: z.string().trim().min(1, "El SKU es obligatorio").max(50),
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  categoria: z.string().min(1, "Selecciona una categoría"),
  unidad: z.string().min(1, "Selecciona una unidad"),
  costo: monto,
  precio: monto,
  stock_minimo: cantidad,
  stock_inicial: cantidad,
  iva_aplicable: z.boolean(),
  activo: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

function toDefaults(producto: Producto | null): FormValues {
  return {
    sku: producto?.sku ?? "",
    nombre: producto?.nombre ?? "",
    categoria: producto ? String(producto.categoria) : "",
    unidad: producto ? String(producto.unidad) : "",
    costo: producto?.costo ?? "0.00",
    precio: producto?.precio ?? "0.00",
    stock_minimo: producto?.stock_minimo ?? "0.000",
    stock_inicial: "0.000",
    iva_aplicable: producto?.iva_aplicable ?? true,
    activo: producto?.activo ?? true,
  };
}

export function ProductoFormModal({
  producto,
  categorias,
  unidades,
  onClose,
}: {
  producto: Producto | null;
  categorias: CategoriaProducto[];
  unidades: UnidadMedida[];
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [imagen, setImagen] = useState<File | null>(null);
  const [imagenKey, setImagenKey] = useState(0);
  const mutation = useSaveProducto();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(producto),
  });

  function handleImagen(event: ChangeEvent<HTMLInputElement>) {
    setImagen(event.target.files?.[0] ?? null);
  }

  const sinCatalogos = categorias.length === 0 || unidades.length === 0;

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const payload = {
      sku: values.sku,
      nombre: values.nombre,
      categoria: Number(values.categoria),
      unidad: Number(values.unidad),
      costo: values.costo,
      precio: values.precio,
      stock_minimo: values.stock_minimo,
      stock_inicial: producto ? undefined : values.stock_inicial,
      iva_aplicable: values.iva_aplicable,
      activo: values.activo,
      imagen,
    };

    try {
      if (producto) {
        await mutation.mutateAsync({ id: producto.id, payload });
      } else {
        await mutation.mutateAsync({ payload });
      }
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo guardar el producto."));
    }
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={producto ? "Editar producto" : "Nuevo producto"}
      description={
        producto
          ? "El stock solo cambia mediante ajustes o movimientos del kardex."
          : "El stock inicial se registra como un ajuste de inventario."
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="producto-form"
            loading={isSubmitting}
            disabled={sinCatalogos}
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

      {sinCatalogos ? (
        <Alert tone="warning" className="mb-5">
          Antes de crear productos necesitas al menos una categoría y una unidad de medida. Puedes
          agregarlas en la pestaña Catálogos.
        </Alert>
      ) : null}

      <form id="producto-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="SKU *"
            placeholder="PROD-001"
            error={errors.sku?.message}
            {...register("sku")}
          />
          <Input
            label="Nombre *"
            placeholder="Nombre del producto"
            error={errors.nombre?.message}
            {...register("nombre")}
          />
          <Select label="Categoría *" error={errors.categoria?.message} {...register("categoria")}>
            <option value="">Selecciona una categoría</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </Select>
          <Select label="Unidad *" error={errors.unidad?.message} {...register("unidad")}>
            <option value="">Selecciona una unidad</option>
            {unidades.map((unidad) => (
              <option key={unidad.id} value={unidad.id}>
                {unidad.nombre} ({unidad.abreviatura})
              </option>
            ))}
          </Select>
          <Input
            label="Costo"
            inputMode="decimal"
            placeholder="0.00"
            hint="Visible solo para administración."
            error={errors.costo?.message}
            {...register("costo")}
          />
          <Input
            label="Precio de venta"
            inputMode="decimal"
            placeholder="0.00"
            error={errors.precio?.message}
            {...register("precio")}
          />
          <Input
            label="Stock mínimo"
            inputMode="decimal"
            placeholder="0.000"
            error={errors.stock_minimo?.message}
            {...register("stock_minimo")}
          />
          {!producto ? (
            <Input
              label="Stock inicial"
              inputMode="decimal"
              placeholder="0.000"
              hint="Genera un movimiento de ajuste."
              error={errors.stock_inicial?.message}
              {...register("stock_inicial")}
            />
          ) : null}
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-slate-300 p-4 sm:flex-row sm:items-center">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {producto?.imagen_url ? (
              <img
                src={producto.imagen_url}
                alt={`Imagen de ${producto.nombre}`}
                className="h-full w-full object-contain"
              />
            ) : (
              <ImagePlus className="h-5 w-5 text-slate-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">Imagen</p>
            <p className="mt-0.5 text-xs text-slate-500">
              PNG, JPG o WEBP de hasta 2 MB. {imagen ? `Seleccionada: ${imagen.name}` : ""}
            </p>
            <input
              key={imagenKey}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleImagen}
              className="mt-3 block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
            />
          </div>
          {imagen ? (
            <Button
              type="button"
              variant="ghost"
              className="text-xs"
              onClick={() => {
                setImagen(null);
                setImagenKey((current) => current + 1);
              }}
            >
              Quitar
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              {...register("iva_aplicable")}
            />
            Aplica IVA
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              {...register("activo")}
            />
            Producto activo
          </label>
        </div>
      </form>
    </Modal>
  );
}
