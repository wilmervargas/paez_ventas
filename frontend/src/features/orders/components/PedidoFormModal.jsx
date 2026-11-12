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
import { addDecimals, divideDecimals, multiplyDecimals, subtractDecimals } from "../../../lib/decimal";
import { getErrorMessage } from "../../../lib/errors";
import { formatMoney, formatRate } from "../../../lib/money";
import { useSavePedido, useTasaVigente } from "../hooks";

const monto = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Usa un monto con hasta 2 decimales");
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
    cliente: z.string().min(1, "Selecciona un cliente"),
    fecha: z.string().min(1, "Indica la fecha"),
    tipo_pago: z.enum(["contado", "credito"]),
    moneda: z.string().trim().regex(/^[A-Za-z]{3}$/, "Usa un código ISO de 3 letras"),
    tasa_cambio: tasa,
    descuento: monto,
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
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function lineaToDefault(linea) {
  if (linea?.combo) {
    return {
      tipo_item: "combo",
      producto: "",
      combo: String(linea.combo),
      cantidad: linea.cantidad,
      precio_unitario: linea.precio_unitario ?? "",
      descuento_linea: linea.descuento_linea ?? "0.00",
    };
  }
  return {
    tipo_item: "producto",
    producto: linea?.producto ? String(linea.producto) : "",
    combo: "",
    cantidad: linea?.cantidad ?? "1.000",
    precio_unitario: linea?.precio_unitario ?? "",
    descuento_linea: linea?.descuento_linea ?? "0.00",
  };
}

function toDefaults(pedido, monedaBase) {
  if (pedido) {
    return {
      cliente: String(pedido.cliente),
      fecha: pedido.fecha,
      tipo_pago: pedido.tipo_pago,
      moneda: pedido.moneda,
      tasa_cambio: pedido.tasa_cambio,
      descuento: pedido.descuento ?? "0.00",
      notas: pedido.notas ?? "",
      detalles: (pedido.lineas || []).map(lineaToDefault),
    };
  }
  return {
    cliente: "",
    fecha: todayISO(),
    tipo_pago: "contado",
    moneda: monedaBase,
    tasa_cambio: "1.000000",
    descuento: "0.00",
    notas: "",
    detalles: [
      {
        tipo_item: "producto",
        producto: "",
        combo: "",
        cantidad: "1.000",
        precio_unitario: "",
        descuento_linea: "0.00",
      },
    ],
  };
}

const FUENTE_LABEL = { bcv: "BCV", usdt: "USDT", manual: "Manual" };

export function PedidoFormModal({ pedido, clientes, productos, combos, onClose }) {
  const { company } = useCompany();
  const monedaBase = company?.moneda_base ?? "USD";
  const [error, setError] = useState(null);
  const [tasaManual, setTasaManual] = useState(Boolean(pedido));
  const mutation = useSavePedido();

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: toDefaults(pedido, monedaBase),
  });

  const { fields, append, remove } = useFieldArray({ control, name: "detalles" });
  const monedaValue = useWatch({ control, name: "moneda" }) ?? monedaBase;
  const moneda = monedaValue.trim().toUpperCase();
  const fecha = useWatch({ control, name: "fecha" }) ?? "";
  const tasaValue = useWatch({ control, name: "tasa_cambio" }) ?? "";
  const descuentoGlobal = useWatch({ control, name: "descuento" }) ?? "0.00";
  const detalles = useWatch({ control, name: "detalles" }) ?? [];
  const esMonedaBase = moneda === monedaBase.toUpperCase();
  const tasaQuery = useTasaVigente(moneda, monedaBase.toUpperCase(), fecha);
  // Tasa activa del dólar BCV: se usa para expresar los montos en bolívares.
  const tasaBcvQuery = useTasaVigente("VES", "USD", fecha);
  const tasaBcv = tasaBcvQuery.data?.tasa ?? "";

  useEffect(() => {
    if (tasaManual) return;
    if (esMonedaBase) {
      setValue("tasa_cambio", "1.000000");
      return;
    }
    if (tasaQuery.isFetched) {
      setValue("tasa_cambio", tasaQuery.data?.tasa ?? "");
    }
  }, [esMonedaBase, setValue, tasaManual, tasaQuery.data, tasaQuery.isFetched]);

  const subtotalLineas = addDecimals(
    detalles.map((d) => {
      const precio =
        d.precio_unitario ||
        (d.tipo_item === "producto"
          ? productos.find((p) => String(p.id) === d.producto)?.precio || "0"
          : combos.find((c) => String(c.id) === d.combo)?.precio || "0");
      const bruto = multiplyDecimals(d.cantidad, precio, 2);
      return subtractDecimals(bruto, d.descuento_linea || "0", 2);
    }),
    2
  );
  const totalEstimado = subtractDecimals(subtotalLineas, descuentoGlobal || "0", 2);
  const totalBase = divideDecimals(totalEstimado, tasaValue || "1", 2);
  const totalVes = moneda === "VES" ? totalEstimado : tasaBcv ? multiplyDecimals(totalBase, tasaBcv, 2) : "";
  const totalUsd = totalBase;

  const sinTasaDelDia = !tasaManual && !esMonedaBase && tasaQuery.isFetched && !tasaQuery.data;
  const sinTasaBcv = tasaBcvQuery.isFetched && !tasaBcvQuery.data;

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const payload = {
      cliente: Number(values.cliente),
      fecha: values.fecha,
      tipo_pago: values.tipo_pago,
      moneda: values.moneda.trim().toUpperCase(),
      descuento: values.descuento || "0.00",
      notas: values.notas.trim(),
      detalles: values.detalles.map((d) => {
        const base = {
          cantidad: d.cantidad,
          descuento_linea: d.descuento_linea || "0.00",
        };
        if (d.tipo_item === "combo") {
          base.combo = Number(d.combo);
        } else {
          base.producto = Number(d.producto);
        }
        if (d.precio_unitario && d.precio_unitario.trim() !== "") {
          base.precio_unitario = d.precio_unitario;
        }
        return base;
      }),
    };
    if (tasaManual) payload.tasa_cambio = values.tasa_cambio;

    try {
      if (pedido) {
        await mutation.mutateAsync({ id: pedido.id, payload });
      } else {
        await mutation.mutateAsync({ payload });
      }
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo guardar el pedido."));
    }
  });

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={pedido ? `Editar ${pedido.numero}` : "Nuevo pedido"}
      description={
        pedido
          ? "Solo los pedidos en borrador se pueden editar."
          : "Crea un pedido en borrador. El inventario se descuenta al confirmar."
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            Total estimado:{" "}
            <span className="font-bold text-slate-900">{formatMoney(totalEstimado, moneda)}</span>
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="pedido-form"
              loading={isSubmitting}
              icon={<Save className="h-4 w-4" />}
            >
              Guardar borrador
            </Button>
          </div>
        </div>
      }
    >
      {error ? <Alert tone="error" className="mb-5">{error}</Alert> : null}

      <form id="pedido-form" onSubmit={onSubmit} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Select label="Cliente *" error={errors.cliente?.message} {...register("cliente")}>
            <option value="">Selecciona un cliente</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} · {c.nombre}
              </option>
            ))}
          </Select>
          <Input label="Fecha *" type="date" error={errors.fecha?.message} {...register("fecha")} />
          <Select label="Tipo de pago *" error={errors.tipo_pago?.message} {...register("tipo_pago")}>
            <option value="contado">Contado</option>
            <option value="credito">Crédito</option>
          </Select>
          <Input label="Moneda" maxLength={3} error={errors.moneda?.message} {...register("moneda")} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div>
            {esMonedaBase ? (
              <Input
                label="Tasa BCV del día"
                value={tasaBcv ? formatRate(tasaBcv) : "Sin tasa registrada"}
                readOnly
                hint={
                  tasaBcvQuery.data
                    ? `Fuente: ${FUENTE_LABEL[tasaBcvQuery.data.fuente] ?? tasaBcvQuery.data.fuente} · ${formatDate(fecha)}. Se usa para los montos en bolívares.`
                    : "Registra la tasa del dólar en Tasas de cambio para ver montos en Bs."
                }
              />
            ) : (
              <>
                <Input
                  label={moneda === "VES" ? "Tasa BCV (Bs por 1 USD)" : "Tasa del documento"}
                  inputMode="decimal"
                  hint={
                    tasaManual
                      ? "Tasa manual: se congela en el pedido."
                      : tasaQuery.data
                        ? `Tasa del día · ${FUENTE_LABEL[tasaQuery.data.fuente] ?? tasaQuery.data.fuente}.`
                        : "Se carga la tasa vigente del día del documento."
                  }
                  error={errors.tasa_cambio?.message}
                  {...register("tasa_cambio", { onChange: () => setTasaManual(true) })}
                />
                <button
                  type="button"
                  className="mt-1 text-xs font-medium text-indigo-600 hover:underline disabled:text-slate-400"
                  onClick={() => setTasaManual(false)}
                  disabled={!tasaManual}
                >
                  Usar tasa del día
                </button>
                {moneda !== "VES" ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Tasa BCV del día: {tasaBcv ? formatRate(tasaBcv) : "—"}
                  </p>
                ) : null}
              </>
            )}
          </div>
          <Input
            label="Descuento global"
            inputMode="decimal"
            error={errors.descuento?.message}
            {...register("descuento")}
          />
          <div className="rounded-xl border border-slate-200 p-3 text-sm text-slate-600">
            <p>Subtotal líneas: <strong>{formatMoney(subtotalLineas, moneda)}</strong></p>
            {!esMonedaBase && Number(tasaValue) > 0 ? (
              <p className="mt-1 text-xs text-slate-500">
                1 {monedaBase} = {formatRate(tasaValue, moneda)}
              </p>
            ) : null}
            {moneda !== "VES" && totalVes ? (
              <p className="mt-1 text-xs text-slate-500">
                En Bs (BCV): <strong>{formatMoney(totalVes, "VES")}</strong>
              </p>
            ) : null}
            {moneda !== "USD" && Number(tasaValue) > 0 && totalUsd ? (
              <p className="mt-1 text-xs text-slate-500">
                En USD BCV: <strong>{formatMoney(totalUsd, "USD")}</strong>
              </p>
            ) : null}
            {tasaBcv ? <p className="mt-1 text-xs text-slate-500">Tasa BCV: {formatRate(tasaBcv)}</p> : null}
            <p className="mt-2 text-xs text-slate-500">
              Vista previa. El backend recalcula IVA, totales y congela precios/costos y la tasa al guardar.
            </p>
          </div>
        </div>

        {sinTasaDelDia ? (
          <Alert tone="warning">
            No hay tasa registrada para {moneda} al {formatDate(fecha)}. Regístrala en{" "}
            <strong>Tasas de cambio</strong> o escribe una tasa manual.
          </Alert>
        ) : null}

        {!sinTasaDelDia && sinTasaBcv ? (
          <Alert tone="warning">
            No hay tasa BCV del dólar registrada para el {formatDate(fecha)}. El pedido se puede
            guardar, pero no se mostrará su equivalente en bolívares. Regístrala en{" "}
            <strong>Tasas de cambio</strong>.
          </Alert>
        ) : null}

        <div className="rounded-xl border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Líneas del pedido</p>
              <p className="text-xs text-slate-500">
                Cada línea es un producto o un combo. El precio/costo se congela al guardar.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="px-2.5 py-1.5 text-xs"
              onClick={() =>
                append({
                  tipo_item: "producto",
                  producto: "",
                  combo: "",
                  cantidad: "1.000",
                  precio_unitario: "",
                  descuento_linea: "0.00",
                })
              }
              icon={<Plus className="h-3.5 w-3.5" />}
            >
              Agregar línea
            </Button>
          </div>

          <div className="space-y-3 p-4">
            {errors.detalles?.message ? (
              <p className="text-xs font-medium text-rose-600">{errors.detalles.message}</p>
            ) : null}

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
                      <Select
                        label={`Combo ${index + 1}`}
                        error={errors.detalles?.[index]?.combo?.message}
                        {...register(`detalles.${index}.combo`)}
                      >
                        <option value="">Selecciona un combo</option>
                        {combos.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.sku} · {c.nombre} ({formatMoney(c.precio, monedaBase)})
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Select
                        label={`Producto ${index + 1}`}
                        error={errors.detalles?.[index]?.producto?.message}
                        {...register(`detalles.${index}.producto`)}
                      >
                        <option value="">Selecciona un producto</option>
                        {productos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} · {p.nombre} ({formatMoney(p.precio, monedaBase)})
                          </option>
                        ))}
                      </Select>
                    )}

                    <Button
                      type="button"
                      variant="ghost"
                      className="px-2 py-2 text-rose-600 hover:bg-rose-50"
                      onClick={() => remove(index)}
                      disabled={fields.length === 1}
                      aria-label={`Quitar línea ${index + 1}`}
                      icon={<Trash2 className="h-4 w-4" />}
                    >
                      <span className="sr-only">Quitar</span>
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <Input
                      label="Cantidad"
                      inputMode="decimal"
                      error={errors.detalles?.[index]?.cantidad?.message}
                      {...register(`detalles.${index}.cantidad`)}
                    />
                    <Input
                      label="Precio unit. (opcional)"
                      inputMode="decimal"
                      hint="Vacío = precio del catálogo"
                      error={errors.detalles?.[index]?.precio_unitario?.message}
                      {...register(`detalles.${index}.precio_unitario`)}
                    />
                    <Input
                      label="Descuento línea"
                      inputMode="decimal"
                      error={errors.detalles?.[index]?.descuento_linea?.message}
                      {...register(`detalles.${index}.descuento_linea`)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <TextArea
          label="Notas"
          rows={3}
          placeholder="Observaciones, instrucciones de entrega, etc."
          {...register("notas")}
        />

        <Alert tone="info">
          El pedido se guarda en borrador. Al confirmarlo se descuenta el inventario y, si es a
          crédito, se genera la deuda correspondiente. Los precios y costos quedan congelados en el
          documento.
        </Alert>
      </form>
    </Modal>
  );
}
