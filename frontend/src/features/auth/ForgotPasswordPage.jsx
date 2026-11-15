import { zodResolver } from "@hookform/resolvers/zod";
import { Mail } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { api } from "../../lib/api";
import { getErrorMessage } from "../../lib/errors";

const schema = z.object({
  email: z.string().min(1, "Ingresa tu correo").email("Correo inválido"),
});

export function ForgotPasswordPage() {
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await api.post("/auth/password-reset/", { email: values.email });
      setSent(true);
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo procesar la solicitud."));
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Recuperar contraseña</h1>
            <p className="text-sm text-slate-500">
              Te enviaremos un enlace a tu correo registrado.
            </p>
          </div>
        </div>

        {sent ? (
          <div className="space-y-4">
            <Alert tone="success">
              Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.
              Revisa tu bandeja de entrada y la carpeta de spam.
            </Alert>
            <Link to="/login" className="block text-center text-sm font-medium text-indigo-600 hover:text-indigo-500">
              Volver a iniciar sesión
            </Link>
          </div>
        ) : (
          <>
            {error ? <Alert tone="error" className="mb-4">{error}</Alert> : null}
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <Input
                label="Correo electrónico"
                type="email"
                autoComplete="email"
                placeholder="tu@empresa.com"
                error={errors.email?.message}
                {...register("email")}
              />
              <Button type="submit" loading={isSubmitting} className="w-full">
                Enviar enlace de recuperación
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-slate-500">
              <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
                Volver a iniciar sesión
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
