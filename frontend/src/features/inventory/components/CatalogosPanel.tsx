import { Plus, Tags } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Alert } from "../../../components/ui/Alert";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { PageLoader } from "../../../components/ui/Spinner";
import { useAuth } from "../../../context/auth-context";
import { getErrorMessage } from "../../../lib/errors";
import { canManageCatalog } from "../../../lib/roles";
import { useCategorias, useCreateCategoria, useCreateUnidad, useUnidades } from "../hooks";

export function CatalogosPanel() {
  const { user } = useAuth();
  const gestiona = canManageCatalog(user?.rol);

  const categoriasQuery = useCategorias();
  const unidadesQuery = useUnidades();
  const crearCategoria = useCreateCategoria();
  const crearUnidad = useCreateUnidad();

  const [nombreCategoria, setNombreCategoria] = useState("");
  const [nombreUnidad, setNombreUnidad] = useState("");
  const [abreviatura, setAbreviatura] = useState("");

  async function onSubmitCategoria(event: FormEvent) {
    event.preventDefault();
    if (!nombreCategoria.trim()) {
      return;
    }
    try {
      await crearCategoria.mutateAsync(nombreCategoria.trim());
      setNombreCategoria("");
    } catch {
      // El error se muestra desde el estado de la mutación.
    }
  }

  async function onSubmitUnidad(event: FormEvent) {
    event.preventDefault();
    if (!nombreUnidad.trim() || !abreviatura.trim()) {
      return;
    }
    try {
      await crearUnidad.mutateAsync({
        nombre: nombreUnidad.trim(),
        abreviatura: abreviatura.trim(),
      });
      setNombreUnidad("");
      setAbreviatura("");
    } catch {
      // El error se muestra desde el estado de la mutación.
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader
          title="Categorías de producto"
          description="Agrupa el catálogo para filtrar y reportar."
        />
        <CardBody className="space-y-4">
          {gestiona ? (
            <form onSubmit={onSubmitCategoria} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Input
                  label="Nueva categoría"
                  placeholder="Ej. Alimentos"
                  value={nombreCategoria}
                  onChange={(event) => setNombreCategoria(event.target.value)}
                />
              </div>
              <Button
                type="submit"
                loading={crearCategoria.isPending}
                icon={<Plus className="h-4 w-4" />}
              >
                Agregar
              </Button>
            </form>
          ) : null}

          {crearCategoria.isError ? (
            <Alert tone="error">
              {getErrorMessage(crearCategoria.error, "No se pudo crear la categoría.")}
            </Alert>
          ) : null}

          {categoriasQuery.isLoading ? (
            <PageLoader label="Cargando categorías..." />
          ) : categoriasQuery.isError ? (
            <Alert tone="error">
              {getErrorMessage(categoriasQuery.error, "No se pudieron cargar las categorías.")}
            </Alert>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {(categoriasQuery.data?.results ?? []).map((categoria) => (
                <li key={categoria.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-sm font-medium text-slate-800">{categoria.nombre}</span>
                  <Badge tone={categoria.activo ? "success" : "neutral"}>
                    {categoria.activo ? "Activa" : "Inactiva"}
                  </Badge>
                </li>
              ))}
              {(categoriasQuery.data?.results ?? []).length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-slate-500">
                  No hay categorías registradas.
                </li>
              ) : null}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Unidades de medida"
          description="Define cómo se vende cada producto: unidad, caja, kilo, litro."
        />
        <CardBody className="space-y-4">
          {gestiona ? (
            <form onSubmit={onSubmitUnidad} className="grid gap-2 sm:grid-cols-[1fr_130px_auto] sm:items-end">
              <Input
                label="Nueva unidad"
                placeholder="Ej. Kilogramo"
                value={nombreUnidad}
                onChange={(event) => setNombreUnidad(event.target.value)}
              />
              <Input
                label="Abreviatura"
                placeholder="KG"
                maxLength={10}
                value={abreviatura}
                onChange={(event) => setAbreviatura(event.target.value.toUpperCase())}
              />
              <Button
                type="submit"
                loading={crearUnidad.isPending}
                icon={<Plus className="h-4 w-4" />}
              >
                Agregar
              </Button>
            </form>
          ) : null}

          {crearUnidad.isError ? (
            <Alert tone="error">
              {getErrorMessage(crearUnidad.error, "No se pudo crear la unidad.")}
            </Alert>
          ) : null}

          {unidadesQuery.isLoading ? (
            <PageLoader label="Cargando unidades..." />
          ) : unidadesQuery.isError ? (
            <Alert tone="error">
              {getErrorMessage(unidadesQuery.error, "No se pudieron cargar las unidades.")}
            </Alert>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {(unidadesQuery.data?.results ?? []).map((unidad) => (
                <li key={unidad.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-sm font-medium text-slate-800">{unidad.nombre}</span>
                  <Badge tone="info">{unidad.abreviatura}</Badge>
                </li>
              ))}
              {(unidadesQuery.data?.results ?? []).length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-slate-500">
                  No hay unidades registradas.
                </li>
              ) : null}
            </ul>
          )}
        </CardBody>
      </Card>

      {!gestiona ? (
        <div className="xl:col-span-2">
          <Alert tone="info">
            <span className="inline-flex items-center gap-2">
              <Tags className="h-4 w-4" />
              Solo el administrador puede crear categorías y unidades.
            </span>
          </Alert>
        </div>
      ) : null}
    </div>
  );
}
