import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { api } from "../../lib/api";
import { getErrorMessage } from "../../lib/errors";

const schema = z
  .object({
    new_password: z.string().min(12, "La contraseña debe tener al menos 12 caracteres"),
    confirm_password: z.string().min(1, "Confirma la nueva contraseña"),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Las contraseñas no coinciden",
    path: ["confirm_password"],
  });

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const uid = params.get("uid") || "";
  const token = params.get("token") || "";
  const linkValido = useMemo(() => Boolean(uid && token), [uid, token]);
  const [error, setError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { new_password: "", confirm_password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await api.post("/auth/password-reset/confirm/", {
        uid,
        token,
        new_password: values.new_password,
      });
      navigate("/login", {
        replace: true,
        state: { message: "Contraseña restablecida correctamente. Inicia sesión." },
      });
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo restablecer la contraseña."));
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Restablecer contraseña</h1>
            <p className="text-sm text-slate-500">Crea una nueva contraseña para tu cuenta.</p>
          </div>
        </div>

        {!linkValido ? (
          <div className="space-y-4">
            <Alert tone="error">El enlace de recuperación no es válido o está incompleto.</Alert>
            <Link to="/forgot-password" className="block text-center text-sm font-medium text-indigo-600 hover:text-indigo-500">
              Solicitar un nuevo enlace
            </Link>
          </div>
        ) : (
          <>
            {error ? <Alert tone="error" className="mb-4">{error}</Alert> : null}
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <Input
                label="Nueva contraseña"
                type="password"
                autoComplete="new-password"
                error={errors.new_password?.message}
                {...register("new_password")}
              />
              <Input
                label="Confirmar nueva contraseña"
                type="password"
                autoComplete="new-password"
                error={errors.confirm_password?.message}
                {...register("confirm_password")}
              />
              <Button type="submit" loading={isSubmitting} className="w-full">
                Restablecer contraseña
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
