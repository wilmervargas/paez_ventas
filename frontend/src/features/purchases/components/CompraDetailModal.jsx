import { X } from "lucide-react";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Modal } from "../../../components/ui/Modal";
import { formatDate, formatDateTime } from "../../../lib/dates";
import { formatMoney, formatRate } from "../../../lib/money";
import { formatQuantity } from "../../../lib/numbers";
const TONES = {
    borrador: "warning",
    recibida: "success",
    anulada: "neutral",
};
export function CompraDetailModal({ compra, onClose }) {
    return (<Modal open onClose={onClose} size="xl" title={`Compra ${compra.numero}`} description={`${compra.proveedor_codigo} · ${compra.proveedor_nombre}`} footer={<div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose} icon={<X className="h-4 w-4"/>}>
            Cerrar
          </Button>
        </div>}>
      <div className="space-y-5">
        <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2 xl:grid-cols-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Fecha</p>
            <p className="mt-1 font-semibold text-slate-900">{formatDate(compra.fecha)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">N.º orden / factura</p>
            <p className="mt-1 font-semibold text-slate-900">{compra.numero_referencia || "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Estado</p>
            <div className="mt-1">
              <Badge tone={TONES[compra.estado]}>{compra.estado_display}</Badge>
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Moneda / tasa</p>
            <p className="mt-1 font-semibold text-slate-900">{compra.moneda}</p>
            <p className="text-xs text-slate-500">Tasa: {formatRate(compra.tasa_cambio, compra.moneda)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Registrada por</p>
            <p className="mt-1 font-semibold text-slate-900">{compra.creado_por ?? "Sistema"}</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Líneas de la compra</caption>
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Producto</th>
                <th className="px-4 py-3 font-semibold">Cantidad</th>
                <th className="px-4 py-3 font-semibold">Costo unit.</th>
                <th className="px-4 py-3 font-semibold">IVA</th>
                <th className="px-4 py-3 text-right font-semibold">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {compra.lineas.map((linea) => (
                <tr key={linea.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{linea.producto_nombre}</p>
                    <p className="font-mono text-xs text-slate-500">{linea.producto_sku}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatQuantity(linea.cantidad)} {linea.unidad_abreviatura}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatMoney(linea.costo_unitario, compra.moneda)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={linea.aplica_iva === false ? "neutral" : "info"}>
                      {linea.aplica_iva === false ? "No" : "Sí"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {formatMoney(linea.subtotal, compra.moneda)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto max-w-xs space-y-1 rounded-xl border border-slate-200 p-4 text-sm">
          <div className="flex justify-between gap-3 text-slate-600">
            <span>Subtotal</span>
            <span className="font-medium text-slate-900">
              {formatMoney(compra.subtotal, compra.moneda)}
            </span>
          </div>
          <div className="flex justify-between gap-3 text-slate-600">
            <span>IVA</span>
            <span className="font-medium text-slate-900">
              {formatMoney(compra.iva, compra.moneda)}
            </span>
          </div>
          <div className="flex justify-between gap-3 text-slate-600">
            <span>Otros montos</span>
            <span className="font-medium text-slate-900">
              {formatMoney(compra.otros_montos ?? "0.00", compra.moneda)}
            </span>
          </div>
          <div className="mt-2 flex justify-between gap-3 border-t border-slate-200 pt-2">
            <span className="font-semibold text-slate-900">Total</span>
            <span className="text-base font-bold text-indigo-700">
              {formatMoney(compra.total, compra.moneda)}
            </span>
          </div>
          {compra.estado === "recibida" && compra.adquirida_en ? (<div className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
              <p className="font-semibold">Compra definitiva (recibida)</p>
              <p>Fecha/hora: {formatDateTime(compra.adquirida_en)}</p>
            </div>) : null}
        </div>

        {compra.notas ? (<div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notas</p>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{compra.notas}</p>
          </div>) : null}

        {compra.estado === "anulada" ? (<div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <p className="font-semibold">Compra anulada</p>
            <p className="mt-1">{compra.motivo_anulacion}</p>
            <p className="mt-1 text-xs">
              {formatDateTime(compra.fecha_anulacion)} · {compra.anulado_por_nombre ?? "Sistema"}
            </p>
          </div>) : null}
      </div>
    </Modal>);
}
