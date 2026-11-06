"""Permisos por rol reutilizables en toda la API."""

from rest_framework.exceptions import APIException
from rest_framework.permissions import SAFE_METHODS, BasePermission


class CompanySetupRequired(APIException):
    """Se lanza cuando la empresa todavía no tiene datos fiscales."""

    status_code = 409
    default_detail = "Debe completar la configuración fiscal de la empresa."
    default_code = "company_setup_required"


class PasswordChangeRequired(APIException):
    """Se lanza cuando el usuario aún usa la contraseña temporal."""

    status_code = 403
    default_detail = "Debe cambiar la contraseña antes de continuar."
    default_code = "password_change_required"


class IsAuthenticatedAndCompanyReady(BasePermission):
    """Permiso global: exige sesión y empresa configurada.

    Los endpoints de auth, salud y configuración de empresa deben sobrescribir
    `permission_classes` para no quedar bloqueados por este gate.
    """

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated and user.is_active):
            return False

        if user.must_change_password:
            raise PasswordChangeRequired()

        # Import perezoso para evitar problemas de registro de apps.
        from apps.company.models import Empresa

        if not Empresa.objects.exists():
            raise CompanySetupRequired()
        return True


class HasRole(BasePermission):
    """Permite el acceso solo a los roles indicados en `allowed_roles`."""

    allowed_roles: tuple[str, ...] = ()

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated and user.is_active):
            return False
        if user.must_change_password:
            raise PasswordChangeRequired()
        return user.rol in self.allowed_roles


class IsAdmin(HasRole):
    allowed_roles = ("admin",)


class IsAdminForInitialSetup(BasePermission):
    """Admin autenticado, sin exigir el cambio de contraseña temporal.

    Se usa únicamente para crear la empresa la primera vez. Cuando la empresa
    ya existe, el endpoint vuelve a exigir `IsAdmin` (con cambio de contraseña).
    """

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated and user.is_active):
            return False
        return user.rol == "admin"


class IsVendedor(HasRole):
    allowed_roles = ("admin", "vendedor")


class IsCobrador(HasRole):
    allowed_roles = ("admin", "cobrador")


class IsAlmacenista(HasRole):
    allowed_roles = ("admin", "almacenista")


class IsAdminOrReadOnly(BasePermission):
    """Lectura para cualquier usuario autenticado; escritura solo admin."""

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated and user.is_active):
            return False
        if user.must_change_password:
            raise PasswordChangeRequired()
        if request.method in SAFE_METHODS:
            return True
        return user.rol == "admin"


class ReadOnly(BasePermission):
    def has_permission(self, request, view) -> bool:
        return request.method in SAFE_METHODS


class RoleBasedAccess(BasePermission):
    """Permite lectura/escritura según listas de roles.

    Debe combinarse con `IsAuthenticatedAndCompanyReady` en cada vista para no
    saltarse el gate fiscal ni la exigencia de cambio de contraseña.
    """

    read_roles: tuple[str, ...] = ()
    write_roles: tuple[str, ...] = ()

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated and user.is_active):
            return False
        if user.must_change_password:
            raise PasswordChangeRequired()
        roles = self.read_roles if request.method in SAFE_METHODS else self.write_roles
        return user.rol in roles
