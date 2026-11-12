import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
export function NotFoundPage() {
    return (<div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
          Error 404
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Página no encontrada</h1>
        <p className="mt-2 text-sm text-slate-500">
          La ruta que buscas no existe o fue movida.
        </p>
        <Link to="/app" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
          <ArrowLeft className="h-4 w-4"/>
          Volver al panel
        </Link>
      </div>
    </div>);
}
