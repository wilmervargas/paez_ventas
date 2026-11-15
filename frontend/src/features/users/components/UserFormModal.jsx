import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { Select } from "../../../components/ui/Select";
import { getErrorMessage } from "../../../lib/errors";
import { useSaveUser } from "../hooks";

const baseSchema = z.object({
  email: z.string().trim().min(1, "El correo es obligatorio").email("Correo inválido"),
  nombre: z.string().trim().min(1, "El nombre es obligatorio"),
  telefono: z.string().trim().optional().default(""),
  rol: z.enum(["admin", "vendedor", "cobrador", "almacenista"]),
  is_active: z.boolean().default(true),
  is_superuser: z.boolean().default(false),
  must_change_password: z.boolean().default(true),
  password: z.string().optional().default(""),
});

function buildSchema(isEdit) {
  return baseSchema.superRefine((values, ctx) => {
    if (!isEdit && !values.password.trim()) {
      ctx.addIssue({ code: "custom", path: ["password"], message: "La contraseña es obligatoria." });
    }
    if (values.password && values.password.trim().length > 0 && values.password.trim().length < 12) {
      ctx.addIssue({ code: "custom", path: ["password"], message: "La contraseña debe tener al menos 12 caracteres." });
    }
  });
}

export function UserFormModal({ user, onClose }) {
  const isEdit = Boolean(user?.id);
  const save = useSaveUser();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
    setError,
  } = useForm({
    resolver: zodResolver(buildSchema(isEdit)),
    defaultValues: {
      email: user?.email ?? "",
      nombre: user?.nombre ?? "",
      telefono: user?.telefono ?? "",
      rol: user?.rol ?? "vendedor",
      is_active: user?.is_active ?? true,
      is_superuser: user?.is_superuser ?? false,
      must_change_password: user?.must_change_password ?? true,
      password: "",
    },
  });

  useEffect(() => {
    reset({
      email: user?.email ?? "",
      nombre: user?.nombre ?? "",
      telefono: user?.telefono ?? "",
      rol: user?.rol ?? "vendedor",
      is_active: user?.is_active ?? true,
      is_superuser: user?.is_superuser ?? false,
      must_change_password: user?.must_change_password ?? true,
      password: "",
    });
  }, [user, reset]);

  async function onSubmit(values) {
    const payload = {
      email: values.email.trim().toLowerCase(),
      nombre: values.nombre.trim(),
      telefono: values.telefono?.trim() || "",
      rol: values.rol,
      is_active: Boolean(values.is_active),
      is_superuser: Boolean(values.is_superuser),
      must_change_password: Boolean(values.must_change_password),
    };
    if (values.password && values.password.trim()) {
      payload.password = values.password;
    }
    try {
      await save.mutateAsync({ id: user?.id, payload });
      onClose();
    } catch (err) {
      const message = getErrorMessage(err, "No se pudo guardar el usuario.");
      setError("root", { message });
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? "Editar usuario" : "Nuevo usuario"}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {errors.root?.message ? <Alert tone="error">{errors.root.message}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Correo *" type="email" error={errors.email?.message} {...register("email")} />
          <Input label="Nombre *" error={errors.nombre?.message} {...register("nombre")} />
          <Input label="Teléfono" placeholder="584141234567" error={errors.telefono?.message} {...register("telefono")} />
          <Select label="Rol *" error={errors.rol?.message} {...register("rol")}>
            <option value="admin">Administrador</option>
            <option value="vendedor">Vendedor</option>
            <option value="cobrador">Cobrador</option>
            <option value="almacenista">Almacenista</option>
          </Select>
        </div>
        <Input
          label={isEdit ? "Nueva contraseña (opcional)" : "Contraseña *"}
          type="password"
          placeholder={isEdit ? "Déjalo vacío para no cambiarla" : "Mínimo 12 caracteres"}
          error={errors.password?.message}
          {...register("password")}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...register("is_active")} />
            Usuario activo
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...register("is_superuser")} />
            Superusuario
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" {...register("must_change_password")} />
            Debe cambiar clave
          </label>
        </div>
        <p className="text-xs text-slate-500">
          Los superusuarios tienen acceso a gestión de usuarios y respaldo del sistema.
        </p>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={isSubmitting || save.isPending}>
            {isEdit ? "Guardar cambios" : "Crear usuario"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
