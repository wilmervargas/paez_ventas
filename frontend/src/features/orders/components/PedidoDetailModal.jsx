import { X } from "lucide-react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Modal } from "../../../components/ui/Modal";
import { formatDate, formatDateTime } from "../../../lib/dates";
import { formatMoney, formatRate } from "../../../lib/money";
import { formatQuantity } from "../../../lib/numbers";
import { useTasaVigente } from "../hooks";

const TONES = {
  borrador: "warning",
  confirmado: "info",
  entregado: "success",
  anulado: "neutral",
};

function describeTasaPedido(pedido, tasaEur, tasaUsdt) {
  const tasa = formatRate(pedido.tasa_cambio);
  const tasaDoc = Number(pedido.tasa_cambio || 0);
  const tasaBcv = Number(pedido.tasa_bcv ?? 0);
  if (
    pedido.moneda === "VES" &&
    Number.isFinite(tasaBcv) &&
    tasaBcv > 0 &&
    Math.abs(tasaDoc - tasaBcv) < 0.000001
  ) {
    return `${tasa} (BCV USD, por $1)`;
  }
  if (tasaEur && Math.abs(tasaDoc - Number(tasaEur)) < 0.000001) {
    return `${tasa} (Euro BCV, por 1 EUR)`;
  }
  if (tasaUsdt && Math.abs(tasaDoc - Number(tasaUsdt)) < 0.000001) {
    return `${tasa} (USDT, por 1 USDT)`;
  }
  if (pedido.moneda === "VES") {
    return `${tasa} (Ajuste/Manual)`;
  }
  return `${tasa} (${pedido.moneda})`;
}

export function PedidoDetailModal({ pedido, onClose }) {
  const tasaDoc = Number(pedido.tasa_cambio || 0);
  const tasaBcv = Number(pedido.tasa_bcv ?? 0);
  const coincideBcv =
    Number.isFinite(tasaBcv) && tasaBcv > 0 && Math.abs(tasaDoc - tasaBcv) < 0.000001;
  const necesitaInferir = pedido.moneda === "VES" && !coincideBcv;
  const tasaEurDoc = useTasaVigente("VES", "EUR", necesitaInferir ? pedido.fecha : "");
  const tasaUsdtDoc = useTasaVigente("VES", "USDT", necesitaInferir ? pedido.fecha : "");
  const tasaLabel = describeTasaPedido(pedido, tasaEurDoc.data?.tasa, tasaUsdtDoc.data?.tasa);

  let tipoTasa = "ajuste";
  if (coincideBcv) tipoTasa = "usd_bcv";
  else if (tasaEurDoc.data?.tasa && Math.abs(tasaDoc - Number(tasaEurDoc.data.tasa)) < 0.000001) tipoTasa = "eur_bcv";
  else if (tasaUsdtDoc.data?.tasa && Math.abs(tasaDoc - Number(tasaUsdtDoc.data.tasa)) < 0.000001) tipoTasa = "usdt";
  else if (pedido.moneda !== "VES") tipoTasa = "otra";

  const totalBs = pedido.moneda === "VES" ? Number(pedido.total || 0) : Number(pedido.total_ves || 0);
  let totalTasaContratada = null;
  if (Number.isFinite(totalBs) && tasaDoc > 0) {
    const eq = Number(totalBs / tasaDoc).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (tipoTasa === "usd_bcv") totalTasaContratada = `$ ${eq} (USD)`;
    else if (tipoTasa === "eur_bcv") totalTasaContratada = `€ ${eq} (EUR)`;
    else if (tipoTasa === "usdt") totalTasaContratada = `${eq} USDT`;
    else if (pedido.moneda === "VES") totalTasaContratada = `${eq} (a tasa contratada)`;
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`Pedido ${pedido.numero}`}
      description={`${pedido.cliente_codigo ?? ""} · ${pedido.cliente_nombre ?? ""}`}
      footer={
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose} icon={<X className="h-4 w-4" />}>
            Cerrar
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2 xl:grid-cols-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Fecha</p>
            <p className="mt-1 font-semibold text-slate-900">{formatDate(pedido.fecha)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">N.º de pedido</p>
            <p className="mt-1 font-semibold text-slate-900">{pedido.numero_referencia || "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Estado / pago</p>
            <div className="mt-1 flex flex-wrap gap-2">
              <Badge tone={TONES[pedido.estado]}>{pedido.estado_display}</Badge>
              <Badge tone={pedido.tipo_pago === "credito" ? "warning" : "neutral"}>
                {pedido.tipo_pago_display}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              {Number(pedido.numero_cuotas ?? 1)} {Number(pedido.numero_cuotas ?? 1) === 1 ? "cuota" : "cuotas"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Tasa contratada</p>
            <p className="mt-1 font-semibold text-slate-900">{tasaLabel}</p>
            {totalTasaContratada ? (
              <p className="text-xs text-slate-500">Total en tasa: {totalTasaContratada}</p>
            ) : null}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Registrado por</p>
            <p className="mt-1 font-semibold text-slate-900">{pedido.creado_por ?? "Sistema"}</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Líneas del pedido</caption>
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Ítem</th>
                <th className="px-4 py-3 font-semibold">Cantidad</th>
                <th className="px-4 py-3 font-semibold">Precio unit.</th>
                <th className="px-4 py-3 font-semibold">Descuento</th>
                <th className="px-4 py-3 font-semibold">IVA</th>
                <th className="px-4 py-3 text-right font-semibold">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pedido.lineas.map((linea) => {
                const nombre =
                  linea.descripcion ||
                  linea.producto_nombre ||
                  linea.combo_nombre ||
                  "—";
                const sku = linea.producto_sku || linea.combo_sku || "";
                const tipo = linea.combo ? "Combo" : "Producto";
                return (
                  <tr key={linea.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{nombre}</p>
                      <p className="text-xs text-slate-500">
                        {tipo}
                        {sku ? ` · ${sku}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatQuantity(linea.cantidad)}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatMoney(linea.precio_unitario, pedido.moneda)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatMoney(linea.descuento_linea, pedido.moneda)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className={linea.aplica_iva === false ? "text-slate-400" : ""}>
                        {formatMoney(linea.iva_linea, pedido.moneda)}
                      </span>
                      {linea.aplica_iva === false ? <span className="ml-1 text-xs text-slate-400">(sin IVA)</span> : null}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {formatMoney(linea.subtotal, pedido.moneda)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="ml-auto max-w-xs space-y-1 rounded-xl border border-slate-200 p-4 text-sm">
          <div className="flex justify-between gap-3 text-slate-600">
            <span>Subtotal</span>
            <span className="font-medium text-slate-900">
              {formatMoney(pedido.subtotal, pedido.moneda)}
            </span>
          </div>
          <div className="flex justify-between gap-3 text-slate-600">
            <span>Descuento</span>
            <span className="font-medium text-slate-900">
              {formatMoney(pedido.descuento, pedido.moneda)}
            </span>
          </div>
          <div className="flex justify-between gap-3 text-slate-600">
            <span>IVA</span>
            <span className="font-medium text-slate-900">
              {formatMoney(pedido.iva, pedido.moneda)}
            </span>
          </div>
          <div className="flex justify-between gap-3 text-slate-600">
            <span>Otros montos</span>
            <span className="font-medium text-slate-900">
              {formatMoney(pedido.otros_montos ?? "0,00", pedido.moneda)}
            </span>
          </div>
          <div className="mt-2 flex justify-between gap-3 border-t border-slate-200 pt-2">
            <span className="font-semibold text-slate-900">Total</span>
            <span className="text-base font-bold text-indigo-700">
              {formatMoney(pedido.total, pedido.moneda)}
            </span>
          </div>
          {totalTasaContratada ? (
            <div className="flex justify-between gap-3 pt-1 text-slate-600">
              <span>Total (tasa contratada)</span>
              <span className="font-medium text-slate-900">{totalTasaContratada}</span>
            </div>
          ) : null}

        </div>

        {pedido.notas ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notas</p>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{pedido.notas}</p>
          </div>
        ) : null}

        {pedido.estado === "anulado" ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <p className="font-semibold">Pedido anulado</p>
            <p className="mt-1">{pedido.motivo_anulacion}</p>
            <p className="mt-1 text-xs">
              {formatDateTime(pedido.fecha_anulacion)} · {pedido.anulado_por_nombre ?? "Sistema"}
            </p>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
