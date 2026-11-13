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
import { addDecimals, multiplyDecimals, percentOf, subtractDecimals } from "../../../lib/decimal";
import { getErrorMessage } from "../../../lib/errors";
import { formatMoney, formatRate } from "../../../lib/money";
import { useSavePedido, useTasaVigente } from "../hooks";

const MODO_LABEL = { usd_bcv: "Dólar BCV", eur_bcv: "Euro BCV", usdt: "USDT", ajuste: "Ajuste (Bs)" };

const monto = z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/, "Usa un monto con hasta 2 decimales");
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
    cliente: z.string().min(1, "Selecciona un cliente"),
    fecha: z.string().min(1, "Indica la fecha"),
    numero_referencia: z.string().max(50),
    tipo_pago: z.enum(["contado", "credito"]),
    modo_tasa: z.enum(["usd_bcv", "eur_bcv", "usdt", "ajuste"]),
    tasa_monto: tasa,
    descuento: monto,
    otros_montos: monto,
    notas: z.string(),
    detalles: z
      .array(
        z.object({
          tipo_item: z.enum(["producto", "combo"]),
          producto: z.string(),
          combo: z.string(),
          cantidad,
          precio_unitario: monto.optional().or(z.literal("")),
          descuento_linea: monto,
          aplica_iva: z.boolean(),
        })
      )
      .min(1, "Agrega al menos una línea"),
  })
  .superRefine((values, ctx) => {
    values.detalles.forEach((d, i) => {
      if (d.tipo_item === "producto" && !d.producto) {
        ctx.addIssue({ code: "custom", path: ["detalles", i, "producto"], message: "Selecciona un producto" });
      }
      if (d.tipo_item === "combo" && !d.combo) {
        ctx.addIssue({ code: "custom", path: ["detalles", i, "combo"], message: "Selecciona un combo" });
      }
    });
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
function lineaToDefault(linea, toDivisa2) {
  const desc = toDivisa2 ? toDivisa2(linea?.descuento_linea ?? "0.00") : (linea?.descuento_linea ?? "0.00");
  const precio = toDivisa2 ? (linea?.precio_unitario ? toDivisa2(linea.precio_unitario) : "") : (linea?.precio_unitario ?? "");
  if (linea?.combo) {
    return { tipo_item: "combo", producto: "", combo: String(linea.combo), cantidad: linea.cantidad, precio_unitario: precio, descuento_linea: desc, aplica_iva: linea.aplica_iva !== false };
  }
  return { tipo_item: "producto", producto: linea?.producto ? String(linea.producto) : "", combo: "", cantidad: linea?.cantidad ?? "1.000", precio_unitario: precio, descuento_linea: desc, aplica_iva: linea?.aplica_iva !== false };
}
function toDefaults(pedido) {
  if (pedido) {
    const tasaDoc = pedido.tasa_cambio || "1";
    const esVes = pedido.moneda === "VES";
    const toDivisa2 = (bs) => {
      const n = Number(bs || 0); const t = Number(tasaDoc || 1);
      if (!Number.isFinite(n) || !Number.isFinite(t) || t === 0) return "0.00";
      return (n / t).toFixed(2);
    };
    return {
      cliente: String(pedido.cliente),
      fecha: pedido.fecha,
      numero_referencia: pedido.numero_referencia ?? "",
      tipo_pago: pedido.tipo_pago,
      modo_tasa: "ajuste",
      tasa_monto: esVes ? "1.000000" : tasaDoc,
      descuento: esVes ? (pedido.descuento ?? "0.00") : toDivisa2(pedido.descuento ?? "0.00"),
      otros_montos: esVes ? (pedido.otros_montos ?? "0.00") : toDivisa2(pedido.otros_montos ?? "0.00"),
      notas: pedido.notas ?? "",
      detalles: (pedido.lineas || []).map((l) => lineaToDefault(l, esVes ? null : toDivisa2)),
    };
  }
  return {
    cliente: "",
    fecha: todayISO(),
    numero_referencia: "",
    tipo_pago: "contado",
    modo_tasa: "usd_bcv",
    tasa_monto: "",
    descuento: "0.00",
    otros_montos: "0.00",
    notas: "",
    detalles: [{ tipo_item: "producto", producto: "", combo: "", cantidad: "1.000", precio_unitario: "", descuento_linea: "0.00", aplica_iva: true }],
  };
}

export function PedidoFormModal({ pedido, clientes, productos, combos, onClose }) {
  const { company } = useCompany();
  const ivaRate = company?.iva_rate ?? "0.00";
  const [error, setError] = useState(null);
  const mutation = useSavePedido();

  const { register, control, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(pedido),
  });

  const { fields, append, remove } = useFieldArray({ control, name: "detalles" });
  const modoTasa = useWatch({ control, name: "modo_tasa" }) ?? "usd_bcv";
  const fecha = useWatch({ control, name: "fecha" }) ?? "";
  const tasaMonto = useWatch({ control, name: "tasa_monto" }) ?? "";
  const descuento = useWatch({ control, name: "descuento" }) ?? "0.00";
  const otrosMontos = useWatch({ control, name: "otros_montos" }) ?? "0.00";
  const detalles = useWatch({ control, name: "detalles" }) ?? [];
  const esAjuste = modoTasa === "ajuste";
  const divisa = baseDivisa(modoTasa);
  const tasaQuery = useTasaVigente("VES", divisa, fecha);
  const tasaDia = tasaQuery.data?.tasa ?? "";

  useEffect(() => {
    if (esAjuste) return;
    if (tasaQuery.isFetched) setValue("tasa_monto", tasaDia || "");
  }, [esAjuste, tasaDia, tasaQuery.isFetched, setValue, modoTasa, fecha]);

  const tasaNum = Number(tasaMonto || 0);
  const factor = esAjuste ? 1 : (Number.isFinite(tasaNum) && tasaNum > 0 ? tasaNum : 0);

  const lineasCalc = detalles.map((d) => {
    const precioDiv = d.precio_unitario || (d.tipo_item === "producto" ? productos.find((p) => String(p.id) === d.producto)?.precio || "0" : combos.find((c) => String(c.id) === d.combo)?.precio || "0");
    const brutoDiv = multiplyDecimals(d.cantidad, precioDiv, 2);
    const baseLineaDiv = subtractDecimals(brutoDiv, d.descuento_linea || "0", 2);
    const baseLineaBs = multiplyDecimals(baseLineaDiv, String(factor || 0), 2);
    const ivaLineaBs = d.aplica_iva !== false ? percentOf(baseLineaBs, ivaRate, 2) : "0.00";
    return { baseLineaBs, ivaLineaBs };
  });
  const subtotalLineasBs = addDecimals(lineasCalc.map((l) => l.baseLineaBs), 2);
  const ivaEstimadoBs = addDecimals(lineasCalc.map((l) => l.ivaLineaBs), 2);
  const descuentoBs = esAjuste ? (descuento || "0.00") : multiplyDecimals(descuento || "0.00", String(factor || 0), 2);
  const otrosMontosBs = esAjuste ? (otrosMontos || "0.00") : multiplyDecimals(otrosMontos || "0.00", String(factor || 0), 2);
  const totalEstimadoBs = subtractDecimals(addDecimals([subtotalLineasBs, ivaEstimadoBs, otrosMontosBs], 2), descuentoBs, 2);
  const sinTasaDelDia = !esAjuste && tasaQuery.isFetched && !tasaDia;

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const t = esAjuste ? 1 : Number(values.tasa_monto || 0);
    const toBs2 = (v) => multiplyDecimals(v || "0.00", String(t || 0), 2);

    const payload = {
      cliente: Number(values.cliente),
      fecha: values.fecha,
      numero_referencia: values.numero_referencia?.trim() || "",
      tipo_pago: values.tipo_pago,
      moneda: "VES",
      tasa_cambio: esAjuste ? "1.000000" : values.tasa_monto,
      descuento: esAjuste ? (values.descuento || "0.00") : toBs2(values.descuento),
      otros_montos: esAjuste ? (values.otros_montos || "0.00") : toBs2(values.otros_montos),
      notas: values.notas.trim(),
      detalles: values.detalles.map((d) => {
        const base = {
          cantidad: d.cantidad,
          descuento_linea: esAjuste ? (d.descuento_linea || "0.00") : toBs2(d.descuento_linea),
          aplica_iva: Boolean(d.aplica_iva),
        };
        if (d.tipo_item === "combo") base.combo = Number(d.combo); else base.producto = Number(d.producto);
        if (d.precio_unitario && d.precio_unitario.trim() !== "") {
          base.precio_unitario = esAjuste ? d.precio_unitario : toBs2(d.precio_unitario);
        }
        return base;
      }),
    };

    try {
      if (pedido) await mutation.mutateAsync({ id: pedido.id, payload }); else await mutation.mutateAsync({ payload });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo guardar el pedido."));
    }
  });

  return (
    <Modal open onClose={onClose} size="xl" title={pedido ? `Editar ${pedido.numero}` : "Nuevo pedido"}
      description="Selecciona la tasa del registro del día (o Ajuste). Los montos de líneas se ingresan en la divisa seleccionada y el documento se calcula/guarda en Bs (VES)."
      footer={<div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">Total (Bs): <span className="font-bold text-slate-900">{formatMoney(totalEstimadoBs, "VES")}</span></p><div className="flex gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="pedido-form" loading={isSubmitting} icon={<Save className="h-4 w-4" />}>Guardar borrador</Button></div></div>}>
      {error ? <Alert tone="error" className="mb-5">{error}</Alert> : null}
      <form id="pedido-form" onSubmit={onSubmit} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Select label="Cliente *" error={errors.cliente?.message} {...register("cliente")}>
            <option value="">Selecciona un cliente</option>
            {clientes.map((c) => (<option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>))}
          </Select>
          <Input label="Fecha *" type="date" error={errors.fecha?.message} {...register("fecha")} />
          <Input label="Número de pedido" placeholder="Referencia del cliente/pedido" error={errors.numero_referencia?.message} {...register("numero_referencia")} />
          <Select label="Tipo de pago *" error={errors.tipo_pago?.message} {...register("tipo_pago")}>
            <option value="contado">Contado</option>
            <option value="credito">Crédito</option>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Select label="Tasa / moneda de cálculo *" error={errors.modo_tasa?.message} {...register("modo_tasa")}>
            <option value="usd_bcv">Dólar BCV</option>
            <option value="eur_bcv">Euro BCV</option>
            <option value="usdt">USDT</option>
            <option value="ajuste">Ajuste</option>
          </Select>
          <div className="sm:col-span-1 xl:col-span-3">
            {esAjuste ? (
              <Input label="Tasa (Bs) - Ajuste *" inputMode="decimal" hint="Modo Ajuste: ingresa manualmente la tasa/monto en Bs (VES)." error={errors.tasa_monto?.message} {...register("tasa_monto")} />
            ) : (
              <Input label={`Tasa ${MODO_LABEL[modoTasa]} (Bs por 1 ${divisa})`} readOnly value={tasaDia ? formatRate(tasaDia) : (tasaQuery.isFetched ? "Sin tasa registrada" : "Cargando...")} hint={tasaDia ? `Tomada del registro del día para ${formatDate(fecha)}.` : "Se usa la tasa registrada del día para calcular en Bs."} error={errors.tasa_monto?.message} />
            )}
            {!esAjuste ? <input type="hidden" {...register("tasa_monto")} /> : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Input label={`Descuento global ${esAjuste ? "(Bs)" : `(${divisa})`}`} inputMode="decimal" error={errors.descuento?.message} {...register("descuento")} />
          <Input label={`Otros montos ${esAjuste ? "(Bs)" : `(${divisa})`}`} inputMode="decimal" hint="Monto adicional sin IVA; se suma al total." error={errors.otros_montos?.message} {...register("otros_montos")} />
          <div className="sm:col-span-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-600">
            <p>Subtotal líneas (Bs): <strong>{formatMoney(subtotalLineasBs, "VES")}</strong></p>
            <p className="mt-1">IVA estimado (Bs): <strong>{formatMoney(ivaEstimadoBs, "VES")}</strong></p>
            <p className="mt-1">Otros montos (Bs): <strong>{formatMoney(otrosMontosBs, "VES")}</strong></p>
            {!esAjuste && factor ? <p className="mt-1 text-xs text-slate-500">Tasa aplicada: 1 {divisa} = {formatRate(String(factor))} Bs</p> : null}
            <p className="mt-2 text-xs text-slate-500">Cálculo y guardado en Bs (VES). El backend recalcula IVA (solo ítems marcados), totales y congela precios/costos.</p>
          </div>
        </div>

        {sinTasaDelDia ? <Alert tone="warning">No hay tasa registrada para {divisa} al {formatDate(fecha)}. Usa <strong>Ajuste</strong> para ingresar la tasa manualmente.</Alert> : null}

        <div className="rounded-xl border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Líneas del pedido</p>
              <p className="text-xs text-slate-500">Montos en {esAjuste ? "Bs (VES)" : divisa}. Marca IVA por ítem (por defecto activo). Totales en Bs (VES).</p>
            </div>
            <Button type="button" variant="secondary" className="px-2.5 py-1.5 text-xs" onClick={() => append({ tipo_item: "producto", producto: "", combo: "", cantidad: "1.000", precio_unitario: "", descuento_linea: "0.00", aplica_iva: true })} icon={<Plus className="h-3.5 w-3.5" />}>Agregar línea</Button>
          </div>
          <div className="space-y-3 p-4">
            {errors.detalles?.message ? <p className="text-xs font-medium text-rose-600">{errors.detalles.message}</p> : null}
            {fields.map((field, index) => {
              const linea = detalles[index] || {};
              const tipoItem = linea.tipo_item || "producto";
              return (
                <div key={field.id} className="space-y-3 rounded-xl bg-slate-50 p-3">
                  <div className="grid gap-3 sm:grid-cols-[140px_1fr_auto] sm:items-end">
                    <Select label="Tipo" {...register(`detalles.${index}.tipo_item`)}>
                      <option value="producto">Producto</option>
                      <option value="combo">Combo</option>
                    </Select>
                    {tipoItem === "combo" ? (
                      <Select label={`Combo ${index + 1}`} error={errors.detalles?.[index]?.combo?.message} {...register(`detalles.${index}.combo`)}>
                        <option value="">Selecciona un combo</option>
                        {combos.map((c) => (<option key={c.id} value={c.id}>{c.sku} · {c.nombre}</option>))}
                      </Select>
                    ) : (
                      <Select label={`Producto ${index + 1}`} error={errors.detalles?.[index]?.producto?.message} {...register(`detalles.${index}.producto`)}>
                        <option value="">Selecciona un producto</option>
                        {productos.map((p) => (<option key={p.id} value={p.id}>{p.sku} · {p.nombre}</option>))}
                      </Select>
                    )}
                    <Button type="button" variant="ghost" className="px-2 py-2 text-rose-600 hover:bg-rose-50" onClick={() => remove(index)} disabled={fields.length === 1} aria-label={`Quitar línea ${index + 1}`} icon={<Trash2 className="h-4 w-4" />}><span className="sr-only">Quitar</span></Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
                    <Input label="Cantidad" inputMode="decimal" error={errors.detalles?.[index]?.cantidad?.message} {...register(`detalles.${index}.cantidad`)} />
                    <Input label={`Precio unit. ${esAjuste ? "(Bs)" : `(${divisa})`}`} inputMode="decimal" hint="Vacío = precio de catálogo (referencia)" error={errors.detalles?.[index]?.precio_unitario?.message} {...register(`detalles.${index}.precio_unitario`)} />
                    <Input label={`Descuento línea ${esAjuste ? "(Bs)" : `(${divisa})`}`} inputMode="decimal" error={errors.detalles?.[index]?.descuento_linea?.message} {...register(`detalles.${index}.descuento_linea`)} />
                    <label className="flex items-center gap-2 pb-2 text-sm font-medium text-slate-700"><input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600" {...register(`detalles.${index}.aplica_iva`)} />IVA</label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <TextArea label="Notas" rows={3} placeholder="Observaciones, instrucciones de entrega, etc." {...register("notas")} />
        <Alert tone="info">El pedido se guarda en Bs (VES). Al confirmarlo se descuenta el inventario y, si es a crédito, se genera la deuda correspondiente. Los precios y costos quedan congelados.</Alert>
      </form>
    </Modal>
  );
}
