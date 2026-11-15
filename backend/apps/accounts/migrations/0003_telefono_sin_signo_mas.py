"""Quita el signo '+' del teléfono de los usuarios."""

import re

from django.db import migrations


def _sin_signo_mas(valor):
    """Deja el teléfono sin '+' conservando el resto de los dígitos."""
    limpio = re.sub(r"[\s\-()]+", "", str(valor or ""))
    return limpio.lstrip("+")


def forwards(apps, schema_editor):
    User = apps.get_model("accounts", "User")

    for user in User.objects.exclude(telefono="").exclude(telefono__isnull=True):
        nuevo = _sin_signo_mas(user.telefono)
        if nuevo != user.telefono:
            user.telefono = nuevo
            user.save(update_fields=["telefono"])


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_useremailadicional"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]