import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { Select } from "../../../components/ui/Select";
import { TextArea } from "../../../components/ui/TextArea";
import { useCompany } from "../../../context/company-context";
import { formatDate } from "../../../lib/dates";
import { addDecimals, multiplyDecimals, percentOf } from "../../../lib/decimal";
import { getErrorMessage } from "../../../lib/errors";
import { formatMoney, formatRate } from "../../../lib/money";
import { formatQuantity } from "../../../lib/numbers";
import { useSaveCompra, useTasaVigente } from "../hooks";

const MODO_LABEL = { usd_bcv: "Dólar BCV", eur_bcv: "Euro BCV", usdt: "USDT", ajuste: "Ajuste (Bs)" };

const monto = z.string().trim().regex(/^\d{1,12}(\.\d{1,4})?$/, "Usa un costo con hasta 4 decimales");
const monto2 = z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/, "Usa un monto con hasta 2 decimales");
const cantidad = z
  .string()
  .trim()
  .regex(/^\d{1,11}(\.\d{1,3})?$/, "Usa una cantidad con hasta 3 decimales")
  .refine((value) => !/^0+(?:\.0+)?$/.test(value), "La cantidad debe ser mayor que cero");
const tasa = z
  .string()
  .trim()
  .min(1, "Indica la tasa")
  .regex(/^\d{1,12}(\.\d{1,6})?$/, "Usa una tasa con hasta 6 decimales")
  .refine((value) => Number(value) > 0, "La tasa debe ser mayor que cero");

const schema = z
  .object({
    proveedor: z.string().min(1, "Selecciona un proveedor"),
    fecha: z.string().min(1, "Indica la fecha"),
    numero_referencia: z.string().max(50),
    modo_tasa: z.enum(["usd_bcv", "eur_bcv", "usdt", "ajuste"]),
    tasa_monto: tasa,
    otros_montos: monto2,
    notas: z.string(),
    detalles: z
      .array(z.object({
        producto: z.string().min(1, "Selecciona un producto"),
        cantidad,
        costo_unitario: monto,
        aplica_iva: z.boolean(),
      }))
      .min(1, "Agrega al menos una línea"),
  })
  .superRefine((values, ctx) => {
    const ids = values.detalles.map((d) => d.producto).filter(Boolean);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["detalles"], message: "No repitas el mismo producto en la compra." });
    }
  });

function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function baseDivisa(modo) {
  if (modo === "usd_bcv") return "USD";
  if (modo === "eur_bcv") return "EUR";
  if (modo === "usdt") return "USDT";
  return "USD";
}

function toDefaults(compra) {
  if (compra) {
    const tasaDoc = compra.tasa_cambio || "1";
    // Reconstruir montos en divisa a partir de Bs guardados (Bs / tasa)
    const toDivisa2 = (bs) => {
      const n = Number(bs || 0);
      const t = Number(tasaDoc || 1);
      if (!Number.isFinite(n) || !Number.isFinite(t) || t === 0) return "0.00";
      return (n / t).toFixed(2);
    };
    const toDivisa4 = (bs) => {
      const n = Number(bs || 0);
      const t = Number(tasaDoc || 1);
      if (!Number.isFinite(n) || !Number.isFinite(t) || t === 0) return "0.0000";
      return (n / t).toFixed(4);
    };
    const esVes = compra.moneda === "VES";
    return {
      proveedor: String(compra.proveedor),
      fecha: compra.fecha,
      numero_referencia: compra.numero_referencia ?? "",
      modo_tasa: esVes ? "ajuste" : "ajuste", // edición segura: permite ajustar tasa/montos
      tasa_monto: esVes ? "1.000000" : tasaDoc,
      otros_montos: esVes ? (compra.otros_montos ?? "0.00") : toDivisa2(compra.otros_montos ?? "0.00"),
      notas: compra.notas ?? "",
      detalles: (compra.lineas || []).map((linea) => ({
        producto: String(linea.producto),
        cantidad: linea.cantidad,
        costo_unitario: esVes ? linea.costo_unitario : toDivisa4(linea.costo_unitario),
        aplica_iva: linea.aplica_iva !== false,
      })),
    };
  }
  return {
    proveedor: "",
    fecha: todayISO(),
    numero_referencia: "",
    modo_tasa: "usd_bcv",
    tasa_monto: "",
    otros_montos: "0.00",
    notas: "",
    detalles: [{ producto: "", cantidad: "1.000", costo_unitario: "0.0000", aplica_iva: true }],
  };
}

export function CompraFormModal({ compra, proveedores, productos, onClose }) {
  const { company } = useCompany();
  const ivaRate = company?.iva_rate ?? "16.00";
  const [error, setError] = useState(null);
  const mutation = useSaveCompra();

  const { register, control, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(compra),
  });
  const { fields, append, remove } = useFieldArray({ control, name: "detalles" });

  const modoTasa = useWatch({ control, name: "modo_tasa" }) ?? "usd_bcv";
  const fecha = useWatch({ control, name: "fecha" }) ?? "";
  const tasaMonto = useWatch({ control, name: "tasa_monto" }) ?? "";
  const otrosMontos = useWatch({ control, name: "otros_montos" }) ?? "0.00";
  const detalles = useWatch({ control, name: "detalles" }) ?? [];

  const esAjuste = modoTasa === "ajuste";
  const divisa = baseDivisa(modoTasa);
  // tasa registrada: Bs por 1 USD/EUR/USDT (VES como moneda, base = divisa)
  const tasaQuery = useTasaVigente("VES", divisa, fecha);
  const tasaDia = tasaQuery.data?.tasa ?? "";

  useEffect(() => {
    if (esAjuste) return;
    if (tasaQuery.isFetched) {
      setValue("tasa_monto", tasaDia || "");
    }
  }, [esAjuste, tasaDia, tasaQuery.isFetched, setValue, modoTasa, fecha]);

  const tasaNum = Number(tasaMonto || 0);
  const factor = esAjuste ? 1 : (Number.isFinite(tasaNum) && tasaNum > 0 ? tasaNum : 0);

  // Montos ingresados en divisa (o Bs si ajuste). Convertidos a Bs para totales.
  const subtotalesLineasBs = detalles.map((d) => multiplyDecimals(multiplyDecimals(d.cantidad, d.costo_unitario, 4), String(factor || 0), 2));
  const subtotalBs = addDecimals(subtotalesLineasBs, 2);
  const baseIvaBs = addDecimals(detalles.map((d, i) => (d.aplica_iva !== false ? subtotalesLineasBs[i] || "0.00" : "0.00")), 2);
  const ivaBs = percentOf(baseIvaBs, ivaRate, 2);
  const otrosMontosBs = esAjuste ? (otrosMontos || "0.00") : multiplyDecimals(otrosMontos || "0.00", String(factor || 0), 2);
  const totalBs = addDecimals([subtotalBs, ivaBs, otrosMontosBs], 2);

  const sinCatalogos = proveedores.length === 0 || productos.length === 0;
  const sinTasaDelDia = !esAjuste && tasaQuery.isFetched && !tasaDia;

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const t = esAjuste ? 1 : Number(values.tasa_monto || 0);
    const toBs4 = (v) => multiplyDecimals(v || "0", String(t || 0), 4);
    const toBs2 = (v) => multiplyDecimals(v || "0", String(t || 0), 2);

    const payload = {
      proveedor: Number(values.proveedor),
      fecha: values.fecha,
      numero_referencia: values.numero_referencia?.trim() || "",
      moneda: "VES",
      tasa_cambio: esAjuste ? "1.000000" : values.tasa_monto,
      otros_montos: esAjuste ? (values.otros_montos || "0.00") : toBs2(values.otros_montos),
      notas: values.notas.trim(),
      detalles: values.detalles.map((d) => ({
        producto: Number(d.producto),
        cantidad: d.cantidad,
        costo_unitario: esAjuste ? d.costo_unitario : toBs4(d.costo_unitario),
        aplica_iva: Boolean(d.aplica_iva),
      })),
    };

    try {
      if (compra) await mutation.mutateAsync({ id: compra.id, payload });
      else await mutation.mutateAsync({ payload });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo guardar la compra."));
    }
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={compra ? `Editar ${compra.numero}` : "Nueva compra"}
      description="Selecciona la tasa del registro del día (o Ajuste). Los montos de líneas se ingresan en la divisa seleccionada y el documento se calcula/guarda en Bs (VES)."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">Total (Bs): <span className="font-bold text-slate-900">{formatMoney(totalBs, "VES")}</span></p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit" form="compra-form" loading={isSubmitting} disabled={sinCatalogos} icon={<Save className="h-4 w-4" />}>Guardar borrador</Button>
          </div>
        </div>
      }
    >
      {error ? <Alert tone="error" className="mb-5">{error}</Alert> : null}
      {sinCatalogos ? <Alert tone="warning" className="mb-5">Necesitas al menos un proveedor y un producto activo para registrar compras.</Alert> : null}

      <form id="compra-form" onSubmit={onSubmit} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Select label="Proveedor *" error={errors.proveedor?.message} {...register("proveedor")}>
            <option value="">Selecciona un proveedor</option>
            {proveedores.map((p) => (<option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>))}
          </Select>
          <Input label="Fecha *" type="date" error={errors.fecha?.message} {...register("fecha")} />
          <Input label="N.º orden / factura" placeholder="Factura u orden del proveedor" error={errors.numero_referencia?.message} {...register("numero_referencia")} />
          <Input label={`Otros montos ${esAjuste ? "(Bs)" : `(${divisa})`}`} inputMode="decimal" hint="Monto adicional sin IVA; se suma al total de la factura." error={errors.otros_montos?.message} {...register("otros_montos")} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Select label="Tasa / moneda de cálculo *" error={errors.modo_tasa?.message} {...register("modo_tasa")}>
            <option value="usd_bcv">Dólar BCV</option>
            <option value="eur_bcv">Euro BCV</option>
            <option value="usdt">USDT</option>
            <option value="ajuste">Ajuste</option>
          </Select>
          <div className="sm:col-span-1 xl:col-span-2">
            {esAjuste ? (
              <Input label="Tasa (Bs) - Ajuste *" inputMode="decimal" hint="Modo Ajuste: ingresa manualmente la tasa/monto en Bs (VES)." error={errors.tasa_monto?.message} {...register("tasa_monto")} />
            ) : (
              <Input label={`Tasa ${MODO_LABEL[modoTasa]} (Bs por 1 ${divisa})`} readOnly value={tasaDia ? formatRate(tasaDia) : (tasaQuery.isFetched ? "Sin tasa registrada" : "Cargando...")} hint={tasaDia ? `Tomada del registro del día para ${formatDate(fecha)}.` : "Se usa la tasa registrada del día para calcular en Bs."} error={errors.tasa_monto?.message} />
            )}
            {!esAjuste ? <input type="hidden" {...register("tasa_monto")} /> : null}
          </div>
        </div>

        {sinTasaDelDia ? (
          <Alert tone="warning">No hay tasa registrada para {divisa} al {formatDate(fecha)}. Usa <strong>Ajuste</strong> para ingresar la tasa manualmente.</Alert>
        ) : null}

        <div className="rounded-xl border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Líneas de compra</p>
              <p className="text-xs text-slate-500">Costos en {esAjuste ? "Bs (VES)" : divisa}. IVA por ítem (default activo). Totales calculados y guardados en Bs (VES).</p>
            </div>
            <Button type="button" variant="secondary" className="px-2.5 py-1.5 text-xs" onClick={() => append({ producto: "", cantidad: "1.000", costo_unitario: "0.0000", aplica_iva: true })} icon={<Plus className="h-3.5 w-3.5" />}>Agregar línea</Button>
          </div>
          <div className="space-y-3 p-4">
            {errors.detalles?.message ? <p className="text-xs font-medium text-rose-600">{errors.detalles.message}</p> : null}
            {fields.map((field, index) => {
              const linea = detalles[index];
              const prod = productos.find((p) => String(p.id) === linea?.producto);
              return (
                <div key={field.id} className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_110px_140px_90px_auto] sm:items-start">
                  <Select label={`Producto ${index + 1}`} error={errors.detalles?.[index]?.producto?.message} {...register(`detalles.${index}.producto`)}>
                    <option value="">Selecciona un producto</option>
                    {productos.map((p) => (<option key={p.id} value={p.id}>{p.sku} · {p.nombre}</option>))}
                  </Select>
                  <Input label="Cantidad" inputMode="decimal" error={errors.detalles?.[index]?.cantidad?.message} {...register(`detalles.${index}.cantidad`)} />
                  <Input label={`Costo unit. (${esAjuste ? "Bs" : divisa})`} inputMode="decimal" error={errors.detalles?.[index]?.costo_unitario?.message} {...register(`detalles.${index}.costo_unitario`)} />
                  <label className="flex items-center gap-2 pt-7 text-sm font-medium text-slate-700"><input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600" {...register(`detalles.${index}.aplica_iva`)} />IVA</label>
                  <div className="flex items-end justify-between gap-2 sm:flex-col sm:items-end">
                    <div className="text-right">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Subtotal (Bs)</p>
                      <p className="text-sm font-semibold text-slate-900">{formatMoney(subtotalesLineasBs[index] || "0.00", "VES")}</p>
                      {prod ? <p className="text-xs text-slate-500">Stock: {formatQuantity(prod.stock)} {prod.unidad_abreviatura}</p> : null}
                    </div>
                    <Button type="button" variant="ghost" className="px-2 py-2 text-rose-600 hover:bg-rose-50" onClick={() => remove(index)} disabled={fields.length === 1} aria-label={`Quitar línea ${index + 1}`} icon={<Trash2 className="h-4 w-4" />}><span className="sr-only">Quitar</span></Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <TextArea label="Notas" rows={3} placeholder="Condiciones, observaciones, detalles adicionales" {...register("notas")} />
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <div className="flex justify-between gap-3 py-1 text-slate-600"><span>Subtotal (Bs)</span><span className="font-medium text-slate-900">{formatMoney(subtotalBs, "VES")}</span></div>
            <div className="flex justify-between gap-3 py-1 text-slate-600"><span>IVA ({ivaRate}%)</span><span className="font-medium text-slate-900">{formatMoney(ivaBs, "VES")}</span></div>
            <div className="flex justify-between gap-3 py-1 text-slate-600"><span>Otros montos (Bs)</span><span className="font-medium text-slate-900">{formatMoney(otrosMontosBs, "VES")}</span></div>
            <div className="mt-2 flex justify-between gap-3 border-t border-slate-200 pt-3"><span className="font-semibold text-slate-900">Total (Bs)</span><span className="text-base font-bold text-indigo-700">{formatMoney(totalBs, "VES")}</span></div>
            {!esAjuste && factor ? <p className="mt-2 text-xs text-slate-500">Tasa aplicada: 1 {divisa} = {formatRate(String(factor))} Bs</p> : null}
            <p className="mt-3 text-xs text-slate-500">Cálculo en Bs (VES) usando la tasa seleccionada. El IVA aplica solo a ítems marcados; "Otros montos" se suma al total. El backend recalcula y congela los montos.</p>
          </div>
        </div>

        <Alert tone="info">El documento se guarda en Bs (VES). Al recibir la compra se generan movimientos al kardex y se recalcula el costo promedio. Una compra recibida no se edita: se anula con su reverso.</Alert>
      </form>
    </Modal>
  );
}
