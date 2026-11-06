"""Comando idempotente de primer arranque."""

import os

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

from apps.accounts.models import Rol
from apps.inventory.services import seed_inventario


class Command(BaseCommand):
    help = "Aplica migraciones, siembra catálogos y crea el superusuario inicial."

    def handle(self, *args, **options):
        call_command("migrate", interactive=False)

        seed_inventario()

        User = get_user_model()
        if User.objects.exists():
            self.stdout.write(self.style.WARNING("Ya existen usuarios; no se crea ninguno."))
            return

        email = os.getenv("DJANGO_SUPERUSER_EMAIL")
        password = os.getenv("DJANGO_SUPERUSER_PASSWORD")
        nombre = os.getenv("DJANGO_SUPERUSER_NOMBRE", "Administrador")

        if not email or not password:
            raise CommandError(
                "Define DJANGO_SUPERUSER_EMAIL y DJANGO_SUPERUSER_PASSWORD en el archivo .env."
            )

        user = User.objects.create_superuser(
            email=email,
            password=password,
            nombre=nombre,
            rol=Rol.ADMIN,
        )
        user.must_change_password = True
        user.save(update_fields=["must_change_password"])

        self.stdout.write(
            self.style.SUCCESS(
                f"Superusuario creado: {user.email}. "
                "Debe cambiar la contraseña en el primer inicio de sesión."
            )
        )
