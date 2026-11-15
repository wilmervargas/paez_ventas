import { DatabaseBackup, Mail } from "lucide-react";
import { useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { useAuth } from "../../../context/auth-context";
import { api } from "../../../lib/api";
import { getErrorMessage } from "../../../lib/errors";

export function MantenimientoPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  if (!user?.is_superuser) {
    return (
      <Alert tone="warning" title="Acceso restringido">
        Solo los superusuarios pueden realizar respaldos del sistema.
      </Alert>
    );
  }

  async function handleBackup() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { data } = await api.post("/company/respaldo/");
      setSuccess(data?.detail || "Respaldo generado y enviado correctamente.");
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo generar o enviar el respaldo."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={DatabaseBackup}
        title="Respaldo del sistema"
        description="Genera una copia de seguridad de la base de datos y la envía por correo."
      />

      {success ? <Alert tone="success">{success}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Card>
        <CardHeader
          title="Hacer respaldo"
          description="Comprime el archivo de base de datos actual y lo envía al correo de respaldo configurado, conservando intacta la base de datos en el servidor."
        />
        <CardBody className="space-y-4">
          <Alert tone="info" title="Respaldo por correo">
            <div className="flex items-start gap-2">
              <Mail className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Se generará un archivo comprimido de <strong>db.sqlite3</strong> con la fecha actual y se enviará a{" "}
                <strong>danielpaez.dell@gmail.com</strong>. El archivo original en el servidor no se modifica.
              </p>
            </div>
          </Alert>
          <div className="flex justify-end">
            <Button
              loading={loading}
              icon={<DatabaseBackup className="h-4 w-4" />}
              onClick={() => void handleBackup()}
            >
              Generar y enviar respaldo
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
