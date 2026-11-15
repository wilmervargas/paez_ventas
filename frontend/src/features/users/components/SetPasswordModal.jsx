import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { getErrorMessage } from "../../../lib/errors";
import { useSetUserPassword } from "../hooks";

const schema = z.object({
  new_password: z.string().min(12, "La contraseña debe tener al menos 12 caracteres."),
  must_change_password: z.boolean().default(false),
});

export function SetPasswordModal({ user, onClose }) {
  const mutation = useSetUserPassword();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { new_password: "", must_change_password: false },
  });

  async function onSubmit(values) {
    try {
      await mutation.mutateAsync({ id: user.id, payload: values });
      onClose();
    } catch (err) {
      setError("root", { message: getErrorMessage(err, "No se pudo actualizar la contraseña.") });
    }
  }

  return (
    <Modal open onClose={onClose} title={`Cambiar clave · ${user.nombre}`}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {errors.root?.message ? <Alert tone="error">{errors.root.message}</Alert> : null}
        <p className="text-sm text-slate-600">
          Define una nueva contraseña para <strong>{user.email}</strong>. Las sesiones activas del usuario se revocarán.
        </p>
        <Input
          label="Nueva contraseña *"
          type="password"
          placeholder="Mínimo 12 caracteres"
          error={errors.new_password?.message}
          {...register("new_password")}
        />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...register("must_change_password")} />
          Exigir cambio de contraseña al iniciar sesión
        </label>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={isSubmitting || mutation.isPending}>Actualizar clave</Button>
        </div>
      </form>
    </Modal>
  );
}
