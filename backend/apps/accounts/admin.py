"""Admin de usuarios y correos adicionales."""

from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.forms import ReadOnlyPasswordHashField
from django.contrib.auth.models import BaseUserManager
from django.contrib.auth.password_validation import validate_password

from .models import User, UserEmailAdicional


class EmailNormalizationMixin:
    """Normaliza el email antes de que corra la validación de unicidad.

    El `unique` de SQLite distingue mayúsculas: sin esta normalización un
    correo duplicado en mayúsculas pasaría el formulario y estallaría con
    un `IntegrityError` de base de datos.
    """

    def clean_email(self):
        email = self.cleaned_data.get("email")
        if email:
            return BaseUserManager.normalize_email(email).lower()
        return email


class UserCreationForm(EmailNormalizationMixin, forms.ModelForm):
    """Alta de usuarios desde el admin con la política de contraseñas del proyecto."""

    password1 = forms.CharField(label="Contraseña", widget=forms.PasswordInput)
    password2 = forms.CharField(label="Confirmar contraseña", widget=forms.PasswordInput)
    must_change_password = forms.BooleanField(
        label="Debe cambiar la contraseña en el primer inicio de sesión",
        initial=True,
        required=False,
    )

    class Meta:
        model = User
        fields = ("email", "nombre", "telefono", "rol", "must_change_password")

    def clean_password2(self):
        password1 = self.cleaned_data.get("password1")
        password2 = self.cleaned_data.get("password2")
        if password1 and password2 and password1 != password2:
            raise forms.ValidationError("Las contraseñas no coinciden.")
        return password2

    def clean(self):
        super().clean()
        password2 = self.cleaned_data.get("password2")
        if password2:
            # Instancia sin guardar para que la validación de similitud
            # pueda comparar con el email y el nombre.
            user = User(
                email=self.cleaned_data.get("email", ""),
                nombre=self.cleaned_data.get("nombre", ""),
            )
            try:
                validate_password(password2, user)
            except forms.ValidationError as error:
                self.add_error("password2", error)
        return self.cleaned_data

    def save(self, commit=True):
        user = super().save(commit=False)
        user.set_password(self.cleaned_data["password1"])
        if commit:
            user.save()
        return user


class UserChangeForm(EmailNormalizationMixin, forms.ModelForm):
    password = ReadOnlyPasswordHashField(label="Contraseña")

    class Meta:
        model = User
        fields = (
            "email",
            "nombre",
            "telefono",
            "rol",
            "is_active",
            "is_staff",
            "is_superuser",
            "must_change_password",
            "groups",
            "user_permissions",
            "last_login",
        )


class UserEmailAdicionalInline(admin.TabularInline):
    """Correos adicionales de inicio de sesión del usuario."""

    model = UserEmailAdicional
    fk_name = "user"
    extra = 0
    fields = ("email", "is_verified", "created_at", "created_by")
    readonly_fields = ("created_at", "created_by")


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    form = UserChangeForm
    add_form = UserCreationForm
    inlines = (UserEmailAdicionalInline,)

    list_display = ("email", "nombre", "rol", "is_active", "is_staff", "date_joined")
    list_filter = ("rol", "is_active", "is_staff")
    search_fields = ("email", "nombre", "correos_adicionales__email")
    ordering = ("nombre", "email")
    readonly_fields = ("last_login", "date_joined")

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Datos personales", {"fields": ("nombre", "telefono")}),
        (
            "Rol y permisos",
            {
                "fields": (
                    "rol",
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                )
            },
        ),
        ("Seguridad", {"fields": ("must_change_password",)}),
        ("Fechas", {"fields": ("last_login", "date_joined")}),
    )

    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "email",
                    "nombre",
                    "telefono",
                    "rol",
                    "password1",
                    "password2",
                    "must_change_password",
                ),
            },
        ),
    )

    def save_formset(self, request, form, formset, change):
        """Registra quién agregó cada correo adicional."""
        instances = formset.save(commit=False)
        for obj in formset.deleted_objects:
            obj.delete()
        for instance in instances:
            if isinstance(instance, UserEmailAdicional) and instance.created_by_id is None:
                instance.created_by = request.user
            instance.save()
        formset.save_m2m()
