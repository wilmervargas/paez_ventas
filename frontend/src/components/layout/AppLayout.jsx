import { Suspense, useState } from "react";
import { Outlet } from "react-router-dom";
import { CompanyGate } from "../CompanyGate";
import { PageLoader } from "../ui/Spinner";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
export function AppLayout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    return (<div className="min-h-screen bg-slate-100">
      {sidebarOpen ? (<button type="button" className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú"/>) : null}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)}/>

      <div className="lg:pl-72">
        <Header onMenu={() => setSidebarOpen(true)}/>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <CompanyGate>
            <Suspense fallback={<PageLoader label="Cargando módulo..."/>}>
              <Outlet />
            </Suspense>
          </CompanyGate>
        </main>
      </div>
    </div>);
}
