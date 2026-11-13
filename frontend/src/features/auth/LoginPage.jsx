import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { FullPageLoader } from "../../components/ui/Spinner";
import { useAuth } from "../../context/auth-context";
import { api } from "../../lib/api";
import { getErrorMessage } from "../../lib/errors";
const schema = z.object({
    email: z.string().min(1, "Ingresa tu correo").email("Correo inválido"),
    password: z.string().min(1, "Ingresa tu contraseña"),
});
export function LoginPage() {
    const { status, login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [error, setError] = useState(null);
    const [company, setCompany] = useState(null);
    const state = location.state;
    const from = state?.from?.pathname ?? "/app";
    const { register, handleSubmit, formState: { errors, isSubmitting }, } = useForm({
        resolver: zodResolver(schema),
        defaultValues: { email: "", password: "" },
    });
    useEffect(() => {
        if (status === "authenticated") {
            navigate(from, { replace: true });
        }
    }, [status, navigate, from]);
    useEffect(() => {
        let cancelled = false;
        async function loadCompany() {
            try {
                const { data } = await api.get("/company/");
                if (!cancelled) {
                    setCompany(data);
                }
            }
            catch {
                if (!cancelled) {
                    setCompany(null);
                }
            }
        }
        void loadCompany();
        return () => {
            cancelled = true;
        };
    }, []);
    const onSubmit = handleSubmit(async (values) => {
        setError(null);
        try {
            await login(values.email, values.password);
        }
        catch (err) {
            setError(getErrorMessage(err, "No se pudo iniciar sesión."));
        }
    });
    if (status === "loading") {
        return (<div className="grid min-h-screen place-items-center bg-slate-100">
        <FullPageLoader label="Verificando sesión..."/>
      </div>);
    }
    return (<div className="flex min-h-screen bg-slate-100">
      <section className="relative hidden w-1/2 overflow-hidden bg-slate-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-indigo-500/30 blur-3xl"/>
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl"/>

        <div className="relative flex flex-1 flex-col items-center justify-center gap-8 text-center">
          {company?.logo_url ? (
            <div className="flex h-44 w-44 items-center justify-center overflow-hidden rounded-full bg-white/10 p-4 shadow-lg ring-1 ring-white/10 sm:h-56 sm:w-56 lg:h-64 lg:w-64">
              <img
                src={company.logo_url}
                alt={`Logo de ${company.nombre_comercial || company.razon_social || "la empresa"}`}
                className="h-full w-full scale-110 object-cover"
              />
            </div>
          ) : (
            <div className="grid h-44 w-44 place-items-center overflow-hidden rounded-full bg-white/10 text-5xl font-bold text-white shadow-lg ring-1 ring-white/10 sm:h-56 sm:w-56 lg:h-64 lg:w-64">
              {(company?.nombre_comercial || company?.razon_social || "GC").slice(0, 2).toUpperCase()}
            </div>
          )}
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
            Cobros, inventario y ventas.
          </h1>
        </div>

        <p className="relative text-xs text-slate-500">
          © {new Date().getFullYear()} Uso interno
        </p>
      </section>

      <section className="flex w-full items-center justify-center px-4 py-12 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-3">
              {company?.logo_url ? (
                <img
                  src={company.logo_url}
                  alt={`Logo de ${company.nombre_comercial || company.razon_social || "la empresa"}`}
                  className="h-12 w-auto max-w-[180px] object-contain"
                />
              ) : (
                <>
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-sm font-bold text-white">
                    {(company?.nombre_comercial || company?.razon_social || "GC").slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {company?.nombre_comercial || company?.razon_social || "Gestión Comercial"}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          <h2 className="text-2xl font-bold text-slate-900">Iniciar sesión</h2>
          <p className="mt-1 text-sm text-slate-500">
            Accede con tu correo corporativo para continuar.
          </p>

          {state?.message ? (<Alert tone="success" className="mt-6">
              {state.message}
            </Alert>) : null}

          {error ? (<Alert tone="error" className="mt-6">
              {error}
            </Alert>) : null}

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <Input label="Correo electrónico" type="email" autoComplete="email" placeholder="tu@empresa.com" error={errors.email?.message} {...register("email")}/>
            <Input label="Contraseña" type="password" autoComplete="current-password" placeholder="••••••••" error={errors.password?.message} {...register("password")}/>
            <Button type="submit" loading={isSubmitting} className="w-full" icon={<ArrowRight className="h-4 w-4"/>}>
              Entrar
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-slate-500">
            Sistema interno · Acceso restringido
          </p>
        </div>
      </section>
    </div>);
}
