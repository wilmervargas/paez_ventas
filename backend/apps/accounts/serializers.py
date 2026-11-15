"""Serializers de autenticación y perfil."""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.common.utils.phone import phone_digits

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "nombre",
            "telefono",
            "rol",
            "is_active",
            "is_superuser",
            "must_change_password",
            "date_joined",
        )
        read_only_fields = fields


class ProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("nombre", "telefono")

    def validate_telefono(self, value: str) -> str:
        return phone_digits(value)


class LoginSerializer(TokenObtainPairSerializer):
    """Agrega los datos del usuario a la respuesta del login."""

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("La contraseña actual no es correcta.")
        return value

    def validate_new_password(self, value):
        validate_password(value, self.context["request"].user)
        return value


class AdminUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=False)

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "nombre",
            "telefono",
            "rol",
            "is_active",
            "is_superuser",
            "is_staff",
            "must_change_password",
            "password",
            "date_joined",
        )
        read_only_fields = ("id", "date_joined")

    def validate_email(self, value: str) -> str:
        return User.objects.normalize_email(value).lower()

    def validate_telefono(self, value: str) -> str:
        return phone_digits(value)

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        if not password:
            raise serializers.ValidationError({"password": "La contraseña es obligatoria."})
        # Por defecto, los usuarios creados por administración deben cambiar su contraseña.
        validated_data.setdefault("must_change_password", True)
        if validated_data.get("is_superuser"):
            validated_data["is_staff"] = True
            validated_data.setdefault("rol", "admin")
        user = User(**validated_data)
        validate_password(password, user)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            validate_password(password, instance)
            instance.set_password(password)
            # Si un superusuario define una nueva clave, se puede exigir
            # cambio según el flag enviado; si no se envía, se mantiene el
            # comportamiento explícito del payload.
        if instance.is_superuser:
            instance.is_staff = True
        instance.save()
        return instance


class AdminSetPasswordSerializer(serializers.Serializer):
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        user = self.context["target_user"]
        validate_password(value, user)
        return value

    def save(self, **kwargs):
        user = self.context["target_user"]
        user.set_password(self.validated_data["new_password"])
        user.must_change_password = kwargs.get("must_change_password", False)
        user.save(update_fields=["password", "must_change_password"])
        return user


def _find_user_by_email(email: str):
    """Busca un usuario activo por correo principal o correo adicional registrado."""
    normalized = User.objects.normalize_email(email or "").lower().strip()
    if not normalized:
        return None
    user = User.objects.filter(email=normalized, is_active=True).first()
    if user:
        return user
    try:
        from .models import UserEmailAdicional

        extra = UserEmailAdicional.objects.select_related("user").filter(
            email=normalized, user__is_active=True
        ).first()
        return extra.user if extra else None
    except Exception:
        return None


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def save(self, **kwargs):
        email = self.validated_data["email"]
        user = _find_user_by_email(email)
        if not user:
            return None
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173").rstrip("/")
        reset_url = f"{frontend_url}/reset-password?uid={uid}&token={token}"
        subject = "Recuperación de contraseña"
        message = (
            f"Hola {user.nombre or user.email},\n\n"
            "Recibimos una solicitud para restablecer tu contraseña.\n"
            f"Usa el siguiente enlace para crear una nueva contraseña:\n\n{reset_url}\n\n"
            "Si no solicitaste este cambio, puedes ignorar este correo."
        )
        send_mail(
            subject,
            message,
            getattr(settings, "DEFAULT_FROM_EMAIL", None),
            [user.email],
            fail_silently=False,
        )
        return user


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        try:
            uid = force_str(urlsafe_base64_decode(attrs["uid"]))
            user = User.objects.get(pk=uid, is_active=True)
        except Exception:
            raise serializers.ValidationError({"uid": "El enlace de recuperación no es válido."})
        if not default_token_generator.check_token(user, attrs["token"]):
            raise serializers.ValidationError(
                {"token": "El enlace de recuperación no es válido o expiró."}
            )
        validate_password(attrs["new_password"], user)
        attrs["user"] = user
        return attrs

    def save(self, **kwargs):
        user = self.validated_data["user"]
        user.set_password(self.validated_data["new_password"])
        user.must_change_password = False
        user.save(update_fields=["password", "must_change_password"])
        return user
