import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { useAuth } from "../../context/auth-context";
import { api } from "../../lib/api";
import { getErrorMessage } from "../../lib/errors";
const schema = z
    .object({
    current_password: z.string().min(1, "Ingresa tu contraseña actual"),
    new_password: z
        .string()
        .min(12, "La nueva contraseña debe tener al menos 12 caracteres"),
    confirm_password: z.string().min(1, "Confirma la nueva contraseña"),
})
    .refine((data) => data.new_password === data.confirm_password, {
    message: "Las contraseñas no coinciden",
    path: ["confirm_password"],
});
export function ChangePasswordPage() {
    const { logout } = useAuth();
    const navigate = useNavigate();
    const [error, setError] = useState(null);
    const { register, handleSubmit, formState: { errors, isSubmitting }, } = useForm({
        resolver: zodResolver(schema),
        defaultValues: {
            current_password: "",
            new_password: "",
            confirm_password: "",
        },
    });
    const onSubmit = handleSubmit(async (values) => {
        setError(null);
        try {
            await api.post("/auth/change-password/", {
                current_password: values.current_password,
                new_password: values.new_password,
            });
            await logout();
            navigate("/login", {
                replace: true,
                state: { message: "Contraseña actualizada. Inicia sesión nuevamente." },
            });
        }
        catch (err) {
            setError(getErrorMessage(err, "No se pudo cambiar la contraseña."));
        }
    });
    return (<div className="mx-auto max-w-xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
            <KeyRound className="h-5 w-5"/>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Actualiza tu contraseña</h1>
            <p className="text-sm text-slate-500">
              Por seguridad debes reemplazar la contraseña temporal.
            </p>
          </div>
        </div>

        <Alert tone="warning" className="mb-6">
          Usa al menos 12 caracteres. No reutilices la contraseña temporal ni datos
          personales fáciles de adivinar.
        </Alert>

        {error ? (<Alert tone="error" className="mb-6">
            {error}
          </Alert>) : null}

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Input label="Contraseña actual" type="password" autoComplete="current-password" error={errors.current_password?.message} {...register("current_password")}/>
          <Input label="Nueva contraseña" type="password" autoComplete="new-password" error={errors.new_password?.message} {...register("new_password")}/>
          <Input label="Confirmar nueva contraseña" type="password" autoComplete="new-password" error={errors.confirm_password?.message} {...register("confirm_password")}/>
          <Button type="submit" loading={isSubmitting} className="w-full">
            Guardar y salir
          </Button>
        </form>
      </div>
    </div>);
}
