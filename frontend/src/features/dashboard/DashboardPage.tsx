import {
  BarChart3,
  Building2,
  CheckCircle2,
  Coins,
  MessageCircle,
  Package,
  Percent,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { useAuth } from "../../context/auth-context";
import { useCompany } from "../../context/company-context";
import { ROLE_LABELS } from "../../lib/roles";

function Stat({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {title}
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-600">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

const modules = [
  { label: "Clientes", icon: Users, status: "Disponible" },
  { label: "Inventario y combos", icon: Package, status: "Disponible" },
  { label: "Compras y recepción", icon: Truck, status: "Disponible" },
  { label: "Pedidos", icon: ShoppingCart, status: "Fase 4" },
  { label: "Deudas y pagos", icon: Wallet, status: "Fase 5" },
  { label: "Reportes", icon: BarChart3, status: "Fase 7" },
  { label: "Cobros por WhatsApp", icon: MessageCircle, status: "Fase 8" },
];

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
            La base del sistema está lista. Desde aquí administrarás clientes,
            inventario, pedidos y cobranzas de la empresa.
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
        <Stat
          title="Moneda base"
          value={company?.moneda_base ?? "—"}
          icon={Coins}
        />
        <Stat title="IVA" value={company ? `${company.iva_rate}%` : "—"} icon={Percent} />
        <Stat title="RIF" value={company?.rif ?? "—"} icon={Building2} />
        <Stat
          title="Configuración"
          value={company ? "Completa" : "Pendiente"}
          icon={CheckCircle2}
        />
      </div>

      <Card>
        <CardHeader
          title="Módulos del sistema"
          description="Estado del roadmap de implementación."
        />
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {modules.map((module) => {
              const Icon = module.icon;
              return (
                <div
                  key={module.label}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 p-4"
                >
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{module.label}</p>
                    <p className="text-xs text-slate-500">{module.status}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
