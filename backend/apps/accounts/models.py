"""Modelo de usuario personalizado con login por email y roles."""

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.core.exceptions import ValidationError
from django.db import models

from apps.common.models import BaseModel


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

    def save(self, *args, **kwargs):
        """Normaliza el email para que el login no dependa de mayúsculas."""
        self.email = BaseUserManager.normalize_email(self.email).lower()
        super().save(*args, **kwargs)

    @property
    def is_admin(self) -> bool:
        return self.rol == Rol.ADMIN

    @property
    def puede_ver_costos(self) -> bool:
        return self.rol == Rol.ADMIN


class UserEmailAdicional(BaseModel):
    """Correo adicional con el que un usuario puede iniciar sesión.

    El email se guarda normalizado en minúsculas y no puede coincidir con el
    correo principal de ningún usuario.
    """

    user = models.ForeignKey(
        User,
        verbose_name="usuario",
        on_delete=models.PROTECT,
        related_name="correos_adicionales",
    )
    email = models.EmailField("correo electrónico adicional", unique=True)
    is_verified = models.BooleanField(
        "verificado",
        default=False,
        help_text="Se marca automáticamente en el primer inicio de sesión con este correo.",
    )

    class Meta:
        verbose_name = "correo adicional"
        verbose_name_plural = "correos adicionales"
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.email} ({self.user.email})"

    def _normalizar_email(self):
        self.email = BaseUserManager.normalize_email(self.email.strip()).lower()

    def clean(self):
        super().clean()
        self._normalizar_email()
        if User.objects.filter(email=self.email).exists():
            raise ValidationError({"email": "Ese correo ya es el principal de un usuario."})

    def save(self, *args, **kwargs):
        self._normalizar_email()
        super().save(*args, **kwargs)
