import { Building2, LogOut, Menu } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/auth-context";
import { useCompany } from "../../context/company-context";
import { ROLE_LABELS, initials } from "../../lib/roles";
import { Button } from "../ui/Button";
function CompanyIdentity() {
    const { company } = useCompany();
    if (!company) {
        return (<div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-500">
          <Building2 className="h-4 w-4"/>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Empresa sin configurar</p>
          <p className="text-xs text-slate-500">Completa los datos fiscales para continuar</p>
        </div>
      </div>);
    }
    return (<div className="flex items-center gap-3">
      {company.logo_url ? (<img src={company.logo_url} alt={`Logo de ${company.nombre_comercial || company.razon_social}`} className="h-9 w-9 rounded-xl border border-slate-200 object-contain"/>) : (<div className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-sm font-bold text-white">
          {(company.nombre_comercial || company.razon_social).charAt(0).toUpperCase()}
        </div>)}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">
          {company.nombre_comercial || company.razon_social}
        </p>
        <p className="truncate text-xs text-slate-500">RIF {company.rif}</p>
      </div>
    </div>);
}
export function Header({ onMenu }) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    async function handleLogout() {
        await logout();
        navigate("/login", { replace: true });
    }
    return (<header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onMenu} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Abrir menú">
            <Menu className="h-5 w-5"/>
          </button>
          <CompanyIdentity />
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold text-slate-900">{user?.nombre}</p>
            <p className="text-xs text-slate-500">
              {user ? ROLE_LABELS[user.rol] : ""}
            </p>
          </div>
          <div className="grid h-9 w-9 place-items-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
            {initials(user?.nombre ?? "")}
          </div>
          <Button variant="ghost" onClick={handleLogout} icon={<LogOut className="h-4 w-4"/>} className="px-2.5 sm:px-3">
            <span className="hidden sm:inline">Salir</span>
          </Button>
        </div>
      </div>
    </header>);
}
