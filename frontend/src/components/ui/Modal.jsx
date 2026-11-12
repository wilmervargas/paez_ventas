import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";
const sizes = {
    sm: "max-w-md",
    md: "max-w-xl",
    lg: "max-w-3xl",
    xl: "max-w-5xl",
};
export function Modal({ open, onClose, title, description, children, footer, size = "md", }) {
    const mouseDownOnBackdrop = useRef(false);
    useEffect(() => {
        if (!open) {
            return;
        }
        mouseDownOnBackdrop.current = false;
        function handleKeyDown(event) {
            if (event.key === "Escape") {
                onClose();
            }
        }
        document.addEventListener("keydown", handleKeyDown);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [open, onClose]);
    if (!open) {
        return null;
    }
    function handleBackdropMouseDown(event) {
        mouseDownOnBackdrop.current = event.target === event.currentTarget;
    }
    function handleBackdropClick(event) {
        // Solo cierra cuando el clic empieza Y termina en el fondo. Así, un clic
        // dentro del diálogo que termina arrastrando hacia afuera (por ejemplo al
        // seleccionar texto de un campo) no descarta el formulario.
        if (mouseDownOnBackdrop.current && event.target === event.currentTarget) {
            onClose();
        }
    }
    return createPortal(<div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={handleBackdropMouseDown} onClick={handleBackdropClick}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cn("flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl", sizes[size])} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Cerrar">
            <X className="h-5 w-5"/>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer ? (<div className="border-t border-slate-100 bg-slate-50 px-5 py-4">{footer}</div>) : null}
      </div>
    </div>, document.body);
}
