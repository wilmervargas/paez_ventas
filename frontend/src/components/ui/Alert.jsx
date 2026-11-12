import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "../../lib/utils";
const styles = {
    info: "border-sky-200 bg-sky-50 text-sky-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    error: "border-rose-200 bg-rose-50 text-rose-800",
};
const icons = {
    info: Info,
    success: CheckCircle2,
    warning: AlertTriangle,
    error: XCircle,
};
export function Alert({ tone = "info", title, children, className }) {
    const Icon = icons[tone];
    return (<div className={cn("flex gap-3 rounded-xl border p-4 text-sm", styles[tone], className)} role={tone === "error" ? "alert" : "status"}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0"/>
      <div>
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn(title && "mt-1")}>{children}</div>
      </div>
    </div>);
}
