"""Rutas de autenticación."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AdminUserViewSet, ChangePasswordView, LoginView, LogoutView, MeView, RefreshView

router = DefaultRouter()
router.register("users", AdminUserViewSet, basename="admin-user")

urlpatterns = [
    path("token/", LoginView.as_view(), name="login"),
    path("token/refresh/", RefreshView.as_view(), name="token-refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
    path("change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("", include(router.urls)),
]
