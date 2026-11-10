"""Backend de autenticación por correo principal o correos adicionales."""

from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend

from .models import UserEmailAdicional

User = get_user_model()


class EmailAdicionalBackend(ModelBackend):
    """Autentica con el correo principal o con cualquiera de los adicionales.

    El correo se normaliza a minúsculas antes de buscar (igual que hace
    `UserManager` al guardar) para que el login no dependa de mayúsculas.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        if username is None:
            username = kwargs.get(User.USERNAME_FIELD)
        if username is None or password is None:
            return None

        email = str(username).strip().lower()
        user = super().authenticate(request, username=email, password=password)
        if user is not None:
            return user

        adicional = UserEmailAdicional.objects.select_related("user").filter(email=email).first()
        if adicional is None:
            return None

        user = adicional.user
        if user.check_password(password) and self.user_can_authenticate(user):
            self._marcar_verificado(adicional)
            return user
        return None

    @staticmethod
    def _marcar_verificado(adicional: UserEmailAdicional) -> None:
        """Un login exitoso demuestra el control del correo; se marca verificado."""
        if not adicional.is_verified:
            adicional.is_verified = True
            adicional.save(update_fields=["is_verified"])
