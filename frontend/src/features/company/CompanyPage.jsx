import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { ImageInput } from "../../components/ui/ImageInput";
import { Input } from "../../components/ui/Input";
import { PageLoader } from "../../components/ui/Spinner";
import { TextArea } from "../../components/ui/TextArea";
import { useAuth } from "../../context/auth-context";
import { useCompany } from "../../context/company-context";
import { api } from "../../lib/api";
import { getErrorMessage } from "../../lib/errors";
import { canManageCompany } from "../../lib/roles";
const schema = z.object({
    razon_social: z.string().trim().min(1, "La razón social es obligatoria"),
    nombre_comercial: z.string().trim(),
    rif: z.string().trim().min(1, "El RIF es obligatorio").max(20),
    representante: z.string().trim(),
    direccion: z.string().trim(),
    telefono: z.string().trim(),
    email: z.union([z.literal(""), z.string().email("Correo inválido")]),
    eslogan: z.string().trim(),
    moneda_base: z
        .string()
        .trim()
        .regex(/^[A-Za-z]{3}$/, "Usa un código ISO de 3 letras (ej. USD)"),
    iva_rate: z
        .string()
        .trim()
        .regex(/^\d{1,3}(\.\d{1,2})?$/, "Usa un número, por ejemplo 16.00"),
    igtf_rate: z
        .string()
        .trim()
        .regex(/^\d{1,3}(\.\d{1,2})?$/, "Usa un número, por ejemplo 0.00"),
});
function toFormValues(company) {
    return {
        razon_social: company?.razon_social ?? "",
        nombre_comercial: company?.nombre_comercial ?? "",
        rif: company?.rif ?? "",
        representante: company?.representante ?? "",
        direccion: company?.direccion ?? "",
        telefono: company?.telefono ?? "",
        email: company?.email ?? "",
        eslogan: company?.eslogan ?? "",
        moneda_base: company?.moneda_base ?? "USD",
        iva_rate: company?.iva_rate ?? "16.00",
        igtf_rate: company?.igtf_rate ?? "0.00",
    };
}
export function CompanyPage() {
    const { user } = useAuth();
    const { company, isLoading } = useCompany();
    const queryClient = useQueryClient();
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [logoFile, setLogoFile] = useState(null);
    const [quitarLogo, setQuitarLogo] = useState(false);
    const { register, handleSubmit, reset, formState: { errors, isSubmitting }, } = useForm({
        resolver: zodResolver(schema),
        defaultValues: toFormValues(company),
    });
    useEffect(() => {
        reset(toFormValues(company));
    }, [company, reset]);
    if (!canManageCompany(user?.rol)) {
        return (<Alert tone="warning" title="Acceso restringido">
        Solo el administrador puede configurar los datos fiscales de la empresa.
        Solicita apoyo a un usuario con rol Administrador.
      </Alert>);
    }
    if (isLoading) {
        return <PageLoader label="Cargando datos de la empresa..."/>;
    }
    const onSubmit = handleSubmit(async (values) => {
        setError(null);
        setSuccess(null);
        const payload = {
            ...values,
            moneda_base: values.moneda_base.toUpperCase(),
        };
        try {
            if (logoFile || quitarLogo) {
                const formData = new FormData();
                Object.entries(payload).forEach(([key, value]) => {
                    formData.append(key, value);
                });
                // `""` pide al backend eliminar el logo guardado.
                formData.append("logo", logoFile ?? "");
                await api.request({
                    url: "/company/",
                    method: company ? "patch" : "put",
                    data: formData,
                });
            }
            else {
                await api.request({
                    url: "/company/",
                    method: company ? "patch" : "put",
                    data: payload,
                });
            }
            await queryClient.invalidateQueries({ queryKey: ["company"] });
            setLogoFile(null);
            setQuitarLogo(false);
            setSuccess("Datos de la empresa guardados correctamente.");
        }
        catch (err) {
            setError(getErrorMessage(err, "No se pudieron guardar los datos de la empresa."));
        }
    });
    return (<div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
          <Building2 className="h-5 w-5"/>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {company ? "Datos de la empresa" : "Configura tu empresa"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {company
            ? "Actualiza la información fiscal que se muestra en el sistema y en los documentos."
            : "Antes de operar, registra los datos fiscales de la empresa. Este paso es obligatorio."}
          </p>
        </div>
      </div>

      {success ? <Alert tone="success">{success}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <form onSubmit={onSubmit} noValidate>
        <Card>
          <CardHeader title="Identidad fiscal" description="Estos datos se usan en el encabezado, reportes y mensajes de cobro."/>
          <CardBody className="space-y-6">
            <ImageInput label="Logotipo" hint="PNG, JPG o WEBP de hasta 2 MB. Es opcional: puedes dejarlo vacío." alt="Logo de la empresa" currentUrl={company?.logo_url ?? null} file={logoFile} remove={quitarLogo} onFileChange={setLogoFile} onRemoveChange={setQuitarLogo}/>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Razón social *" placeholder="Empresa, C.A." error={errors.razon_social?.message} {...register("razon_social")}/>
              <Input label="Nombre comercial" placeholder="Nombre de fantasía" error={errors.nombre_comercial?.message} {...register("nombre_comercial")}/>
              <Input label="RIF *" placeholder="J-12345678-9" error={errors.rif?.message} {...register("rif")}/>
              <Input label="Representante" placeholder="Nombre y apellido" error={errors.representante?.message} {...register("representante")}/>
              <Input label="Teléfono" placeholder="+58 414 1234567" error={errors.telefono?.message} {...register("telefono")}/>
              <Input label="Correo electrónico" type="email" placeholder="contacto@empresa.com" error={errors.email?.message} {...register("email")}/>
            </div>

            <TextArea label="Dirección fiscal" rows={3} placeholder="Ciudad, estado, dirección exacta" error={errors.direccion?.message} {...register("direccion")}/>

            <Input label="Eslogan" placeholder="Frase corta para documentos" error={errors.eslogan?.message} {...register("eslogan")}/>

            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="Moneda base" placeholder="USD" maxLength={3} className="uppercase" error={errors.moneda_base?.message} {...register("moneda_base")}/>
              <Input label="IVA (%)" inputMode="decimal" placeholder="16.00" error={errors.iva_rate?.message} {...register("iva_rate")}/>
              <Input label="IGTF (%)" inputMode="decimal" placeholder="0.00" error={errors.igtf_rate?.message} {...register("igtf_rate")}/>
            </div>

            <div className="flex justify-end border-t border-slate-100 pt-5">
              <Button type="submit" loading={isSubmitting} icon={<Save className="h-4 w-4"/>}>
                Guardar empresa
              </Button>
            </div>
          </CardBody>
        </Card>
      </form>
    </div>);
}
