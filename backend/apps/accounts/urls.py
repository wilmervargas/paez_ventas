"""Rutas de autenticación."""

from django.urls import path

from .views import ChangePasswordView, LoginView, LogoutView, MeView, RefreshView

urlpatterns = [
    path("token/", LoginView.as_view(), name="login"),
    path("token/refresh/", RefreshView.as_view(), name="token-refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
    path("change-password/", ChangePasswordView.as_view(), name="change-password"),
]
