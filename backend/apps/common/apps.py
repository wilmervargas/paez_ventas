"""Configuración de la app común y PRAGMAs de SQLite."""

import logging

from django.apps import AppConfig
from django.db.backends.signals import connection_created

logger = logging.getLogger(__name__)


def configure_sqlite(sender, connection, **kwargs) -> None:
    """Activa WAL, timeout de bloqueo y FKs en cada conexión SQLite."""
    if connection.vendor != "sqlite":
        return
    name = str(connection.settings_dict.get("NAME", ""))
    if name == ":memory:" or "mode=memory" in name:
        return
    try:
        with connection.cursor() as cursor:
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA busy_timeout=5000;")
            cursor.execute("PRAGMA foreign_keys=ON;")
    except Exception:  # pragma: no cover - depende del motor/estado del archivo
        logger.warning("No se pudieron aplicar los PRAGMAs de SQLite.", exc_info=True)


class CommonConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.common"

    def ready(self) -> None:
        connection_created.connect(
            configure_sqlite,
            dispatch_uid="apps.common.configure_sqlite",
        )
