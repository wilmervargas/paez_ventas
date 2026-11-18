import { Banknote, Lock, Unlock } from "lucide-react";
import { useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { PageHeader } from "../../../components/ui/PageHeader";
import { PageLoader } from "../../../components/ui/Spinner";
import { formatDate } from "../../../lib/dates";
import { formatInputDecimal, toApiDecimal } from "../../../lib/decimal";
import { getErrorMessage } from "../../../lib/errors";
import { formatMoney } from "../../../lib/money";
import { useAbrirCaja, useCajaActual, useCajaSesiones, useCerrarCaja } from "../hooks";

export function CajaPage() {
  const actual = useCajaActual();
  const sesiones = useCajaSesiones({ page_size: 10 });
  const abrir = useAbrirCaja();
  const cerrar = useCerrarCaja();
  const [montoInicial, setMontoInicial] = useState("0,00");
  const [montoDeclarado, setMontoDeclarado] = useState("");
  const [obs, setObs] = useState("");

  const sesion = actual.data?.abierta ? actual.data.sesion : null;

  async function onAbrir(e) {
    e.preventDefault();
    try {
      await abrir.mutateAsync({ monto_inicial: toApiDecimal(montoInicial, 2), moneda: "USD" });
    } catch {}
  }

  async function onCerrar(e) {
    e.preventDefault();
    if (!sesion) return;
    try {
      await cerrar.mutateAsync({
        id: sesion.id,
        monto_final_declarado: toApiDecimal(montoDeclarado, 2),
        observaciones: obs,
      });
      setMontoDeclarado("");
      setObs("");
    } catch {}
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Banknote}
        title="Caja"
        description="Apertura, movimientos del turno y cierre con arqueo (declarado vs sistema)."
      />

      {actual.isLoading ? (
        <PageLoader label="Cargando caja..." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Estado actual</h3>
              {sesion ? <Badge tone="success">Abierta</Badge> : <Badge tone="neutral">Cerrada</Badge>}
            </div>

            {abrir.isError ? <Alert tone="error">{getErrorMessage(abrir.error, "No se pudo abrir la caja.")}</Alert> : null}
            {cerrar.isError ? <Alert tone="error">{getErrorMessage(cerrar.error, "No se pudo cerrar la caja.")}</Alert> : null}

            {!sesion ? (
              <form onSubmit={onAbrir} className="space-y-3">
                <p className="text-sm text-slate-600">No tienes una sesión de caja abierta. Ábrela para que los cobros en efectivo entren al arqueo; sin caja, los pagos se registran igual.</p>
                <Input
                  label="Monto inicial"
                  type="text"
                  inputMode="decimal"
                  value={montoInicial}
                  onChange={(e) => setMontoInicial(e.target.value)}
                  onBlur={(e) => setMontoInicial(formatInputDecimal(e.target.value, 2) || "0,00")}
                />
                <Button type="submit" loading={abrir.isPending} icon={<Unlock className="h-4 w-4" />}>Abrir caja</Button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-slate-500">Apertura</p><p className="font-medium">{formatDate(sesion.fecha_apertura?.slice(0,10))}</p></div>
                  <div><p className="text-slate-500">Monto inicial</p><p className="font-medium">{formatMoney(sesion.monto_inicial, sesion.moneda)}</p></div>
                  <div><p className="text-slate-500">Ingresos efectivo</p><p className="font-medium text-emerald-700">{formatMoney(sesion.total_ingresos_efectivo, sesion.moneda)}</p></div>
                  <div><p className="text-slate-500">Egresos efectivo</p><p className="font-medium text-rose-700">{formatMoney(sesion.total_egresos_efectivo, sesion.moneda)}</p></div>
                  <div className="col-span-2"><p className="text-slate-500">Saldo esperado (sistema)</p><p className="text-lg font-semibold">{formatMoney(sesion.saldo_esperado, sesion.moneda)}</p></div>
                </div>
                <form onSubmit={onCerrar} className="space-y-3 border-t border-slate-100 pt-4">
                  <h4 className="text-sm font-semibold text-slate-900">Cerrar caja (arqueo)</h4>
                  <Input
                    label="Monto declarado (conteo)"
                    type="text"
                    inputMode="decimal"
                    required
                    value={montoDeclarado}
                    onChange={(e) => setMontoDeclarado(e.target.value)}
                    onBlur={(e) => setMontoDeclarado(formatInputDecimal(e.target.value, 2))}
                  />
                  <Input label="Observaciones" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Diferencias, notas..." />
                  <Button type="submit" variant="secondary" loading={cerrar.isPending} icon={<Lock className="h-4 w-4" />}>Cerrar caja</Button>
                </form>
              </div>
            )}
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Movimientos de la sesión</h3>
            {!sesion ? (
              <p className="text-sm text-slate-500">Abre una caja para ver movimientos.</p>
            ) : sesion.movimientos?.length ? (
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Tipo</th><th>Concepto</th><th className="text-right">Monto</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {sesion.movimientos.map((m) => (
                      <tr key={m.id}>
                        <td className="py-2"><Badge tone={m.tipo === "ingreso" ? "success" : "danger"}>{m.tipo_display}</Badge></td>
                        <td className="py-2 text-slate-700">{m.concepto}<div className="text-xs text-slate-500">{m.metodo}</div></td>
                        <td className="py-2 text-right font-medium">{formatMoney(m.monto, m.moneda)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Sin movimientos registrados en esta sesión.</p>
            )}
          </Card>
        </div>
      )}

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Sesiones recientes</h3>
        {sesiones.isLoading ? <PageLoader label="Cargando sesiones..." /> : sesiones.data?.results?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Apertura</th><th className="px-3 py-2">Cierre</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Inicial</th><th className="px-3 py-2">Sistema</th><th className="px-3 py-2">Declarado</th><th className="px-3 py-2">Diferencia</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {sesiones.data.results.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2">{formatDate(s.fecha_apertura?.slice(0,10))}<div className="text-xs text-slate-500">{s.usuario_apertura_nombre}</div></td>
                    <td className="px-3 py-2">{s.fecha_cierre ? formatDate(s.fecha_cierre.slice(0,10)) : "—"}</td>
                    <td className="px-3 py-2"><Badge tone={s.estado === "abierta" ? "success" : "neutral"}>{s.estado}</Badge></td>
                    <td className="px-3 py-2">{formatMoney(s.monto_inicial, s.moneda)}</td>
                    <td className="px-3 py-2">{s.monto_sistema != null ? formatMoney(s.monto_sistema, s.moneda) : "—"}</td>
                    <td className="px-3 py-2">{s.monto_final_declarado != null ? formatMoney(s.monto_final_declarado, s.moneda) : "—"}</td>
                    <td className="px-3 py-2">{s.diferencia != null ? formatMoney(s.diferencia, s.moneda) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-slate-500">No hay sesiones registradas.</p>}
      </Card>
    </div>
  );
}
