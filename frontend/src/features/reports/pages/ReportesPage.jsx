import { ArrowRight, BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { PageHeader } from "../../../components/ui/PageHeader";
import { useAuth } from "../../../context/auth-context";
import { reportesDisponibles } from "../config";

export function ReportesPage() {
  const { user } = useAuth();
  const disponibles = reportesDisponibles(user?.rol);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BarChart3}
        title="Reportes"
        description="Consulta la operación del negocio con filtros y exporta cualquier reporte a PDF o Excel."
      />

      {disponibles.length === 0 ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="Sin reportes disponibles"
            description="Tu rol no tiene reportes asignados. Contacta al administrador."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {disponibles.map((reporte) => {
            const Icon = reporte.icon;
            return (
              <Link
                key={reporte.tipo}
                to={`/app/reportes/${reporte.tipo}`}
                className="group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                <Card className="h-full transition group-hover:-translate-y-0.5 group-hover:border-indigo-200 group-hover:shadow-md">
                  <div className="flex h-full flex-col gap-4 p-5">
                    <div className="flex items-start justify-between">
                      <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
                        <Icon className="h-5 w-5" />
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">{reporte.label}</h2>
                      <p className="mt-1 text-sm text-slate-500">{reporte.descripcion}</p>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
