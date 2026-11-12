import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
export function Pagination({ page, pageSize, count, onPageChange }) {
    if (count === 0) {
        return null;
    }
    const totalPages = Math.max(1, Math.ceil(count / pageSize));
    const desde = (page - 1) * pageSize + 1;
    const hasta = Math.min(page * pageSize, count);
    return (<div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row">
      <p className="text-xs text-slate-500">
        Mostrando <span className="font-semibold text-slate-700">{desde}</span>–
        <span className="font-semibold text-slate-700">{hasta}</span> de{" "}
        <span className="font-semibold text-slate-700">{count}</span>
      </p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} className={cn("inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition", page <= 1
            ? "cursor-not-allowed border-slate-200 text-slate-300"
            : "border-slate-300 text-slate-700 hover:bg-slate-50")}>
          <ChevronLeft className="h-4 w-4"/>
          Anterior
        </button>
        <span className="text-xs font-medium text-slate-500">
          Página {page} de {totalPages}
        </span>
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} className={cn("inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition", page >= totalPages
            ? "cursor-not-allowed border-slate-200 text-slate-300"
            : "border-slate-300 text-slate-700 hover:bg-slate-50")}>
          Siguiente
          <ChevronRight className="h-4 w-4"/>
        </button>
      </div>
    </div>);
}
