"""Modelo de usuario personalizado con login por email y roles."""

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class Rol(models.TextChoices):
    ADMIN = "admin", "Administrador"
    VENDEDOR = "vendedor", "Vendedor"
    COBRADOR = "cobrador", "Cobrador"
    ALMACENISTA = "almacenista", "Almacenista"


class UserManager(BaseUserManager):
    """Manager que usa el email como identificador único."""

    use_in_migrations = True

    def _create_user(self, email: str, password: str | None, **extra_fields):
        if not email:
            raise ValueError("El correo electrónico es obligatorio.")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("rol", Rol.VENDEDOR)
        extra_fields.setdefault("is_active", True)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("rol", Rol.ADMIN)
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("El superusuario debe tener is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("El superusuario debe tener is_superuser=True.")

        return self._create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField("correo electrónico", unique=True)
    nombre = models.CharField("nombre completo", max_length=150)
    telefono = models.CharField("teléfono", max_length=20, blank=True)
    rol = models.CharField(
        "rol",
        max_length=20,
        choices=Rol.choices,
        default=Rol.VENDEDOR,
    )
    is_active = models.BooleanField("activo", default=True)
    is_staff = models.BooleanField("acceso al admin", default=False)
    must_change_password = models.BooleanField("debe cambiar contraseña", default=False)
    date_joined = models.DateTimeField("fecha de registro", auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["nombre"]

    class Meta:
        verbose_name = "usuario"
        verbose_name_plural = "usuarios"
        ordering = ("nombre", "email")

    def __str__(self) -> str:
        return self.email

    @property
    def is_admin(self) -> bool:
        return self.rol == Rol.ADMIN

    @property
    def puede_ver_costos(self) -> bool:
        return self.rol == Rol.ADMIN
