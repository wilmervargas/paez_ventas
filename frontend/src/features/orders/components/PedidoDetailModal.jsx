import { X } from "lucide-react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Modal } from "../../../components/ui/Modal";
import { useCompany } from "../../../context/company-context";
import { formatDate, formatDateTime } from "../../../lib/dates";
import { formatMoney, formatRate } from "../../../lib/money";
import { formatQuantity } from "../../../lib/numbers";

const TONES = {
  borrador: "warning",
  confirmado: "info",
  entregado: "success",
  anulado: "neutral",
};

export function PedidoDetailModal({ pedido, onClose }) {
  const { company } = useCompany();
  const monedaBase = company?.moneda_base ?? "USD";

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
        <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Fecha</p>
            <p className="mt-1 font-semibold text-slate-900">{formatDate(pedido.fecha)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Estado / pago</p>
            <div className="mt-1 flex flex-wrap gap-2">
              <Badge tone={TONES[pedido.estado]}>{pedido.estado_display}</Badge>
              <Badge tone={pedido.tipo_pago === "credito" ? "warning" : "neutral"}>
                {pedido.tipo_pago_display}
              </Badge>
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Tasa del documento</p>
            <p className="mt-1 font-semibold text-slate-900">
              {pedido.moneda === monedaBase
                ? `${pedido.moneda} · tasa 1`
                : `1 ${monedaBase} = ${formatRate(pedido.tasa_cambio, pedido.moneda)}`}
            </p>
            {pedido.tasa_bcv ? (
              <p className="mt-1 text-xs text-slate-500">
                Tasa BCV: {formatRate(pedido.tasa_bcv)}
                {pedido.tasa_bcv_vigente_desde
                  ? ` · ${formatDateTime(pedido.tasa_bcv_vigente_desde)}`
                  : ""}
              </p>
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
                      {formatMoney(linea.iva_linea, pedido.moneda)}
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
          <div className="mt-2 flex justify-between gap-3 border-t border-slate-200 pt-2">
            <span className="font-semibold text-slate-900">Total</span>
            <span className="text-base font-bold text-indigo-700">
              {formatMoney(pedido.total, pedido.moneda)}
            </span>
          </div>
          {pedido.moneda === "VES" ? null : pedido.total_ves ? (
            <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 text-slate-600">
              <span>Monto histórico en Bs (BCV)</span>
              <span className="font-medium text-slate-900">
                {formatMoney(pedido.total_ves, "VES")}
              </span>
            </div>
          ) : (
            <div className="border-t border-slate-200 pt-2 text-xs text-amber-700">
              Monto histórico en Bs no disponible: no hay tasa BCV registrada para{" "}
              {formatDate(pedido.fecha)}.
            </div>
          )}
          {pedido.moneda !== "USD" && pedido.total_usd ? (
            <div className="flex justify-between gap-3 text-slate-600">
              <span>Total en USD BCV</span>
              <span className="font-medium text-slate-900">
                {formatMoney(pedido.total_usd, "USD")}
              </span>
            </div>
          ) : null}
          {pedido.tasa_bcv ? (
            <p className="pt-1 text-xs text-slate-500">
              Tasa BCV del documento: {formatRate(pedido.tasa_bcv)}
              {pedido.tasa_bcv_vigente_desde
                ? ` · ${formatDateTime(pedido.tasa_bcv_vigente_desde)}`
                : ""}
            </p>
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
