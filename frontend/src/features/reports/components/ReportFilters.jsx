import { RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";

function valorInicial(filtro) {
  return filtro.type === "checkbox" ? false : "";
}

function opcionesDe(filtro, opciones) {
  if (filtro.options) {
    return filtro.options;
  }
  if (filtro.optionsKey) {
    return opciones[filtro.optionsKey] ?? [];
  }
  return [];
}

/**
 * Formulario de filtros de un reporte. Mantiene un borrador local y solo
 * consulta al backend cuando el usuario pulsa «Aplicar».
 */
export function ReportFilters({ reporte, opciones, onApply, onReset, cargando }) {
  const iniciales = useMemo(
    () => Object.fromEntries(reporte.filtros.map((filtro) => [filtro.key, valorInicial(filtro)])),
    [reporte],
  );
  const [draft, setDraft] = useState(iniciales);

  function set(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function aplicar(event) {
    event.preventDefault();
    onApply(draft);
  }

  function limpiar() {
    setDraft(iniciales);
    onReset();
  }

  return (
    <form onSubmit={aplicar} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {reporte.filtros.map((filtro) => {
          const value = draft[filtro.key];

          if (filtro.type === "checkbox") {
            return (
              <label
                key={filtro.key}
                className="flex items-center gap-2.5 self-end rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  checked={Boolean(value)}
                  onChange={(event) => set(filtro.key, event.target.checked)}
                />
                {filtro.label}
              </label>
            );
          }

          if (filtro.type === "select") {
            return (
              <Select
                key={filtro.key}
                label={filtro.label}
                name={filtro.key}
                value={value}
                onChange={(event) => set(filtro.key, event.target.value)}
              >
                <option value="">{filtro.placeholder ?? "Todos"}</option>
                {opcionesDe(filtro, opciones).map((opcion) => (
                  <option key={opcion.value} value={opcion.value}>
                    {opcion.label}
                  </option>
                ))}
              </Select>
            );
          }

          return (
            <Input
              key={filtro.key}
              label={filtro.label}
              name={filtro.key}
              type={filtro.type === "date" ? "date" : "text"}
              placeholder={filtro.placeholder}
              value={value}
              onChange={(event) => set(filtro.key, event.target.value)}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
        <Button type="button" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={limpiar}>
          Limpiar
        </Button>
        <Button type="submit" icon={<Search className="h-4 w-4" />} loading={cargando}>
          Aplicar filtros
        </Button>
      </div>
    </form>
  );
}
