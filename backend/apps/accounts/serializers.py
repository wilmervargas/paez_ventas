"""Serializers de autenticación y perfil."""

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
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
            # Si un superusuario define una nueva clave, se puede exigir cambio según el flag enviado;
            # si no se envía, mantenemos el comportamiento explícito del payload.
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
