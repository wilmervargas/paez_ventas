import { ImagePlus, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Button } from "./Button";
/**
 * Entrada de imagen opcional con vista previa y borrado.
 *
 * Estados: si hay `file` nuevo se previsualiza; si `remove` es `true` (y no
 * hay archivo nuevo) se muestra el hueco vacío y al guardar se envía `""`
 * para que el backend elimine la imagen actual. Dejar el campo vacío sin
 * más es válido: no se envía nada y la imagen no cambia.
 */
export function ImageInput({ currentUrl, file, remove, onFileChange, onRemoveChange, label = "Imagen", hint, alt, disabled = false, }) {
    // La URL de vista previa se deriva del archivo: se crea una sola vez por
    // archivo y se revoca cuando cambia o al desmontar.
    const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
    useEffect(() => {
        return () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);
    const preview = file ? previewUrl : remove ? null : currentUrl ?? null;
    const puedeQuitar = Boolean(file) || Boolean(currentUrl);
    function handleFile(event) {
        onFileChange(event.target.files?.[0] ?? null);
        if (event.target.files?.[0]) {
            onRemoveChange(false);
        }
    }
    function quitar() {
        onFileChange(null);
        onRemoveChange(Boolean(currentUrl));
    }
    function restaurar() {
        onFileChange(null);
        onRemoveChange(false);
    }
    return (<div className="flex flex-col gap-3 rounded-xl border border-dashed border-slate-300 p-4 sm:flex-row sm:items-center">
      <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        {preview ? (<img src={preview} alt={alt ?? label} className="h-full w-full object-contain"/>) : (<ImagePlus className="h-6 w-6 text-slate-400"/>)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {hint ?? "PNG, JPG o WEBP de hasta 2 MB. Es opcional: puedes dejarlo vacío."}
        </p>
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile} disabled={disabled} aria-label={label} className="mt-3 block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"/>
      </div>
      <div className="flex shrink-0 gap-2 sm:flex-col">
        {puedeQuitar && !disabled ? (<Button type="button" variant="ghost" className="px-2.5 py-2 text-xs" onClick={quitar} icon={<X className="h-3.5 w-3.5"/>}>
            Quitar
          </Button>) : null}
        {remove && !disabled ? (<Button type="button" variant="ghost" className="px-2.5 py-2 text-xs" onClick={restaurar} icon={<RotateCcw className="h-3.5 w-3.5"/>}>
            Restaurar
          </Button>) : null}
      </div>
    </div>);
}
