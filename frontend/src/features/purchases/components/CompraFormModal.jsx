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
import { addDecimals, divideDecimals, multiplyDecimals, percentOf } from "../../../lib/decimal";
import { getErrorMessage } from "../../../lib/errors";
import { formatMoney, formatRate } from "../../../lib/money";
import { formatQuantity } from "../../../lib/numbers";
import { useSaveCompra, useTasaVigente } from "../hooks";
const monto = z
    .string()
    .trim()
    .regex(/^\d{1,12}(\.\d{1,4})?$/, "Usa un costo con hasta 4 decimales");
const cantidad = z
    .string()
    .trim()
    .regex(/^\d{1,11}(\.\d{1,3})?$/, "Usa una cantidad con hasta 3 decimales")
    .refine((value) => !/^0+(?:\.0+)?$/.test(value), "La cantidad debe ser mayor que cero");
const tasa = z
    .string()
    .trim()
    .min(1, "Indica la tasa o registra la tasa del día")
    .regex(/^\d{1,12}(\.\d{1,6})?$/, "Usa una tasa con hasta 6 decimales")
    .refine((value) => Number(value) > 0, "La tasa debe ser mayor que cero");
const schema = z
    .object({
    proveedor: z.string().min(1, "Selecciona un proveedor"),
    fecha: z.string().min(1, "Indica la fecha"),
    moneda: z
        .string()
        .trim()
        .regex(/^[A-Za-z]{3}$/, "Usa un código ISO de 3 letras (ej. USD)"),
    tasa_cambio: tasa,
    notas: z.string(),
    detalles: z
        .array(z.object({
        producto: z.string().min(1, "Selecciona un producto"),
        cantidad,
        costo_unitario: monto,
    }))
        .min(1, "Agrega al menos una línea"),
})
    .superRefine((values, ctx) => {
    const ids = values.detalles.map((detalle) => detalle.producto).filter(Boolean);
    if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
            code: "custom",
            path: ["detalles"],
            message: "No repitas el mismo producto en la compra.",
        });
    }
});
function todayISO() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Caracas",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}
function toDefaults(compra, monedaBase) {
    if (compra) {
        return {
            proveedor: String(compra.proveedor),
            fecha: compra.fecha,
            moneda: compra.moneda,
            tasa_cambio: compra.tasa_cambio,
            notas: compra.notas,
            detalles: compra.lineas.map((linea) => ({
                producto: String(linea.producto),
                cantidad: linea.cantidad,
                costo_unitario: linea.costo_unitario,
            })),
        };
    }
    return {
        proveedor: "",
        fecha: todayISO(),
        moneda: monedaBase,
        tasa_cambio: "1.000000",
        notas: "",
        detalles: [{ producto: "", cantidad: "1.000", costo_unitario: "0.0000" }],
    };
}
const FUENTE_LABEL = {
    bcv: "BCV",
    usdt: "USDT",
    manual: "Manual",
};
export function CompraFormModal({ compra, proveedores, productos, onClose, }) {
    const { company } = useCompany();
    const monedaBase = company?.moneda_base ?? "USD";
    const ivaRate = company?.iva_rate ?? "0.00";
    const [error, setError] = useState(null);
    // Una compra existente conserva su tasa congelada; una nueva arranca en
    // automático para tomar la tasa del histórico del día del documento.
    const [tasaManual, setTasaManual] = useState(Boolean(compra));
    const mutation = useSaveCompra();
    const { register, control, handleSubmit, setValue, formState: { errors, isSubmitting }, } = useForm({
        resolver: zodResolver(schema),
        defaultValues: toDefaults(compra, monedaBase),
    });
    const { fields, append, remove } = useFieldArray({ control, name: "detalles" });
    const monedaValue = useWatch({ control, name: "moneda" }) ?? monedaBase;
    const moneda = monedaValue.trim().toUpperCase();
    const fecha = useWatch({ control, name: "fecha" }) ?? "";
    const tasaValue = useWatch({ control, name: "tasa_cambio" }) ?? "";
    const detalles = useWatch({ control, name: "detalles" }) ?? [];
    const esMonedaBase = moneda === monedaBase.toUpperCase();
    const tasaQuery = useTasaVigente(moneda, monedaBase.toUpperCase(), fecha);
    // Tasa activa del dólar BCV: se usa para expresar los montos en bolívares.
    const tasaBcvQuery = useTasaVigente("VES", "USD", fecha);
    const tasaBcv = tasaBcvQuery.data?.tasa ?? "";
    useEffect(() => {
        if (tasaManual) {
            return;
        }
        if (esMonedaBase) {
            setValue("tasa_cambio", "1.000000");
            return;
        }
        if (tasaQuery.isFetched) {
            // Si no hay tasa histórica para esa fecha, se limpia para exigir una
            // tasa manual; nunca se arrastra la de otra fecha o moneda.
            setValue("tasa_cambio", tasaQuery.data?.tasa ?? "");
        }
    }, [esMonedaBase, setValue, tasaManual, tasaQuery.data, tasaQuery.isFetched]);
    const subtotal = addDecimals(detalles.map((detalle) => multiplyDecimals(detalle.cantidad, detalle.costo_unitario, 2)), 2);
    const iva = percentOf(subtotal, ivaRate, 2);
    const total = addDecimals([subtotal, iva], 2);
    const totalBase = divideDecimals(total, tasaValue || "1", 2);
    const totalVes = moneda === "VES" ? total : tasaBcv ? multiplyDecimals(totalBase, tasaBcv, 2) : "";
    const totalUsd = totalBase;
    const sinCatalogos = proveedores.length === 0 || productos.length === 0;
    const sinTasaDelDia = !tasaManual && !esMonedaBase && tasaQuery.isFetched && !tasaQuery.data;
    const sinTasaBcv = tasaBcvQuery.isFetched && !tasaBcvQuery.data;
    const onSubmit = handleSubmit(async (values) => {
        setError(null);
        const payload = {
            proveedor: Number(values.proveedor),
            fecha: values.fecha,
            moneda: values.moneda.trim().toUpperCase(),
            notas: values.notas.trim(),
            detalles: values.detalles.map((detalle) => ({
                producto: Number(detalle.producto),
                cantidad: detalle.cantidad,
                costo_unitario: detalle.costo_unitario,
            })),
        };
        // En modo automático se omite la tasa: el backend la resuelve desde el
        // histórico con la fecha del documento en la misma transacción.
        if (tasaManual) {
            payload.tasa_cambio = values.tasa_cambio;
        }
        try {
            if (compra) {
                await mutation.mutateAsync({ id: compra.id, payload });
            }
            else {
                await mutation.mutateAsync({ payload });
            }
            onClose();
        }
        catch (err) {
            setError(getErrorMessage(err, "No se pudo guardar la compra."));
        }
    });
    return (<Modal open onClose={onClose} size="xl" title={compra ? `Editar ${compra.numero}` : "Nueva compra"} description={compra
            ? "Solo las compras en borrador se pueden editar. La tasa guardada se conserva."
            : "La tasa del día se carga sola y queda congelada junto con la fecha del documento."} footer={<div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            Total estimado:{" "}
            <span className="font-bold text-slate-900">{formatMoney(total, moneda)}</span>
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" form="compra-form" loading={isSubmitting} disabled={sinCatalogos} icon={<Save className="h-4 w-4"/>}>
              Guardar borrador
            </Button>
          </div>
        </div>}>
      {error ? (<Alert tone="error" className="mb-5">
          {error}
        </Alert>) : null}

      {sinCatalogos ? (<Alert tone="warning" className="mb-5">
          Necesitas al menos un proveedor y un producto activo para registrar compras.
        </Alert>) : null}

      <form id="compra-form" onSubmit={onSubmit} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Select label="Proveedor *" error={errors.proveedor?.message} {...register("proveedor")}>
            <option value="">Selecciona un proveedor</option>
            {proveedores.map((proveedor) => (<option key={proveedor.id} value={proveedor.id}>
                {proveedor.codigo} · {proveedor.nombre}
              </option>))}
          </Select>
          <Input label="Fecha *" type="date" error={errors.fecha?.message} {...register("fecha")}/>
          <Input label="Moneda" maxLength={3} placeholder="USD" error={errors.moneda?.message} {...register("moneda")}/>
          <div>
            {esMonedaBase ? (<Input label="Tasa BCV del día" value={tasaBcv ? formatRate(tasaBcv) : "Sin tasa registrada"} readOnly hint={tasaBcvQuery.data
                ? `Fuente: ${FUENTE_LABEL[tasaBcvQuery.data.fuente] ?? tasaBcvQuery.data.fuente} · ${formatDate(fecha)}. Se usa para los montos en bolívares.`
                : "Registra la tasa del dólar en Tasas de cambio para ver montos en Bs."}/>) : (<>
                <Input label={moneda === "VES" ? "Tasa BCV (Bs por 1 USD)" : "Tasa del documento"} inputMode="decimal" hint={tasaManual
                ? "Tasa manual: se congela en la compra."
                : tasaQuery.data
                    ? `Tasa del día · ${FUENTE_LABEL[tasaQuery.data.fuente] ?? tasaQuery.data.fuente}.`
                    : "Se carga la tasa vigente del día del documento."} error={errors.tasa_cambio?.message} {...register("tasa_cambio", { onChange: () => setTasaManual(true) })}/>
                <button type="button" className="mt-1 text-xs font-medium text-indigo-600 hover:underline disabled:text-slate-400 disabled:no-underline" onClick={() => setTasaManual(false)} disabled={!tasaManual}>
                  Usar tasa del día
                </button>
                {moneda !== "VES" ? (<p className="mt-1 text-xs text-slate-500">
                    Tasa BCV del día: {tasaBcv ? formatRate(tasaBcv) : "—"}
                  </p>) : null}
              </>)}
          </div>
        </div>

        {sinTasaDelDia ? (<Alert tone="warning">
            No hay tasa registrada para {moneda} al {formatDate(fecha)}. Registra la tasa del día en{" "}
            <strong>Tasas de cambio</strong> o escribe una tasa manual para esta compra.
          </Alert>) : null}

        {!sinTasaDelDia && sinTasaBcv ? (<Alert tone="warning">
            No hay tasa BCV del dólar registrada para el {formatDate(fecha)}. La compra se puede
            guardar, pero no se mostrará su equivalente en bolívares. Regístrala en{" "}
            <strong>Tasas de cambio</strong>.
          </Alert>) : null}

        <div className="rounded-xl border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Líneas de compra</p>
              <p className="text-xs text-slate-500">
                El costo unitario se congela en este documento.
              </p>
            </div>
            <Button type="button" variant="secondary" className="px-2.5 py-1.5 text-xs" onClick={() => append({ producto: "", cantidad: "1.000", costo_unitario: "0.0000" })} icon={<Plus className="h-3.5 w-3.5"/>}>
              Agregar línea
            </Button>
          </div>

          <div className="space-y-3 p-4">
            {errors.detalles?.message ? (<p className="text-xs font-medium text-rose-600">{errors.detalles.message}</p>) : null}

            {fields.map((field, index) => {
            const linea = detalles[index];
            const productoSeleccionado = productos.find((producto) => String(producto.id) === linea?.producto);
            const subtotalLinea = multiplyDecimals(linea?.cantidad ?? "0", linea?.costo_unitario ?? "0", 2);
            return (<div key={field.id} className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_110px_130px_auto] sm:items-start">
                  <Select label={`Producto ${index + 1}`} error={errors.detalles?.[index]?.producto?.message} {...register(`detalles.${index}.producto`)}>
                    <option value="">Selecciona un producto</option>
                    {productos.map((producto) => (<option key={producto.id} value={producto.id}>
                        {producto.sku} · {producto.nombre}
                      </option>))}
                  </Select>
                  <Input label="Cantidad" inputMode="decimal" error={errors.detalles?.[index]?.cantidad?.message} {...register(`detalles.${index}.cantidad`)}/>
                  <Input label="Costo unit." inputMode="decimal" error={errors.detalles?.[index]?.costo_unitario?.message} {...register(`detalles.${index}.costo_unitario`)}/>
                  <div className="flex items-end justify-between gap-2 sm:flex-col sm:items-end">
                    <div className="text-right">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        Subtotal
                      </p>
                      <p className="text-sm font-semibold text-slate-900">
                        {formatMoney(subtotalLinea, moneda)}
                      </p>
                      {productoSeleccionado ? (<p className="text-xs text-slate-500">
                          Stock: {formatQuantity(productoSeleccionado.stock)}{" "}
                          {productoSeleccionado.unidad_abreviatura}
                        </p>) : null}
                    </div>
                    <Button type="button" variant="ghost" className="px-2 py-2 text-rose-600 hover:bg-rose-50" onClick={() => remove(index)} disabled={fields.length === 1} aria-label={`Quitar línea ${index + 1}`} icon={<Trash2 className="h-4 w-4"/>}>
                      <span className="sr-only">Quitar</span>
                    </Button>
                  </div>
                </div>);
        })}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <TextArea label="Notas" rows={3} placeholder="Número de factura del proveedor, condiciones, observaciones" {...register("notas")}/>

          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <div className="flex justify-between gap-3 py-1 text-slate-600">
              <span>Subtotal</span>
              <span className="font-medium text-slate-900">{formatMoney(subtotal, moneda)}</span>
            </div>
            <div className="flex justify-between gap-3 py-1 text-slate-600">
              <span>IVA ({ivaRate}%)</span>
              <span className="font-medium text-slate-900">{formatMoney(iva, moneda)}</span>
            </div>
            <div className="mt-2 flex justify-between gap-3 border-t border-slate-200 pt-3">
              <span className="font-semibold text-slate-900">Total</span>
              <span className="text-base font-bold text-indigo-700">
                {formatMoney(total, moneda)}
              </span>
            </div>
            {!esMonedaBase && Number(tasaValue) > 0 ? (<p className="mt-2 text-xs text-slate-500">
                1 {monedaBase} = {formatRate(tasaValue, moneda)}
              </p>) : null}
            {moneda !== "VES" && totalVes ? (<div className="mt-2 flex justify-between gap-3 border-t border-slate-200 pt-2 text-xs text-slate-500">
                <span>En Bs (BCV)</span>
                <span className="font-medium text-slate-700">{formatMoney(totalVes, "VES")}</span>
              </div>) : null}
            {moneda !== "USD" && Number(tasaValue) > 0 && totalUsd ? (<div className="flex justify-between gap-3 text-xs text-slate-500">
                <span>En USD BCV</span>
                <span className="font-medium text-slate-700">{formatMoney(totalUsd, "USD")}</span>
              </div>) : null}
            {tasaBcv ? (<p className="mt-2 text-xs text-slate-500">Tasa BCV: {formatRate(tasaBcv)}</p>) : null}
            <p className="mt-3 text-xs text-slate-500">
              Cálculo de vista previa. El backend recalcula y congela la fecha, la tasa y los montos
              al guardar.
            </p>
          </div>
        </div>

        <Alert tone="info">
          La fecha y la tasa quedan guardadas en la compra: cambiar la tasa después no altera este
          documento. Al recibirla se generan movimientos de entrada al kardex y se recalcula el
          costo promedio del producto. Una compra recibida no se edita: se anula con su reverso.
        </Alert>
      </form>
    </Modal>);
}
