import { BarChart3, Banknote, Boxes, Building2, LayoutDashboard, MessageCircle, Package, ShieldCheck, ShoppingCart, Truck, Users, Wallet, X } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/auth-context";
import { useCompany } from "../../context/company-context";
import { isAdmin } from "../../lib/roles";
import { cn } from "../../lib/utils";
const groups = [
    {
        title: "Operación",
        items: [
            { label: "Panel", icon: LayoutDashboard, to: "/app", end: true },
            {
                label: "Clientes",
                icon: Users,
                to: "/app/clientes",
                roles: ["admin", "vendedor", "cobrador"],
            },
            {
                label: "Inventario",
                icon: Package,
                to: "/app/inventario",
                roles: ["admin", "vendedor", "almacenista"],
            },
            {
                label: "Pedidos",
                icon: ShoppingCart,
                to: "/app/pedidos",
                roles: ["admin", "vendedor", "almacenista"],
            },
        ],
    },
    {
        title: "Abastecimiento",
        items: [
            {
                label: "Proveedores",
                icon: Boxes,
                to: "/app/proveedores",
                roles: ["admin", "almacenista"],
            },
            { label: "Compras", icon: Truck, to: "/app/compras", roles: ["admin", "almacenista"] },
        ],
    },
    {
        title: "Finanzas",
        items: [
            { label: "Deudas y cobros", icon: Wallet, disabled: true },
            { label: "Caja", icon: Banknote, disabled: true },
            { label: "Reportes", icon: BarChart3, disabled: true },
        ],
    },
    {
        title: "Sistema",
        items: [
            { label: "Notificaciones", icon: MessageCircle, disabled: true },
            { label: "Empresa", icon: Building2, to: "/app/empresa", adminOnly: true },
            { label: "Usuarios", icon: ShieldCheck, disabled: true, adminOnly: true },
        ],
    },
];
export function Sidebar({ open, onClose }) {
    const { user } = useAuth();
    const { company } = useCompany();
    return (<aside className={cn("fixed inset-y-0 left-0 z-40 flex w-72 transform flex-col bg-slate-900 text-slate-300 transition-transform duration-200 lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")} aria-label="Navegación principal">
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-500 text-sm font-bold text-white">
            GC
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Gestión</p>
            <p className="text-xs text-slate-400">Comercial</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden" aria-label="Cerrar menú">
          <X className="h-5 w-5"/>
        </button>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {groups.map((group) => {
            const items = group.items.filter((item) => {
                if (item.adminOnly && !isAdmin(user?.rol)) {
                    return false;
                }
                if (item.roles && (!user || !item.roles.includes(user.rol))) {
                    return false;
                }
                return true;
            });
            if (items.length === 0) {
                return null;
            }
            return (<div key={group.title}>
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {group.title}
              </p>
              <div className="space-y-1">
                {items.map((item) => {
                    const Icon = item.icon;
                    if (item.disabled || !item.to) {
                        return (<div key={item.label} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-500" aria-disabled="true">
                        <span className="flex items-center gap-3">
                          <Icon className="h-4 w-4"/>
                          {item.label}
                        </span>
                        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                          Pronto
                        </span>
                      </div>);
                    }
                    return (<NavLink key={item.label} to={item.to} end={item.end} onClick={onClose} className={({ isActive }) => cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition", isActive
                            ? "bg-indigo-500/15 text-white"
                            : "text-slate-300 hover:bg-white/5 hover:text-white")}>
                      <Icon className="h-4 w-4"/>
                      {item.label}
                    </NavLink>);
                })}
              </div>
            </div>);
        })}
      </nav>

      <div className="border-t border-white/10 px-5 py-4">
        <p className="truncate text-xs font-medium text-slate-300">
          {company?.nombre_comercial || company?.razon_social || "Empresa sin configurar"}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {company?.rif || "Configura tus datos fiscales"}
        </p>
      </div>
    </aside>);
}
