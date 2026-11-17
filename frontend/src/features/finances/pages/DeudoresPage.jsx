import { Eye, MessageCircle, Search, Wallet } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Input } from "../../../components/ui/Input";
import { PageHeader } from "../../../components/ui/PageHeader";
import { PageLoader } from "../../../components/ui/Spinner";
import { Pagination } from "../../../components/ui/Pagination";
import { useAuth } from "../../../context/auth-context";
import { formatDate } from "../../../lib/dates";
import { getErrorMessage } from "../../../lib/errors";
import { formatMoney, formatRate } from "../../../lib/money";
import { canManagePayments } from "../../../lib/roles";
import { MensajePruebaModal } from "../../whatsapp/components/MensajePruebaModal";
import { DeudaDetailModal } from "../components/DeudaDetailModal";
import { RegistrarPagoModal } from "../components/RegistrarPagoModal";
import { useTasaVigente } from "../../orders/hooks";
import { useDeudoresPendientes } from "../hooks";

const PAGE_SIZE = 25;

function diasRetraso(fechaVencimiento) {
  if (!fechaVencimiento) return 0;
  const hoy = new Date();
  const hoyLocal = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const [y, m, d] = String(fechaVencimiento).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return 0;
  const vence = new Date(y, m - 1, d);
  const diff = Math.floor((hoyLocal - vence) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

function buildMensajeCobro(deuda) {
  const cuotas = deuda.cuotas ?? [];
  const estadoDeuda = deuda.estado_display || deuda.estado || "Pendiente";
  const proxima = deuda.proxima_cuota || cuotas.find((c) => Number(c.saldo || 0) > 0) || null;
  const retraso = diasRetraso(proxima?.fecha_vencimiento);

  const lines = [
    `*Cliente:* ${deuda.cliente_nombre} (${deuda.cliente_codigo || "—"})`,
    "",
    `*Pedido:* ${deuda.pedido_numero}`,
    `*Fecha:* ${formatDate(deuda.pedido_fecha)}`,
    "",
    `*Total:* ${formatMoney(deuda.monto_original, deuda.moneda)}`,
    "",
    `*Saldo:* ${formatMoney(deuda.saldo, deuda.moneda)}`,
    `*Pagado:* ${formatMoney(deuda.monto_pagado ?? "0", deuda.moneda)}`,
    "",
    `*Estado:* ${estadoDeuda}`,
    `*Días de retraso:* ${retraso}`,
    "",
    `*Plan de cuotas (${deuda.cuotas_total ?? cuotas.length})*`,
  ];

  if (cuotas.length > 0) {
    const actualId = proxima?.id ?? null;
    cuotas.forEach((c, index) => {
      const numero = c.numero ?? index + 1;
      const pagada = c.estado === "pagada" || Number(c.saldo || 0) <= 0;
      const esActualPorPagar = !pagada && (actualId != null ? c.id === actualId : c === proxima);
      const fmt = (text) => (esActualPorPagar ? `*_${text}_*` : text);
      const fechaTentativa = c.fecha_vencimiento ? formatDate(c.fecha_vencimiento) : "—";
      const fechaReal = c.fecha_pago_real ? formatDate(c.fecha_pago_real) : "—";
      const metodo = c.metodo_pago_display || "—";
      const banco = c.banco_pago || "—";
      const referencia = c.referencia_pago || "—";

      lines.push("");
      lines.push(fmt(`Cuota ${numero}:`));
      lines.push(fmt(`Fecha tentativa de pago: ${fechaTentativa}`));
      lines.push(fmt(`Fecha real de pago: ${fechaReal}`));
      lines.push(fmt(`Método de pago: ${metodo}`));
      lines.push(fmt(`Banco: ${banco}`));
      lines.push(fmt(`Referencia: ${referencia}`));
      lines.push(fmt(`Monto: ${formatMoney(c.monto, deuda.moneda)}`));
      lines.push(fmt(`Estatus: ${pagada ? "Pagada" : "Pendiente"}`));
    });
  } else {
    lines.push("");
    lines.push("Sin cuotas registradas.");
  }

  return lines.join("\n");
}

function cuotaEstadoLabel(cuota, proxima) {
  if (cuota.estado === "pagada" || Number(cuota.saldo || 0) <= 0) {
    return "Pagada";
  }
  if (proxima && cuota.id === proxima.id) {
    return cuota.estado === "parcial" ? "Por pagar ahora (parcial)" : "Por pagar ahora";
  }
  if (cuota.estado === "parcial") {
    return "Parcial (pendiente)";
  }
  return cuota.vencida ? "Pendiente (vencida)" : "Pendiente";
}

function tienePagoPendiente(deuda) {
  if (Number(deuda.cuotas_vencidas || 0) > 0) return true;
  const prox = deuda.proxima_cuota;
  if (!prox) return Boolean(deuda.vencida);
  if (Number(prox.saldo || 0) <= 0) return false;
  if (prox.vencida) return true;
  if (!prox.fecha_vencimiento) return false;
  const [y, m, d] = String(prox.fecha_vencimiento).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return false;
  const hoy = new Date();
  const hoyLocal = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const vence = new Date(y, m - 1, d);
  return vence <= hoyLocal;
}

function useTipoTasaDeuda(deuda) {
  const tasaDoc = Number(deuda.tasa_cambio || 0);
  const tasaBcv = Number(deuda.tasa_bcv ?? 0);
  const coincideBcv =
    deuda.moneda === "VES" &&
    Number.isFinite(tasaBcv) &&
    tasaBcv > 0 &&
    Math.abs(tasaDoc - tasaBcv) < 0.000001;
  const necesitaInferir = deuda.moneda === "VES" && !coincideBcv;
  const tasaEur = useTasaVigente("VES", "EUR", necesitaInferir ? deuda.pedido_fecha : "");
  const tasaUsdt = useTasaVigente("VES", "USDT", necesitaInferir ? deuda.pedido_fecha : "");

  if (coincideBcv) return { tipo: "usd_bcv", listo: true };
  if (deuda.moneda === "VES") {
    if (tasaEur.data?.tasa && Math.abs(tasaDoc - Number(tasaEur.data.tasa)) < 0.000001) {
      return { tipo: "eur_bcv", listo: true };
    }
    if (tasaUsdt.data?.tasa && Math.abs(tasaDoc - Number(tasaUsdt.data.tasa)) < 0.000001) {
      return { tipo: "usdt", listo: true };
    }
    if (necesitaInferir && (!tasaEur.isFetched || !tasaUsdt.isFetched)) {
      return { tipo: "pendiente", listo: false };
    }
    return { tipo: "otro", listo: true };
  }
  if (deuda.moneda === "USD") return { tipo: "usd_bcv", listo: true };
  if (deuda.moneda === "EUR") return { tipo: "eur_bcv", listo: true };
  if (deuda.moneda === "USDT") return { tipo: "usdt", listo: true };
  return { tipo: "otro", listo: true };
}

function TasaPedidoDeuda({ deuda }) {
  const info = useTipoTasaDeuda(deuda);
  const tasa = formatRate(deuda.tasa_cambio);
  let tipo = "Otro";
  if (info.tipo === "usd_bcv") tipo = "Dólar";
  else if (info.tipo === "eur_bcv") tipo = "Euro";
  else if (info.tipo === "usdt") tipo = "USDT";
  else if (info.tipo === "pendiente") tipo = "Tasa";
  else tipo = "Otro";
  return (
    <div>
      <p className="font-medium text-slate-700">{tipo}</p>
      <p className="text-xs text-slate-500">{tasa}</p>
    </div>
  );
}

function formatNumEs(value, decimals = 2) {
  return Number(value || 0).toLocaleString("es-VE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function montoUsdCuota(deuda, cuotaMonto) {
  const monto = Number(cuotaMonto || 0);
  const tasa = Number(deuda?.tasa_cambio || 0);
  const tasaBcv = Number(deuda?.tasa_bcv || 0);
  if (deuda?.moneda === "USD") return `$ ${formatNumEs(monto)}`;
  if (deuda?.moneda === "VES" && tasa > 0) {
    const esUsdBcv = tasaBcv > 0 && Math.abs(tasa - tasaBcv) < 0.000001;
    if (esUsdBcv || Number(deuda?.tasa_bcv) > 0) {
      return `$ ${formatNumEs(monto / tasa)}`;
    }
    return `$ ${formatNumEs(monto / tasa)}`;
  }
  if ((deuda?.moneda === "EUR" || deuda?.moneda === "USDT") && tasa > 0) return "—";
  if (tasa > 0) return `$ ${formatNumEs(monto / tasa)}`;
  return "—";
}

function MontoUsdOTasaAjustada({ deuda }) {
  const info = useTipoTasaDeuda(deuda);
  const tasaNum = Number(deuda.tasa_cambio || 0);
  const saldoNum = Number(deuda.saldo || 0);
  const saldoBaseNum = Number(deuda.monto_original || 0);

  const formatUsd = (value) => `$ ${formatNumEs(value)}`;

  if (deuda.moneda === "USD") {
    return (
      <div>
        <p className="font-medium text-slate-700">{formatUsd(saldoNum)}</p>
        <p className="text-xs text-slate-500">de {formatUsd(saldoBaseNum)}</p>
      </div>
    );
  }

  if (info.tipo === "usd_bcv" && tasaNum > 0) {
    return (
      <div>
        <p className="font-medium text-slate-700">{formatUsd(saldoNum / tasaNum)}</p>
        <p className="text-xs text-slate-500">de {formatUsd(saldoBaseNum / tasaNum)}</p>
      </div>
    );
  }

  if (info.tipo === "otro") {
    return (
      <div>
        <p className="font-medium text-slate-700">Tasa ajustada</p>
        <p className="text-xs text-slate-500">{formatRate(deuda.tasa_cambio)}</p>
      </div>
    );
  }

  if (info.tipo === "eur_bcv" && tasaNum > 0) {
    const eq = Number(saldoNum / tasaNum).toLocaleString("es-VE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return (
      <div>
        <p className="font-medium text-slate-700">€ {eq}</p>
        <p className="text-xs text-slate-500">Equivalente (EUR)</p>
      </div>
    );
  }

  if (info.tipo === "usdt" && tasaNum > 0) {
    const eq = Number(saldoNum / tasaNum).toLocaleString("es-VE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return (
      <div>
        <p className="font-medium text-slate-700">{eq} USDT</p>
        <p className="text-xs text-slate-500">Equivalente (USDT)</p>
      </div>
    );
  }

  return <span className="text-slate-400">—</span>;
}

function DeudaRow({ deuda, puedeCobrar, onDetail, onMensaje, onPago }) {
  const cuotas = deuda.cuotas ?? [];
  const prox = deuda.proxima_cuota;
  const pagoPendiente = tienePagoPendiente(deuda);

  return (
    <tr
      className={
        pagoPendiente
          ? "bg-orange-100 hover:bg-orange-200/70"
          : "hover:bg-slate-50/70"
      }
    >
      <td className="px-3 py-3">
        {pagoPendiente ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
            Deuda por pagar urgente
          </p>
        ) : null}
        <p className="font-semibold text-slate-900">{deuda.cliente_nombre}</p>
        <p className="font-mono text-xs text-slate-500">{deuda.cliente_codigo}</p>
        {deuda.cliente_telefono ? (
          <p className="text-xs text-slate-500">{deuda.cliente_telefono}</p>
        ) : null}
      </td>
      <td className="px-3 py-3">
        <p className="font-mono text-xs font-semibold text-slate-700">{deuda.pedido_numero}</p>
        <p className="text-xs text-slate-500">{formatDate(deuda.pedido_fecha)}</p>
      </td>
      <td className="px-3 py-3">
        <TasaPedidoDeuda deuda={deuda} />
      </td>
      <td className="px-3 py-3">
        <MontoUsdOTasaAjustada deuda={deuda} />
      </td>
      <td className="px-3 py-3">
        <p className="font-semibold text-slate-900">{formatMoney(deuda.saldo, deuda.moneda)}</p>
        <p className="text-xs text-slate-500">de {formatMoney(deuda.monto_original, deuda.moneda)}</p>
        {deuda.vencida ? <Badge tone="danger">Vencida</Badge> : <Badge tone="warning">Pendiente</Badge>}
      </td>
      <td className="px-3 py-3 min-w-[260px]">
        <p className="text-xs text-slate-600">
          {deuda.cuotas_pagadas}/{deuda.cuotas_total} pagadas · {deuda.cuotas_pendientes} pendientes
          {deuda.cuotas_vencidas ? ` · ${deuda.cuotas_vencidas} vencidas` : ""}
        </p>
        {prox && Number(prox.saldo || 0) > 0 ? (
          <div className="mt-2 space-y-0.5 text-xs">
            <p className="font-bold italic text-slate-800">
              Próxima cuota #{prox.numero}: {formatMoney(prox.saldo, deuda.moneda)}
              {" · "}
              {montoUsdCuota(deuda, prox.saldo)}
            </p>
            <p className="text-slate-600">
              Fecha de cobro: <span className="font-medium">{formatDate(prox.fecha_vencimiento)}</span>
            </p>
            <Badge tone={prox.vencida ? "danger" : "info"}>{cuotaEstadoLabel(prox, prox)}</Badge>
          </div>
        ) : cuotas.length > 0 ? (
          <p className="mt-2 text-xs text-slate-500">Sin cuotas pendientes.</p>
        ) : (
          <span className="text-xs text-slate-400">Sin cuotas</span>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            className="p-2"
            onClick={onDetail}
            title="Ver detalle"
            icon={<Eye className="h-4 w-4" />}
          />
          <Button
            variant="ghost"
            className="p-2 text-emerald-700 hover:bg-emerald-50"
            onClick={onMensaje}
            title="Enviar mensaje de cobro por WhatsApp"
            icon={<MessageCircle className="h-4 w-4" />}
          />
          {puedeCobrar ? (
            <Button variant="ghost" className="px-2 py-1.5 text-xs" onClick={onPago}>
              Registrar pago
            </Button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

export function DeudoresPage() {
  const { user } = useAuth();
  const puedeCobrar = canManagePayments(user?.rol);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [soloPagoPendiente, setSoloPagoPendiente] = useState(false);
  const [filtroSemanal, setFiltroSemanal] = useState("");
  const [detail, setDetail] = useState(null);
  const [pago, setPago] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const deferredSearch = useDeferredValue(search);

  const { data, isLoading, isError, error } = useDeudoresPendientes({
    page,
    page_size: PAGE_SIZE,
    search: deferredSearch.trim() || undefined,
    ordering: "fecha_vencimiento,fecha_emision,id",
    ...(soloPagoPendiente ? { pago_pendiente: "true" } : {}),
    ...(filtroSemanal ? { semanal: filtroSemanal } : {}),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Wallet}
        title="Deudas y cobros"
        description="Clientes con saldo pendiente, plan de cuotas y pagos."
      />

      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[1fr_220px_auto] sm:items-end">
          <Input
            label="Buscar"
            placeholder="Cliente, código o número de pedido"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Pagos semanales
            </label>
            <select
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              value={filtroSemanal}
              onChange={(e) => {
                setFiltroSemanal(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              <option value="pendiente">Semanales pendientes</option>
              <option value="retrasado">Semanales retrasados</option>
            </select>
          </div>
          <label className="flex items-center gap-2.5 self-end rounded-lg border border-rose-200 bg-rose-50/50 px-3 py-2.5 text-sm font-medium text-rose-900 shadow-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500"
              checked={soloPagoPendiente}
              onChange={(e) => {
                setSoloPagoPendiente(e.target.checked);
                setPage(1);
              }}
            />
            Solo con fecha de pago pendiente
          </label>
        </div>

        {isLoading ? (
          <PageLoader label="Cargando deudores..." />
        ) : isError ? (
          <div className="p-4">
            <Alert tone="error">{getErrorMessage(error, "No se pudieron cargar las deudas pendientes.")}</Alert>
          </div>
        ) : data && data.results.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1240px] text-left text-sm">
                <caption className="sr-only">Listado de deudores pendientes</caption>
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Cliente</th>
                    <th className="px-3 py-3 font-semibold">Pedido</th>
                    <th className="px-3 py-3 font-semibold">Tasa del pedido</th>
                    <th className="px-3 py-3 font-semibold">USD / Tasa ajustada</th>
                    <th className="px-3 py-3 font-semibold">Saldo</th>
                    <th className="px-3 py-3 font-semibold">Cuotas</th>
                    <th className="px-3 py-3 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.results.map((deuda) => (
                    <DeudaRow
                      key={deuda.id}
                      deuda={deuda}
                      puedeCobrar={puedeCobrar}
                      onDetail={() => setDetail(deuda)}
                      onMensaje={() => setMensaje(deuda)}
                      onPago={() => setPago(deuda)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPageChange={setPage} />
          </>
        ) : (
          <EmptyState
            icon={deferredSearch ? Search : Wallet}
            title={deferredSearch ? "Sin resultados" : "Sin deudores pendientes"}
            description={
              deferredSearch
                ? "No hay deudas que coincidan con la búsqueda."
                : "No hay cuentas por cobrar con saldo pendiente."
            }
          />
        )}
      </Card>

      {detail ? <DeudaDetailModal deudaId={detail.id} onClose={() => setDetail(null)} /> : null}
      {mensaje ? (
        <MensajePruebaModal
          open
          onClose={() => setMensaje(null)}
          initialTo={mensaje.cliente_telefono || ""}
          initialMessage={buildMensajeCobro(mensaje)}
          title={`Mensaje de cobro · ${mensaje.cliente_nombre}`}
        />
      ) : null}
      {pago ? <RegistrarPagoModal deuda={pago} onClose={() => setPago(null)} /> : null}
    </div>
  );
}
