"""Vistas de autenticación y perfil."""

from django.conf import settings
from django.db import transaction
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from django.contrib.auth import get_user_model

from apps.common.permissions import IsSuperUser
from rest_framework import viewsets
from rest_framework.decorators import action

from .serializers import (
    AdminSetPasswordSerializer,
    AdminUserSerializer,
    ChangePasswordSerializer,
    LoginSerializer,
    ProfileUpdateSerializer,
    UserSerializer,
)

User = get_user_model()


def _set_refresh_cookie(response, token) -> None:
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=str(token),
        max_age=settings.REFRESH_COOKIE_MAX_AGE,
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite="Lax",
        path=settings.REFRESH_COOKIE_PATH,
    )


class LoginView(TokenObtainPairView):
    """Login por email. El access va en el cuerpo y el refresh en cookie httpOnly."""

    serializer_class = LoginSerializer
    permission_classes = (AllowAny,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "login"

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        refresh = data.pop("refresh")
        response = Response(data, status=status.HTTP_200_OK)
        _set_refresh_cookie(response, refresh)
        return response


class RefreshView(APIView):
    """Rota el refresh token (cookie) y devuelve un nuevo access."""

    serializer_class = TokenRefreshSerializer
    permission_classes = (AllowAny,)

    @extend_schema(
        request=TokenRefreshSerializer,
        responses={200: OpenApiTypes.OBJECT},
    )
    def post(self, request):
        raw = request.COOKIES.get(settings.REFRESH_COOKIE_NAME) or request.data.get("refresh")
        if not raw:
            return Response(
                {
                    "detail": "No se encontró el token de refresco.",
                    "code": "refresh_required",
                    "errors": {},
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        serializer = TokenRefreshSerializer(data={"refresh": raw})
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        new_refresh = data.pop("refresh", None)

        response = Response(data, status=status.HTTP_200_OK)
        if new_refresh:
            _set_refresh_cookie(response, new_refresh)
        return response


class LogoutView(APIView):
    """Invalida el refresh token y borra la cookie."""

    permission_classes = (AllowAny,)

    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        raw = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if raw:
            try:
                RefreshToken(raw).blacklist()
            except TokenError:
                pass

        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(
            settings.REFRESH_COOKIE_NAME,
            path=settings.REFRESH_COOKIE_PATH,
        )
        return response


class MeView(APIView):
    """Perfil del usuario autenticado."""

    serializer_class = UserSerializer
    permission_classes = (IsAuthenticated,)

    @extend_schema(responses=UserSerializer)
    def get(self, request):
        return Response(UserSerializer(request.user).data)

    @extend_schema(request=ProfileUpdateSerializer, responses=UserSerializer)
    def patch(self, request):
        serializer = ProfileUpdateSerializer(
            request.user,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user).data)


class ChangePasswordView(APIView):
    """Cambia la contraseña y revoca todas las sesiones de refresco."""

    serializer_class = ChangePasswordSerializer
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        request=ChangePasswordSerializer,
        responses={200: OpenApiTypes.OBJECT},
    )
    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)

        user = request.user
        with transaction.atomic():
            user.set_password(serializer.validated_data["new_password"])
            user.must_change_password = False
            user.save(update_fields=["password", "must_change_password"])
            for token in OutstandingToken.objects.filter(user=user):
                BlacklistedToken.objects.get_or_create(token=token)

        response = Response(
            {"detail": "Contraseña actualizada. Inicia sesión nuevamente."},
            status=status.HTTP_200_OK,
        )
        response.delete_cookie(
            settings.REFRESH_COOKIE_NAME,
            path=settings.REFRESH_COOKIE_PATH,
        )
        return response


class AdminUserViewSet(viewsets.ModelViewSet):
    """Gestión de usuarios del sistema. Solo superusuarios."""

    queryset = User.objects.all().order_by("nombre", "email")
    serializer_class = AdminUserSerializer
    permission_classes = (IsAuthenticated, IsSuperUser)
    filterset_fields = ("rol", "is_active", "is_superuser")
    search_fields = ("email", "nombre", "telefono")
    ordering_fields = ("nombre", "email", "date_joined", "is_active", "rol")

    @extend_schema(request=AdminSetPasswordSerializer, responses={200: OpenApiTypes.OBJECT})
    @action(detail=True, methods=["post"], url_path="set-password")
    def set_password(self, request, pk=None):
        target = self.get_object()
        serializer = AdminSetPasswordSerializer(
            data=request.data, context={"target_user": target}
        )
        serializer.is_valid(raise_exception=True)
        must_change = bool(request.data.get("must_change_password", False))
        serializer.save(must_change_password=must_change)
        # Revocar sesiones del usuario objetivo por seguridad.
        for token in OutstandingToken.objects.filter(user=target):
            BlacklistedToken.objects.get_or_create(token=token)
        return Response(
            {"detail": "Contraseña actualizada correctamente."},
            status=status.HTTP_200_OK,
        )
