import { cn } from "../../lib/utils";
const tones = {
    neutral: "bg-slate-100 text-slate-700",
    info: "bg-sky-100 text-sky-700",
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-800",
    danger: "bg-rose-100 text-rose-700",
};
export function Badge({ children, tone = "neutral", className, }) {
    return (<span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}>
      {children}
    </span>);
}
