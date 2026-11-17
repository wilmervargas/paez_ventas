import { useState } from "react";
import { BarChart3, Banknote, Boxes, Building2, ChevronDown, LayoutDashboard, MessageCircle, Package, ShieldCheck, ShoppingCart, Truck, Users, Wallet, X } from "lucide-react";
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
            { label: "Deudas y cobros", icon: Wallet, to: "/app/deudas", roles: ["admin", "vendedor", "cobrador"] },
            // { label: "Caja", icon: Banknote, to: "/app/caja", roles: ["admin", "cobrador"], disabled: true },
            {
                label: "Reportes",
                icon: BarChart3,
                blue: true,
                children: [
                    { label: "Ventas", to: "/app/reportes/ventas", roles: ["admin", "vendedor"] },
                    {
                        label: "Cuentas por cobrar",
                        to: "/app/reportes/cxc",
                        roles: ["admin", "vendedor", "cobrador"],
                    },
                    {
                        label: "Inventario",
                        to: "/app/reportes/inventario",
                        roles: ["admin", "vendedor", "almacenista"],
                    },
                    { label: "Utilidad", to: "/app/reportes/utilidad", roles: ["admin"] },
                    {
                        label: "Compras",
                        to: "/app/reportes/compras",
                        roles: ["admin", "almacenista"],
                    },
                    {
                        label: "Cobranza",
                        to: "/app/reportes/cobranza",
                        roles: ["admin", "cobrador"],
                    },
                    { label: "Caja", to: "/app/reportes/caja", roles: ["admin", "cobrador"] },
                    {
                        label: "Movimientos",
                        to: "/app/reportes/movimientos",
                        roles: ["admin", "vendedor", "almacenista"],
                    },
                    { label: "Todos los reportes", to: "/app/reportes", end: true },
                ],
            },
        ],
    },
    {
        title: "Sistema",
        items: [
            { label: "WhatsApp", icon: MessageCircle, to: "/app/whatsapp", roles: ["admin", "cobrador"] },
            { label: "Empresa", icon: Building2, to: "/app/empresa", adminOnly: true },
            { label: "Usuarios", icon: ShieldCheck, to: "/app/usuarios", superuserOnly: true },
        ],
    },
];
export function Sidebar({ open, onClose }) {
    const { user } = useAuth();
    const { company } = useCompany();
    const [openSubmenu, setOpenSubmenu] = useState(null);
    return (<aside className={cn("fixed inset-y-0 left-0 z-40 flex w-[12.6rem] transform flex-col bg-slate-900 text-slate-300 transition-transform duration-200 lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")} aria-label="Navegación principal">
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
                if (item.superuserOnly && !user?.is_superuser) {
                    return false;
                }
                if (item.adminOnly && !isAdmin(user?.rol)) {
                    return false;
                }
                if (item.roles && (!user || !item.roles.includes(user.rol))) {
                    return false;
                }
                if (
                    item.children &&
                    !item.children.some((child) => !child.roles || (user && child.roles.includes(user.rol)))
                ) {
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
                    if (item.children) {
                        const isOpen = openSubmenu === item.label;
                        return (<div key={item.label}>
                          <button type="button" onClick={() => setOpenSubmenu(isOpen ? null : item.label)} className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition", item.blue ? "text-blue-400 hover:bg-white/5" : "text-slate-300 hover:bg-white/5 hover:text-white")} aria-expanded={isOpen}>
                            <span className="flex items-center gap-3">
                              <Icon className="h-4 w-4"/>
                              {item.label}
                            </span>
                            <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")}/>
                          </button>
                          {isOpen && (<div className="ml-5 mt-1 space-y-1 border-l border-white/10 pl-3">
                            {item.children
                                .filter((child) => !child.roles || (user && child.roles.includes(user.rol)))
                                .map((child) => (<NavLink key={child.label} to={child.to} end={child.end} onClick={onClose} className={({ isActive }) => cn("block rounded-lg px-3 py-1.5 text-sm transition", isActive
                                    ? "bg-indigo-500/15 font-semibold text-white"
                                    : "text-blue-300/90 hover:bg-white/5 hover:text-white")}>
                                {child.label}
                              </NavLink>))}
                          </div>)}
                        </div>);
                    }
                    if (item.disabled || !item.to) {
                        return (<div key={item.label} className={cn("flex items-center justify-between rounded-lg px-3 py-2 text-sm", item.blue ? "text-blue-400" : "text-slate-500")} aria-disabled="true">
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
