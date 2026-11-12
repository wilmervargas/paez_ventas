import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { FullPageLoader } from "../../components/ui/Spinner";
import { useAuth } from "../../context/auth-context";
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

        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-indigo-500 text-lg font-bold">
            GC
          </div>
          <div>
            <p className="text-base font-semibold">Gestión</p>
            <p className="text-xs text-slate-400">Comercial</p>
          </div>
        </div>

        <div className="relative max-w-lg">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">
            Sistema interno
          </p>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
            Cobros, inventario y ventas.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            Control de clientes, productos, pedidos y cuentas por cobrar con
            trazabilidad completa y recordatorios de pago por WhatsApp.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <ShieldCheck className="mb-2 h-5 w-5 text-emerald-400"/>
              Acceso seguro por roles
            </div>
          </div>
        </div>

        <p className="relative text-xs text-slate-500">
          © {new Date().getFullYear()} Uso interno
        </p>
      </section>

      <section className="flex w-full items-center justify-center px-4 py-12 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-sm font-bold text-white">
                P
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Gestión</p>
                <p className="text-xs text-slate-500">Comercial</p>
              </div>
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
