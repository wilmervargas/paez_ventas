import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { Select } from "../../../components/ui/Select";
import { getErrorMessage } from "../../../lib/errors";
import { useSaveTasa } from "../hooks";
const MONEDAS = ["USD", "EUR", "USDT"];
const schema = z.object({
    moneda_base: z.enum(["USD", "EUR", "USDT"]),
    tasa: z
        .string()
        .trim()
        .regex(/^\d{1,12}([.,]\d{1,6})?$/, "Usa un número, por ejemplo 36.50")
        .refine((value) => Number(value.replace(",", ".")) > 0, "La tasa debe ser mayor que cero"),
    fuente: z.enum(["bcv", "usdt", "manual"]),
    vigente_desde: z
        .string()
        .min(1, "Indica la fecha y hora")
        .refine((value) => !Number.isNaN(new Date(value).getTime()), "Fecha inválida"),
});
function pad(value) {
    return String(value).padStart(2, "0");
}
/** Convierte una fecha ISO a un valor aceptable por `input[type=datetime-local]`. */
function toLocalInput(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function nowLocalInput() {
    return toLocalInput(new Date().toISOString());
}
function monedaDe(tasa) {
    const base = tasa?.moneda_base ?? "USD";
    return MONEDAS.includes(base) ? base : "USD";
}
function toDefaults(tasa) {
    return {
        moneda_base: monedaDe(tasa),
        tasa: tasa?.tasa ?? "",
        fuente: tasa?.fuente ?? "bcv",
        vigente_desde: tasa ? toLocalInput(tasa.vigente_desde) : nowLocalInput(),
    };
}
export function TasaFormModal({ tasa, onClose }) {
    const [error, setError] = useState(null);
    const mutation = useSaveTasa();
    const { register, handleSubmit, control, setValue, formState: { errors, isSubmitting }, } = useForm({
        resolver: zodResolver(schema),
        defaultValues: toDefaults(tasa),
    });
    const monedaBase = useWatch({ control, name: "moneda_base" });
    const fuente = useWatch({ control, name: "fuente" });
    const tasaValor = useWatch({ control, name: "tasa" });
    // La fuente sigue a la moneda mientras se crea una tasa nueva; al corregir
    // una existente se respeta lo que ya estaba registrado.
    useEffect(() => {
        if (tasa) {
            return;
        }
        setValue("fuente", monedaBase === "USDT" ? "usdt" : "bcv");
    }, [monedaBase, tasa, setValue]);
    const onSubmit = handleSubmit(async (values) => {
        setError(null);
        const payload = {
            moneda: "VES",
            moneda_base: values.moneda_base,
            tasa: values.tasa.replace(",", "."),
            fuente: values.fuente,
            vigente_desde: new Date(values.vigente_desde).toISOString(),
        };
        try {
            if (tasa) {
                await mutation.mutateAsync({ id: tasa.id, payload });
            }
            else {
                await mutation.mutateAsync({ payload });
            }
            onClose();
        }
        catch (err) {
            setError(getErrorMessage(err, "No se pudo guardar la tasa de cambio."));
        }
    });
    return (<Modal open onClose={onClose} title={tasa ? "Corregir tasa" : "Registrar tasa del día"} description="La tasa se guarda como bolívares por 1 unidad de la moneda elegida." footer={<div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="tasa-form" loading={isSubmitting} icon={<Save className="h-4 w-4"/>}>
            Guardar
          </Button>
        </div>}>
      {error ? (<Alert tone="error" className="mb-5">
          {error}
        </Alert>) : null}

      <form id="tasa-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Moneda *" error={errors.moneda_base?.message} hint="Se cotiza contra el bolívar (VES)." {...register("moneda_base")}>
            <option value="USD">Dólar (USD)</option>
            <option value="EUR">Euro (EUR)</option>
            <option value="USDT">USDT</option>
          </Select>

          <Input label="Tasa (Bs por 1 unidad) *" inputMode="decimal" placeholder="36.50" error={errors.tasa?.message} {...register("tasa")}/>

          <Select label="Fuente *" error={errors.fuente?.message} {...register("fuente")}>
            <option value="bcv">BCV</option>
            <option value="usdt">USDT / paralelo</option>
            <option value="manual">Manual</option>
          </Select>

          <Input label="Vigente desde *" type="datetime-local" error={errors.vigente_desde?.message} {...register("vigente_desde")}/>
        </div>

        <Alert tone="info">
          Se guardará{" "}
          <strong>
            1 {monedaBase} = {tasaValor || "0,00"} Bs
          </strong>{" "}
          con fuente{" "}
          <strong>{fuente === "bcv" ? "BCV" : fuente === "usdt" ? "USDT" : "Manual"}</strong>.
          Puedes registrar varias tasas el mismo día: aplica la última.
        </Alert>
      </form>
    </Modal>);
}
