import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

/** Modal ligero para ver una imagen en tamaño completo. */
export function ImageViewerModal({ src, alt, onClose }) {
  useEffect(() => {
    if (!src) {
      return;
    }
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
  }, [src, onClose]);

  if (!src) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/90 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Vista de imagen"}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-lg bg-white/10 p-2 text-white transition hover:bg-white/20"
        aria-label="Cerrar"
      >
        <X className="h-6 w-6" />
      </button>
      <img
        src={src}
        alt={alt ?? ""}
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      />
    </div>,
    document.body
  );
}
