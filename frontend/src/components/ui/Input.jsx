import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "../../lib/utils";
export const Input = forwardRef(function Input({ label, error, hint, className, id, name, type, ...props }, ref) {
    const inputId = id ?? name;
    const [show, setShow] = useState(false);
    const isPassword = type === "password";
    const inputType = isPassword ? (show ? "text" : "password") : type;
    return (<label className="block" htmlFor={inputId}>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <div className="relative">
        <input ref={ref} id={inputId} name={name} type={inputType} className={cn("w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-2", isPassword && "pr-10", error
            ? "border-rose-400 focus:border-rose-500 focus:ring-rose-100"
            : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100", className)} aria-invalid={Boolean(error)} {...props}/>
        {isPassword ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShow((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
            aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
            title={show ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
      {error ? (<span className="mt-1 block text-xs font-medium text-rose-600">{error}</span>) : hint ? (<span className="mt-1 block text-xs text-slate-500">{hint}</span>) : null}
    </label>);
});
