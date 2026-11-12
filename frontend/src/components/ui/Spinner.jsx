import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
export function Spinner({ className }) {
    return <Loader2 className={cn("h-5 w-5 animate-spin text-indigo-600", className)}/>;
}
export function FullPageLoader({ label = "Cargando..." }) {
    return (<div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-sm text-slate-500">
      <Spinner className="h-7 w-7"/>
      <span>{label}</span>
    </div>);
}
export function PageLoader({ label = "Cargando..." }) {
    return (<div className="flex min-h-40 flex-col items-center justify-center gap-3 text-sm text-slate-500">
      <Spinner />
      <span>{label}</span>
    </div>);
}
