"""Rutas globales de la API."""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import HttpResponse
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.common.views import health


# Opcional: Puedes crear esta pequeña función aquí mismo para salir rápido del paso
def health_check(request):
    return HttpResponse("OK", status=200)


def home_view(request):
    return HttpResponse("Backend API activo y funcionando", status=200)


urlpatterns = [
    path("", home_view),
    # Tus otras rutas existentes
    path("health/", health_check, name="health_check"),
    path("admin/", admin.site.urls),
    path("api/v1/health/", health, name="health"),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/", include("apps.company.urls")),
    path("api/v1/", include("apps.clients.urls")),
    path("api/v1/", include("apps.inventory.urls")),
    path("api/v1/", include("apps.purchases.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
