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

function divisaDeudaMensaje(deuda) {
  if (deuda?.moneda === "USD") return "USD";
  if (deuda?.moneda === "EUR") return "EUR";
  if (deuda?.moneda === "USDT") return "USDT";
  if (deuda?.moneda === "AJU") return "AJU";
  const tasaDoc = Number(deuda?.tasa_cambio || 0);
  const tasaBcv = Number(deuda?.tasa_bcv || 0);
  if (deuda?.moneda === "VES" && tasaBcv > 0 && Math.abs(tasaDoc - tasaBcv) < 0.000001) return "USD";
  return "USD";
}

function montoDivisaMensaje(deuda, monto) {
  const valor = Number(monto || 0);
  const tasa = Number(deuda?.tasa_cambio || 0);
  const divisa = divisaDeudaMensaje(deuda);
  if (deuda?.moneda === "USD") return `${formatNumEs(valor)} ${divisa}`;
  if (!(tasa > 0)) return "—";
  const eq = valor / tasa;
  if (!Number.isFinite(eq)) return "—";
  return `${formatNumEs(eq)} ${divisa}`;
}

function buildMensajeCobro(deuda, tasaAjuHoyTexto) {
  const cuotas = deuda.cuotas ?? [];
  const estadoDeuda = deuda.estado_display || deuda.estado || "Pendiente";
  const proxima = deuda.proxima_cuota || cuotas.find((c) => Number(c.saldo || 0) > 0) || null;
  const retraso = diasRetraso(proxima?.fecha_vencimiento);
  const cuotasPagadas = cuotas.filter(
    (c) => c.estado === "pagada" || Number(c.saldo || 0) <= 0,
  );
  const ultimaPagada = cuotasPagadas.length ? cuotasPagadas[cuotasPagadas.length - 1] : null;

  const lines = [
    "*Víveres y Charcutería Zojhanny Vivas, F.P.*",
    "",
    `*Cliente:* ${deuda.cliente_nombre} (${deuda.cliente_codigo || "—"})`,
    "",
    `*Pedido:* ${deuda.pedido_numero}`,
    `*Fecha:* ${formatDate(deuda.pedido_fecha)}`,
    "",
    `*Total:* ${montoDivisaMensaje(deuda, deuda.monto_original)}`,
    "",
    `*Saldo:* ${montoDivisaMensaje(deuda, deuda.saldo)}`,
    `*Pagado:* ${montoDivisaMensaje(deuda, deuda.monto_pagado ?? "0")}`,
    "",
    `*Estado:* ${estadoDeuda}`,
    `*Días de retraso:* ${retraso}`,
    "",
    `*Plan de cuotas (${deuda.cuotas_total ?? cuotas.length})*`,
  ];

  if (cuotas.length > 0) {
    const actualId = proxima?.id ?? null;

    // Cuotas ya pagadas
    cuotasPagadas.forEach((c) => {
      const numero = c.numero ?? "—";
      const fecha = c.fecha_pago_real
        ? formatDate(c.fecha_pago_real)
        : c.fecha_vencimiento
          ? formatDate(c.fecha_vencimiento)
          : "—";
      lines.push("");
      lines.push(`*Cuota ${numero}*: Pagada · ${fecha} · ${montoDivisaMensaje(deuda, c.monto)}`);
    });

    // Cuota pendiente actual (por pagar ahora)
    if (proxima && Number(proxima.saldo || 0) > 0) {
      const numero = proxima.numero ?? "—";
      const fechaTentativa = proxima.fecha_vencimiento
        ? formatDate(proxima.fecha_vencimiento)
        : "—";
      const estatus = cuotaEstadoLabel(proxima, proxima);
      lines.push("");
      lines.push("*ESTAS PENDIENTE CON ESTA CUOTA:*");
      lines.push(`*_Cuota ${numero}_*`);
      lines.push(`*_Fecha Tentativa de pago: ${fechaTentativa}_*`);
      lines.push(`*_Monto: ${montoDivisaMensaje(deuda, proxima.saldo)}_*`);
      lines.push(`*_Estatus: ${estatus}_*`);
    }

    const pendientesRestantes = cuotas.filter((c) => {
      const pagada = c.estado === "pagada" || Number(c.saldo || 0) <= 0;
      const esActual = actualId != null ? c.id === actualId : c === proxima;
      return !pagada && !esActual;
    });

    if (pendientesRestantes.length > 0) {
      lines.push("");
      lines.push("*Cuotas pendientes:*");
      pendientesRestantes.forEach((c) => {
        const numero = c.numero ?? "—";
        const fecha = c.fecha_vencimiento ? formatDate(c.fecha_vencimiento) : "—";
        lines.push(`- *Cuota ${numero}* · ${fecha} · ${montoDivisaMensaje(deuda, c.saldo)}`);
      });
    }
  } else {
    lines.push("");
    lines.push("Sin cuotas registradas.");
  }

  return lines.join("\n");
}

function buildMensajeFelicitacionPago(deuda) {
  const cuotas = deuda.cuotas ?? [];
  const estadoDeuda = deuda.estado_display || deuda.estado || "Pendiente";
  const proxima = deuda.proxima_cuota || cuotas.find((c) => Number(c.saldo || 0) > 0) || null;
  const retraso = diasRetraso(proxima?.fecha_vencimiento);
  const cuotasPagadas = cuotas.filter(
    (c) => c.estado === "pagada" || Number(c.saldo || 0) <= 0,
  );
  const ultimaPagada =
    cuotasPagadas.length > 0
      ? [...cuotasPagadas].sort((a, b) => Number(a.numero || 0) - Number(b.numero || 0))[
          cuotasPagadas.length - 1
        ]
      : null;

  const lines = [
    "*Víveres y Charcutería Zojhanny Vivas, F.P.*",
    "",
    "*_¡Felicitaciones por tu pago! Gracias, estamos a la orden._*",
  ];

  // Detalle solo de la última cuota pagada (con método/banco/referencia)
  if (ultimaPagada) {
    const numero = ultimaPagada.numero ?? "—";
    const fecha = ultimaPagada.fecha_pago_real
      ? formatDate(ultimaPagada.fecha_pago_real)
      : ultimaPagada.fecha_vencimiento
        ? formatDate(ultimaPagada.fecha_vencimiento)
        : "—";
    const metodo = ultimaPagada.metodo_pago_display || ultimaPagada.metodo_pago || "";
    const banco = ultimaPagada.banco_pago || "";
    const referencia = ultimaPagada.referencia_pago || "";
    lines.push(`*Cuota ${numero}*: Pagada · ${fecha} · ${montoDivisaMensaje(deuda, ultimaPagada.monto)}`);
    lines.push(`*Metodo de pago*: ${metodo}`);
    lines.push(`*Banco*: ${banco}`);
    lines.push(`*Referencia*: ${referencia}`);
  }

  lines.push("");
  lines.push(`*Cliente:* ${deuda.cliente_nombre} (${deuda.cliente_codigo || "—"})`);
  lines.push("");
  lines.push(`*Pedido:* ${deuda.pedido_numero}`);
  lines.push(`*Fecha:* ${formatDate(deuda.pedido_fecha)}`);
  lines.push("");
  lines.push(`*Total:* ${montoDivisaMensaje(deuda, deuda.monto_original)}`);
  lines.push("");
  lines.push(`*Saldo:* ${montoDivisaMensaje(deuda, deuda.saldo)}`);
  lines.push(`*Pagado:* ${montoDivisaMensaje(deuda, deuda.monto_pagado ?? "0")}`);
  lines.push("");
  lines.push(`*Estado:* ${estadoDeuda}`);
  lines.push(`*Días de retraso:* ${retraso}`);
  lines.push("");
  lines.push(`*Plan de cuotas (${deuda.cuotas_total ?? cuotas.length})*`);

  if (cuotas.length > 0) {
    // Cuotas pagadas desde la 1 hasta la que se paga actualmente
    const pagadasOrdenadas = [...cuotasPagadas].sort(
      (a, b) => Number(a.numero || 0) - Number(b.numero || 0),
    );
    pagadasOrdenadas.forEach((c) => {
      const numero = c.numero ?? "—";
      const fecha = c.fecha_pago_real
        ? formatDate(c.fecha_pago_real)
        : c.fecha_vencimiento
          ? formatDate(c.fecha_vencimiento)
          : "—";
      lines.push("");
      lines.push(`*Cuota ${numero}*: Pagada · ${fecha} · ${montoDivisaMensaje(deuda, c.monto)}`);
    });

    const pendientes = cuotas.filter((c) => c.estado !== "pagada" && Number(c.saldo || 0) > 0);
    if (pendientes.length > 0) {
      lines.push("*Cuotas pendientes:*");
      pendientes.forEach((c) => {
        const numero = c.numero ?? "—";
        const fecha = c.fecha_vencimiento ? formatDate(c.fecha_vencimiento) : "—";
        lines.push(`- *Cuota ${numero}* · ${fecha} · ${montoDivisaMensaje(deuda, c.saldo)}`);
      });
    }
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
  const tasaAju = useTasaVigente("VES", "AJU", necesitaInferir ? deuda.pedido_fecha : "");

  if (coincideBcv) return { tipo: "usd_bcv", listo: true };
  if (deuda.moneda === "VES") {
    if (tasaEur.data?.tasa && Math.abs(tasaDoc - Number(tasaEur.data.tasa)) < 0.000001) {
      return { tipo: "eur_bcv", listo: true };
    }
    if (tasaUsdt.data?.tasa && Math.abs(tasaDoc - Number(tasaUsdt.data.tasa)) < 0.000001) {
      return { tipo: "usdt", listo: true };
    }
    if (tasaAju.data?.tasa && Math.abs(tasaDoc - Number(tasaAju.data.tasa)) < 0.000001) {
      return { tipo: "aju", listo: true };
    }
    if (necesitaInferir && (!tasaEur.isFetched || !tasaUsdt.isFetched || !tasaAju.isFetched)) {
      return { tipo: "pendiente", listo: false };
    }
    return { tipo: "otro", listo: true };
  }
  if (deuda.moneda === "USD") return { tipo: "usd_bcv", listo: true };
  if (deuda.moneda === "EUR") return { tipo: "eur_bcv", listo: true };
  if (deuda.moneda === "USDT") return { tipo: "usdt", listo: true };
  if (deuda.moneda === "AJU") return { tipo: "aju", listo: true };
  return { tipo: "otro", listo: true };
}

function TasaYEquivalenteDeuda({ deuda }) {
  const info = useTipoTasaDeuda(deuda);
  const tasa = formatRate(deuda.tasa_cambio);
  const tasaNum = Number(deuda.tasa_cambio || 0);
  const saldoNum = Number(deuda.saldo || 0);

  let tipo = "Ajuste/Manual";
  if (info.tipo === "usd_bcv") tipo = "Dólar BCV";
  else if (info.tipo === "eur_bcv") tipo = "Euro BCV";
  else if (info.tipo === "usdt") tipo = "USDT";
  else if (info.tipo === "aju") tipo = "Ajustada (AJU)";
  else if (info.tipo === "pendiente") tipo = "Tasa";

  let equivalente = "—";
  if (deuda.moneda === "USD") {
    equivalente = `$ ${formatNumEs(saldoNum)}`;
  } else if (tasaNum > 0) {
    if (info.tipo === "usd_bcv") equivalente = `$ ${formatNumEs(saldoNum / tasaNum)}`;
    else if (info.tipo === "eur_bcv") equivalente = `€ ${formatNumEs(saldoNum / tasaNum)}`;
    else if (info.tipo === "usdt") equivalente = `${formatNumEs(saldoNum / tasaNum)} USDT`;
    else if (info.tipo === "aju") equivalente = `${formatNumEs(saldoNum / tasaNum)} AJU`;
  }

  const saldoVesActual = deuda.saldo_ves_actual != null ? Number(deuda.saldo_ves_actual) : null;

  return (
    <div>
      <p className="font-medium text-slate-700">{tipo}</p>
      <p className="text-xs font-semibold text-slate-900">Tasa: {tasa}</p>
      <p className="text-xs text-slate-500">{equivalente}</p>
      {saldoVesActual != null ? (
        <p className="mt-1 text-xs font-semibold text-emerald-700">
          VES actualizado: {formatMoney(saldoVesActual, "VES")}
        </p>
      ) : null}
    </div>
  );
}

function formatNumEs(value, decimals = 2) {
  return Number(value || 0).toLocaleString("es-VE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function codigoDivisaDeuda(deuda, infoTipo) {
  if (deuda?.moneda === "USD") return "USD";
  if (deuda?.moneda === "EUR") return "EUR";
  if (deuda?.moneda === "USDT") return "USDT";
  if (deuda?.moneda === "AJU") return "AJU";
  if (infoTipo === "eur_bcv") return "EUR";
  if (infoTipo === "usdt") return "USDT";
  if (infoTipo === "aju") return "AJU";
  return "USD";
}

function montoDivisaCuota(deuda, cuotaMonto, infoTipo) {
  const monto = Number(cuotaMonto || 0);
  const tasa = Number(deuda?.tasa_cambio || 0);
  if (!(tasa > 0) && deuda?.moneda !== "USD") return "—";
  const valor = deuda?.moneda === "USD" ? monto : monto / tasa;
  if (!Number.isFinite(valor)) return "—";
  return `${formatNumEs(valor)} ${codigoDivisaDeuda(deuda, infoTipo)}`;
}

function DeudaRow({ deuda, puedeCobrar, tasaAjuHoy, onDetail, onMensajeCobro, onMensajeFelicitacion, onPago }) {
  const cuotas = deuda.cuotas ?? [];
  const prox = deuda.proxima_cuota;
  const pagoPendiente = tienePagoPendiente(deuda);
  const infoTasa = useTipoTasaDeuda(deuda);

  function saldoEnDivisa(monto) {
    const valor = Number(monto || 0);
    const tasaDoc = Number(deuda.tasa_cambio || 0);
    const divisa = codigoDivisaDeuda(deuda, infoTasa.tipo);
    if (deuda.moneda === "USD") return `${formatNumEs(valor)} ${divisa}`;
    if (!(tasaDoc > 0)) return "—";
    const eq = valor / tasaDoc;
    if (!Number.isFinite(eq)) return "—";
    return `${formatNumEs(eq)} ${divisa}`;
  }

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
      <td className="px-2 py-3">
        <TasaYEquivalenteDeuda deuda={deuda} />
      </td>
      <td className="px-2 py-3 bg-rose-50/60">
        <p className="font-medium text-rose-700">Ajustada (AJU)</p>
        <p className="text-xs font-semibold text-rose-700">
          {tasaAjuHoy ? `${formatRate(tasaAjuHoy)} por 1 AJU` : "—"}
        </p>
      </td>
      <td className="px-2 py-3">
        <p className="font-semibold text-slate-900">{saldoEnDivisa(deuda.saldo)}</p>
        <p className="text-xs text-slate-500">de {saldoEnDivisa(deuda.monto_original)}</p>
        {deuda.vencida ? <Badge tone="danger">Vencida</Badge> : <Badge tone="warning">Pendiente</Badge>}
      </td>
      <td className="py-3 pl-2 pr-0 min-w-[200px]">
        <p className="text-xs leading-tight text-slate-600">
          {deuda.cuotas_pagadas}/{deuda.cuotas_total} pagadas · {deuda.cuotas_pendientes} pendientes
          {deuda.cuotas_vencidas ? ` · ${deuda.cuotas_vencidas} vencidas` : ""}
        </p>
        {prox && Number(prox.saldo || 0) > 0 ? (
          <div className="mt-1 space-y-0 text-xs leading-tight">
            <p className="font-bold italic text-slate-800">
              Próxima cuota #{prox.numero}: {montoDivisaCuota(deuda, prox.saldo, infoTasa.tipo)}
            </p>
            <p className="text-slate-600">
              Fecha de cobro: <span className="font-medium">{formatDate(prox.fecha_vencimiento)}</span>
            </p>
            <div className="pt-0.5">
              <Badge tone={prox.vencida ? "danger" : "info"}>{cuotaEstadoLabel(prox, prox)}</Badge>
            </div>
          </div>
        ) : cuotas.length > 0 ? (
          <p className="mt-1 text-xs text-slate-500">Sin cuotas pendientes.</p>
        ) : (
          <span className="text-xs text-slate-400">Sin cuotas</span>
        )}
      </td>
      <td className="py-3 pl-0 pr-0">
        <div className="mr-12 flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            className="p-2"
            onClick={onDetail}
            title="Ver detalle"
            icon={<Eye className="h-4 w-4" />}
          />
          <div className="flex items-center gap-0">
            <Button
              variant="ghost"
              className="rounded-md bg-rose-100 p-2 text-rose-700 hover:bg-rose-200"
              onClick={onMensajeCobro}
              title="Mensaje de cobro por WhatsApp"
              icon={<MessageCircle className="h-4 w-4" />}
            />
            {puedeCobrar ? (
              <Button
                variant="ghost"
                className="-ml-1 rounded-md bg-blue-100 px-1.5 py-1 text-[11px] leading-tight text-center text-blue-700 hover:bg-blue-200"
                onClick={onPago}
              >
                Registrar
                <br />
                pago
              </Button>
            ) : null}
            <Button
              variant="ghost"
              className="rounded-md bg-emerald-100 p-2 text-emerald-700 hover:bg-emerald-200"
              onClick={onMensajeFelicitacion}
              title="Mensaje de felicitación por pago (WhatsApp)"
              icon={<MessageCircle className="h-4 w-4" />}
            />
          </div>
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
  const [mensaje, setMensaje] = useState(null); // { deuda, tipo: 'cobro' | 'felicitacion' }
  const deferredSearch = useDeferredValue(search);

  const { data, isLoading, isError, error } = useDeudoresPendientes({
    page,
    page_size: PAGE_SIZE,
    search: deferredSearch.trim() || undefined,
    ordering: "pedido__fecha,pedido__numero",
    ...(soloPagoPendiente ? { pago_pendiente: "true" } : {}),
    ...(filtroSemanal ? { semanal: filtroSemanal } : {}),
  });
  const tasaAjuHoy = useTasaVigente("VES", "AJU");

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Wallet}
        title="Deudas y cobros"
        description="Clientes con saldo pendiente, plan de cuotas y pagos."
      />

      <Card className="p-4">
        <p className="text-sm font-medium text-slate-700">
          Tasa Ajustada (AJU) del día actual:{" "}
          <span className="font-semibold text-slate-900">
            {tasaAjuHoy.data?.tasa
              ? `${formatRate(tasaAjuHoy.data.tasa)} por 1 AJU`
              : tasaAjuHoy.isLoading
                ? "Cargando..."
                : "No disponible"}
          </span>
        </p>
      </Card>

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
              <table className="w-full min-w-[1040px] text-left text-[13px]">
                <caption className="sr-only">Listado de deudores pendientes</caption>
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-3 font-semibold">Cliente</th>
                    <th className="px-2 py-3 font-semibold">Pedido</th>
                    <th className="px-2 py-3 font-semibold">Tasa del pedido</th>
                    <th className="bg-rose-50/60 px-2 py-3 font-semibold text-rose-500">Tasa de cobro</th>
                    <th className="px-2 py-3 font-semibold">Saldo</th>
                    <th className="px-2 py-3 font-semibold">Cuotas</th>
                    <th className="py-3 pl-0 pr-12 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.results.map((deuda) => (
                    <DeudaRow
                      key={deuda.id}
                      deuda={deuda}
                      puedeCobrar={puedeCobrar}
                      tasaAjuHoy={tasaAjuHoy.data?.tasa}
                      onDetail={() => setDetail(deuda)}
                      onMensajeCobro={() => setMensaje({ deuda, tipo: "cobro" })}
                      onMensajeFelicitacion={() => setMensaje({ deuda, tipo: "felicitacion" })}
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
          initialTo={mensaje.deuda.cliente_telefono || ""}
          initialMessage={
            mensaje.tipo === "felicitacion"
              ? buildMensajeFelicitacionPago(mensaje.deuda)
              : buildMensajeCobro(
                  mensaje.deuda,
                  tasaAjuHoy.data?.tasa
                    ? `${formatRate(tasaAjuHoy.data.tasa)} por 1 AJU`
                    : "No disponible",
                )
          }
          title={
            mensaje.tipo === "felicitacion"
              ? `Felicitación por pago · ${mensaje.deuda.cliente_nombre}`
              : `Mensaje de cobro · ${mensaje.deuda.cliente_nombre}`
          }
        />
      ) : null}
      {pago ? (
        <RegistrarPagoModal
          deuda={pago}
          onClose={() => setPago(null)}
          liquidarCuotaSiempre
        />
      ) : null}
    </div>
  );
}
