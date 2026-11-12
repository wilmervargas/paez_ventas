import { Building2, CheckCircle2, Coins, Percent } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { useAuth } from "../../context/auth-context";
import { useCompany } from "../../context/company-context";
import { ROLE_LABELS } from "../../lib/roles";
import { RatesManager } from "../rates/components/RatesManager";

function Stat({ title, value, icon: Icon }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-600">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const { company } = useCompany();
  const firstName = user?.nombre.split(/\s+/)[0] ?? "";
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 p-6 text-white shadow-lg sm:p-8">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">
            Panel principal
          </p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Hola, {firstName}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
            La base del sistema está lista. Desde aquí administrarás clientes, inventario,
            pedidos y cobranzas de la empresa.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-white/10 px-3 py-1 font-medium">
              {user ? ROLE_LABELS[user.rol] : ""}
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 font-medium">
              {company?.nombre_comercial || company?.razon_social || "Empresa sin configurar"}
            </span>
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 font-medium text-emerald-200">
              Sesión activa
            </span>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat title="Moneda base" value={company?.moneda_base ?? "—"} icon={Coins} />
        <Stat title="IVA" value={company ? `${company.iva_rate}%` : "—"} icon={Percent} />
        <Stat title="RIF" value={company?.rif ?? "—"} icon={Building2} />
        <Stat
          title="Configuración"
          value={company ? "Completa" : "Pendiente"}
          icon={CheckCircle2}
        />
      </div>

      <RatesManager />
    </div>
  );
}
