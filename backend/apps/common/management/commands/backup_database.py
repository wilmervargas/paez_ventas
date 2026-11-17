"""Respaldo de la base de datos SQLite.

Crea una copia fechada del archivo de base de datos, aplica retención y
(opcionalmente) envía el respaldo por correo.
"""

from __future__ import annotations

import logging
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

from django.conf import settings
from django.core.mail import EmailMessage
from django.core.management.base import BaseCommand, CommandError

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Crea un respaldo de la base de datos SQLite y lo envía por correo."

    def add_arguments(self, parser):
        parser.add_argument(
            "--output-dir",
            default=str(getattr(settings, "BACKUP_DIR", settings.BASE_DIR / "backups")),
            help="Directorio donde se guardará el respaldo (por defecto: BACKUP_DIR o <BASE_DIR>/backups).",
        )
        parser.add_argument(
            "--retention-days",
            type=int,
            default=int(getattr(settings, "BACKUP_RETENTION_DAYS", 30)),
            help="Días de retención de respaldos locales (por defecto: 30). Usa 0 para no limpiar.",
        )
        parser.add_argument(
            "--email-to",
            default=getattr(settings, "BACKUP_EMAIL_TO", ""),
            help="Correo destino del respaldo. Si se omite, usa BACKUP_EMAIL_TO de settings.",
        )
        parser.add_argument(
            "--no-email",
            action="store_true",
            help="No enviar el respaldo por correo (solo crear copia local).",
        )
        parser.add_argument(
            "--subject",
            default="Respaldo de base de datos",
            help="Asunto del correo de respaldo.",
        )

    def handle(self, *args, **options):
        db_path = self._get_sqlite_path()
        output_dir = Path(options["output_dir"])
        output_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"db_backup_{timestamp}.sqlite3"
        backup_path = output_dir / backup_name

        self._create_backup(db_path, backup_path)
        self.stdout.write(self.style.SUCCESS(f"Respaldo creado: {backup_path}"))

        retention_days = options["retention_days"]
        if retention_days and retention_days > 0:
            removed = self._apply_retention(output_dir, retention_days)
            if removed:
                self.stdout.write(f"Retención aplicada: {removed} respaldo(s) antiguo(s) eliminado(s).")

        if options["no_email"]:
            return

        recipient = (options["email_to"] or "").strip()
        if not recipient:
            raise CommandError(
                "No se indicó destinatario de correo. Configura BACKUP_EMAIL_TO en .env o usa --email-to."
            )

        self._send_email(recipient, options["subject"], backup_path)
        self.stdout.write(self.style.SUCCESS(f"Respaldo enviado a: {recipient}"))

    def _get_sqlite_path(self) -> Path:
        db = settings.DATABASES.get("default", {})
        engine = db.get("ENGINE", "")
        if "sqlite3" not in engine:
            raise CommandError("La rutina de respaldo solo soporta bases de datos SQLite.")
        name = db.get("NAME")
        if not name:
            raise CommandError("No se encontró la ruta de la base de datos (DATABASES['default']['NAME']).")
        path = Path(name)
        if not path.exists():
            raise CommandError(f"El archivo de base de datos no existe: {path}")
        return path

    def _create_backup(self, source: Path, destination: Path) -> None:
        """Copia consistente usando la API de backup de sqlite3 (compatible con WAL)."""
        try:
            src_conn = sqlite3.connect(str(source))
            try:
                dst_conn = sqlite3.connect(str(destination))
                try:
                    src_conn.backup(dst_conn)
                finally:
                    dst_conn.close()
            finally:
                src_conn.close()
        except Exception as exc:
            if destination.exists():
                try:
                    destination.unlink()
                except OSError:
                    pass
            logger.exception("Error creando respaldo de base de datos")
            raise CommandError(f"No se pudo crear el respaldo: {exc}") from exc

    def _apply_retention(self, directory: Path, days: int) -> int:
        cutoff = datetime.now() - timedelta(days=days)
        removed = 0
        for path in directory.glob("db_backup_*.sqlite3"):
            try:
                mtime = datetime.fromtimestamp(path.stat().st_mtime)
            except OSError:
                continue
            if mtime < cutoff:
                try:
                    path.unlink()
                    removed += 1
                except OSError:
                    logger.warning("No se pudo eliminar respaldo antiguo: %s", path)
        return removed

    def _send_email(self, recipient: str, subject: str, backup_path: Path) -> None:
        body = (
            "Se adjunta el respaldo de la base de datos.\n\n"
            f"Archivo: {backup_path.name}\n"
            f"Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        )
        try:
            email = EmailMessage(
                subject=subject,
                body=body,
                from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
                to=[recipient],
            )
            email.attach_file(str(backup_path))
            sent = email.send(fail_silently=False)
        except Exception as exc:
            logger.exception("Error enviando respaldo por correo")
            raise CommandError(f"Respaldo creado en {backup_path}, pero no se pudo enviar por correo: {exc}") from exc
        if sent != 1:
            raise CommandError(f"Respaldo creado en {backup_path}, pero el envío de correo no fue confirmado.")
