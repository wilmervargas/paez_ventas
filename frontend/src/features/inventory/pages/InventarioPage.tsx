import { History, Layers, Package, Tags } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "../../../components/ui/PageHeader";
import { cn } from "../../../lib/utils";
import { CatalogosPanel } from "../components/CatalogosPanel";
import { CombosTab } from "../components/CombosTab";
import { MovimientosTab } from "../components/MovimientosTab";
import { ProductosTab } from "../components/ProductosTab";

type Tab = "productos" | "combos" | "movimientos" | "catalogos";

const TABS: { id: Tab; label: string; icon: typeof Package }[] = [
  { id: "productos", label: "Productos", icon: Package },
  { id: "combos", label: "Combos", icon: Layers },
  { id: "movimientos", label: "Movimientos", icon: History },
  { id: "catalogos", label: "Catálogos", icon: Tags },
];

export function InventarioPage() {
  const [tab, setTab] = useState<Tab>("productos");
  const [kardexProducto, setKardexProducto] = useState<number | undefined>(undefined);

  function cambiarTab(next: Tab) {
    setTab(next);
    if (next !== "movimientos") {
      setKardexProducto(undefined);
    }
  }

  function verKardex(productoId: number) {
    setKardexProducto(productoId);
    setTab("movimientos");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Package}
        title="Inventario"
        description="Catálogo, combos y kardex auditable. El stock solo cambia mediante movimientos."
      />

      <div
        role="tablist"
        aria-label="Secciones de inventario"
        className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
      >
        {TABS.map((item) => {
          const Icon = item.icon;
          const activo = tab === item.id;
          return (
            <button
              key={item.id}
              role="tab"
              type="button"
              aria-selected={activo}
              onClick={() => cambiarTab(item.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition",
                activo
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "productos" ? <ProductosTab onVerKardex={verKardex} /> : null}
      {tab === "combos" ? <CombosTab /> : null}
      {tab === "movimientos" ? <MovimientosTab productoInicial={kardexProducto} /> : null}
      {tab === "catalogos" ? <CatalogosPanel /> : null}
    </div>
  );
}

