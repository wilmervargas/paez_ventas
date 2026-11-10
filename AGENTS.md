# AGENTS.md — Sistema de Cobros, Inventario y Gestión Comercial

> Documento de referencia para agentes de IA y desarrolladores que trabajen en este repositorio.
> **Léelo completo antes de tocar código.** Si algo no está definido aquí, pregunta antes de inventarlo.

--- 

## 1. Propósito y estado

Sistema interno para una firma/empresa venezolana que gestiona:

- Catálogo de productos y combos.
- Inventario con kardex auditable.
- Compras a proveedores.
- Pedidos flexibles (productos sueltos + combos).
- Cuentas por cobrar (deudas) y pagos/abonos.
- Caja, gastos y reportes.
- Recordatorios de cobro por WhatsApp mediante enlaces `wa.me`.

**Estado actual:** Fases 0, 1 y 2 completadas, y Fase 3 implementada en backend
y frontend (compras, recepción de mercancía, costo promedio y anulación con
reverso de inventario). Las apps restantes (`orders`, `finances`,
`notifications`, `reports`) siguen como esqueleto.

**No es multi-tenant.** Una instalación = una empresa (`Empresa` singleton).

---

## 2. Decisiones cerradas

| Tema | Decisión |
|---|---|
| Backend | Python + Django + Django REST Framework |
| Base de datos | SQLite (WAL, un solo proceso escritor) |
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Autenticación | JWT (`djangorestframework-simplejwt`) con login por email |
| Moneda | **Multimoneda** con tasa de cambio histórica |
| WhatsApp | **Solo enlaces `wa.me`** con mensaje prellenado. Sin envío automático |
| Roles | Administrador, Vendedor, Cobrador, Almacenista |
| Alcance | **Completo**: ventas, compras, inventario, CxC, caja, gastos, reportes |
| Numeración | **Control interno** (no fiscal), secuencial por año |
| Despliegue | Local/red interna en Windows; HTTPS si se expone |
| API | REST versionada en `/api/v1/` |

---

## 3. Reglas duras para agentes

Estas reglas no son negociables. Si una tarea requiere romperlas, **detente y pregunta**.

1. **Dinero nunca en `float`.** Usar `Decimal`, `DecimalField` y `ROUND_HALF_UP`. En el frontend, los montos llegan como string.
2. **Nunca borrar registros financieros.** Se anulan (`anulado`, `anulado_por`, `motivo`, `fecha_anulacion`) y se reversan atómicamente.
3. **Toda mutación financiera va en `transaction.atomic`** y pasa por la capa de servicios (`services.py`), nunca directo desde la vista.
4. **El stock solo cambia mediante `MovimientoInventario`.** Nunca editar `Producto.stock` a mano.
5. **Congelar precio y costo** en cada línea de pedido/compra al momento de la operación.
6. **Nunca recalcular documentos históricos con la tasa actual.** Cada documento guarda su `tasa_cambio`.
7. **Nunca hardcodear secretos, contraseñas ni credenciales.** Todo por `.env`.
8. **Nunca editar migraciones ya aplicadas.** Cambios de modelo = migración nueva.
9. **Nunca usar `CASCADE` en FKs financieras.** Usar `PROTECT`.
10. **Todo endpoint nuevo requiere**: serializer, permiso por rol, validación y tests.
11. **No agregar dependencias** sin justificar y registrar en `requirements.txt` / `package.json`.
12. **No cambiar el contrato de la API** de forma incompatible. Si es inevitable, nueva versión.
13. **No commitear**: `.env`, `db.sqlite3`, `media/`, `node_modules/`, `dist/`.
14. **Idioma:** dominio y UI en español; infraestructura, nombres técnicos y código en inglés cuando sea natural. No mezclar dentro de un mismo identificador.
15. **Costo y margen son visibles solo para Administrador.** Nunca exponerlos en serializers de otros roles.

---

## 4. Estructura del repositorio

```text
paez/
├── AGENTS.md
├── README.md
├── .gitignore
├── .editorconfig
│
├── backend/
│   ├── manage.py
│   ├── db.sqlite3                  # NO versionado
│   ├── .env                        # NO versionado
│   ├── .env.example
│   ├── requirements.txt
│   ├── pytest.ini
│   ├── ruff.toml
│   │
│   ├── config/                     # settings, urls, wsgi, asgi
│   │   ├── settings/
│   │   │   ├── base.py
│   │   │   ├── dev.py
│   │   │   └── prod.py
│   │   ├── urls.py
│   │   ├── wsgi.py
│   │   └── asgi.py
│   │
│   ├── apps/
│   │   ├── common/                 # BaseModel, mixins, permisos, paginación, utils
│   │   ├── accounts/               # User custom, roles, auth, JWT
│   │   ├── company/                # Empresa singleton, tasas de cambio
│   │   ├── clients/                # Clientes, proveedores
│   │   ├── inventory/              # Productos, combos, movimientos, stock
│   │   ├── purchases/              # Compras y recepción
│   │   ├── orders/                 # Pedidos, detalles, devoluciones
│   │   ├── finances/               # Deudas, pagos, gastos, caja
│   │   ├── notifications/          # Plantillas y log de mensajes wa.me
│   │   └── reports/                # Reportes y exportaciones
│   │
│   ├── media/                      # Logos y comprobantes (NO versionado)
│   ├── staticfiles/
│   └── tests/                      # Tests transversales/e2e de API
│
└── frontend/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── .env.example
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── lib/                    # api client, money, dates, phone, query client
        ├── context/                # AuthContext, CompanyContext
        ├── components/
        │   ├── ProtectedRoute.tsx
        │   ├── RoleGuard.tsx
        │   └── layout/
        ├── hooks/
        ├── types/
        └── features/
            ├── auth/
            ├── company/
            ├── clients/
            ├── inventory/
            ├── purchases/
            ├── orders/
            ├── finances/
            ├── reports/
            └── notifications/
```

> `apps/accounts` reemplaza al `apps/authentication` del plan original para evitar confusión con `django.contrib.auth`.

---

## 5. Modelo de datos

Convenciones generales para todos los modelos:

- Heredar de `common.models.BaseModel`: `id`, `created_at`, `updated_at`, `created_by`.
- `on_delete=PROTECT` en FKs de negocio.
- Índices en campos de búsqueda y fechas.
- `__str__` legible.
- `Meta.ordering` explícito en listados.

### 5.1 accounts

```text
User (AbstractBaseUser, PermissionsMixin)
  email            unique, USERNAME_FIELD (normalizado a minúsculas)
  nombre
  telefono
  rol              admin | vendedor | cobrador | almacenista
  activo
  must_change_password
  last_login

UserEmailAdicional
  user             FK PROTECT (related_name: correos_adicionales)
  email            unique, normalizado a minúsculas
  is_verified      se marca True en el primer login exitoso con ese correo
  # hereda BaseModel; no puede coincidir con el email principal de otro usuario
```

- Manager propio (`UserManager`) con `create_user` / `create_superuser`.
- `AUTH_USER_MODEL = "accounts.User"` **antes de la primera migración**.
- El login acepta el correo principal o cualquiera de los adicionales
  (`apps/accounts/backends.py`, `EmailAdicionalBackend`). Los correos se
  normalizan a minúsculas tanto al guardarlos como al iniciar sesión.

### 5.2 company

```text
Empresa (singleton, pk=1)
  razon_social, nombre_comercial, rif, representante
  direccion, telefono, email, eslogan
  logo             ImageField (validado: tipo, tamaño)
  moneda_base      default USD
  iva_rate         default 16.00
  igtf_rate        default 0.00 (configurable; no aplicar por defecto)

TasaCambio
  moneda           (ej. VES)
  tasa             Decimal(18,6)  # unidades de moneda por 1 moneda_base
  fuente           bcv | manual
  vigente_desde    datetime
  created_by
  # única tasa vigente por moneda
```

- Singleton forzado en el servicio, no solo en el serializer.
- El `logo` se sirve desde `media/`; `logo_url` externo no se usa.

### 5.3 clients

```text
Cliente
  codigo           unique
  nombre
  rif_cedula
  telefono         E.164 (+58...)
  telefono_alt
  email
  direccion
  limite_credito   Decimal(14,2) default 0
  notas
  activo

Proveedor
  codigo, nombre, rif, telefono, email, direccion, activo
```

### 5.4 inventory

```text
CategoriaProducto (nombre, activo)
UnidadMedida      (nombre, abreviatura)

Producto
  sku              unique
  nombre
  categoria        FK
  unidad           FK
  costo            Decimal(14,2)   # solo admin
  precio           Decimal(14,2)
  stock            Decimal(14,3)   # caché derivado del kardex
  stock_minimo     Decimal(14,3)
  iva_aplicable    bool
  activo
  imagen

Combo
  sku unique, nombre, precio Decimal(14,2), activo

ComboProducto
  combo, producto, cantidad Decimal(14,3)
  unique_together(combo, producto)

MovimientoInventario
  producto         FK
  tipo             entrada | salida | ajuste | venta | compra | devolucion | anulacion
  direccion        entrada | salida  # define el signo; obligatoria en ajustes
  cantidad         Decimal(14,3)  # siempre positiva
  costo_unitario   Decimal(14,4)
  motivo
  referencia_tipo / referencia_id   # pedido, compra, devolución
  created_by, created_at
```

Reglas:

- Combo virtual: no tiene stock propio. Disponibilidad = `min(floor(stock_i / cantidad_i))`.
- Vender un combo descuenta stock de sus componentes.
- La composición del combo se **congela** en el pedido (ver 5.6).
- `Producto.stock` es un caché de solo lectura para la API; se actualiza
  exclusivamente desde `registrar_movimiento()`.
- Los ajustes manuales exigen `direccion` y un `motivo`; un ajuste de salida no
  puede dejar el stock en negativo.

### 5.5 purchases

```text
Compra
  numero           unique (COMP-YYYY-000001)
  proveedor        FK
  fecha
  moneda, tasa_cambio
  subtotal, iva, total
  estado           borrador | recibida | anulada
  created_by

CompraDetalle
  compra, producto, cantidad, costo_unitario, subtotal
```

- Al pasar a `recibida`, genera `MovimientoInventario` de tipo `compra` y actualiza stock/costo.
- Anular una compra recibida exige reverso de stock atómico.

### 5.6 orders

```text
Pedido
  numero           unique (PED-YYYY-000001)
  cliente          FK
  fecha
  estado           borrador | confirmado | entregado | anulado
  tipo_pago        contado | credito
  moneda, tasa_cambio
  subtotal, descuento, iva, total
  total_base       Decimal(14,2)  # convertido a moneda_base
  notas
  created_by

PedidoDetalle
  pedido
  producto         FK null
  combo            FK null
  descripcion
  cantidad         Decimal(14,3)
  precio_unitario  Decimal(14,2)
  costo_unitario   Decimal(14,2)
  descuento_linea  Decimal(14,2)
  iva_linea        Decimal(14,2)
  subtotal         Decimal(14,2)
  combo_snapshot   JSON  # composición congelada si es combo
  # CheckConstraint: exactamente uno de producto/combo
```

- El stock se descuenta al pasar a **`confirmado`**.
- Anular antes de entregar restaura stock; después de entregar requiere `Devolucion`.
- Si `tipo_pago = credito`, al confirmar se crea la `Deuda`.
- Pedido confirmado no se edita: se anula y se crea otro.

### 5.7 finances

```text
Deuda
  cliente, pedido
  moneda, tasa_cambio
  monto_original   Decimal(14,2)
  saldo            Decimal(14,2)   # CheckConstraint >= 0
  fecha_emision, fecha_vencimiento
  estado           pendiente | pagada | anulada
  # "vencida" NO se guarda: se deriva por fecha + saldo

Pago
  cliente
  fecha
  moneda, tasa_cambio
  monto            Decimal(14,2)
  monto_base       Decimal(14,2)
  metodo           efectivo | transferencia | pago_movil | zelle | otro
  referencia, banco, nota
  created_by
  anulado, anulado_por, motivo_anulacion, fecha_anulacion

PagoAplicacion
  pago, deuda, monto Decimal(14,2)
  # suma de aplicaciones <= pago.monto
  # suma de aplicaciones <= deuda.saldo

Gasto
  numero (GAS-YYYY-000001), fecha
  categoria, descripcion
  moneda, tasa_cambio, monto, monto_base
  metodo, referencia, comprobante
  created_by, anulado

CajaSesion
  usuario_apertura, fecha_apertura, monto_inicial
  usuario_cierre, fecha_cierre, monto_final_declarado, monto_sistema
  estado abierta | cerrada

MovimientoCaja
  caja_sesion, tipo ingreso | egreso
  concepto, monto, moneda, tasa_cambio
  referencia_tipo / referencia_id   # pago, gasto
  created_by, created_at
```

Reglas:

- Un pago puede cubrir varias deudas (`PagoAplicacion`).
- Un sobrante sin aplicar queda como **saldo a favor/anticipo** del cliente.
- Pago y aplicaciones son inmutables: corregir = anular y crear uno nuevo.
- No se puede anular una deuda con pagos aplicados.
- Caja: no se puede registrar un pago en efectivo sin caja abierta.

### 5.8 notifications

```text
PlantillaMensaje
  nombre, canal (whatsapp), cuerpo con placeholders {cliente}, {saldo}, etc.
  activo

Notificacion
  cliente, deuda (opcional), plantilla
  telefono_destino
  mensaje_final
  estado generado | enviado_manual | descartado
  created_by, created_at, enviado_at
```

- El sistema **no envía** mensajes: genera el texto y el enlace `https://wa.me/<E.164>?text=<urlencoded>`.
- El usuario marca "enviado manual" para dejar registro.

### 5.9 common

```text
Secuencia
  nombre (pedido, compra, recibo, gasto)
  anio
  ultimo_valor
  unique_together(nombre, anio)
```

- Incremento atómico dentro de la misma transacción que crea el documento.
- Formato: `PREFIJO-YYYY-000001`.

---

## 6. Multimoneda

Reglas:

1. `Empresa.moneda_base` (por defecto USD).
2. Todo documento guarda `moneda` y `tasa_cambio` (unidades de esa moneda por 1 unidad de moneda_base).
3. Se guarda también el equivalente en moneda base (`total_base`, `monto_base`) para reportes.
4. Los reportes consolidan en moneda base.
5. Al aplicar un pago en moneda distinta a la deuda, se convierte vía moneda base usando la tasa del pago.
6. La tasa se selecciona automáticamente (la vigente) pero puede sobrescribirse manualmente con justificación.
7. Nunca se recalcula un documento histórico con una tasa nueva.

Formato y redondeo:

- Montos: `DecimalField(max_digits=14, decimal_places=2)`.
- Tasas: `DecimalField(max_digits=18, decimal_places=6)`.
- Cantidades: `DecimalField(max_digits=14, decimal_places=3)`.
- Redondeo: `ROUND_HALF_UP` a 2 decimales por línea y al total.
- API: los decimales se serializan como **string**; el frontend no los convierte a `number` para operar.

---

## 7. Roles y permisos

| Capacidad | Admin | Vendedor | Cobrador | Almacenista |
|---|:---:|:---:|:---:|:---:|
| Empresa / configuración | ✅ | ❌ | ❌ | ❌ |
| Usuarios y roles | ✅ | ❌ | ❌ | ❌ |
| Clientes — ver | ✅ | ✅ | ✅ | ❌ |
| Clientes — crear/editar | ✅ | ✅ | ❌ | ❌ |
| Productos/combos — ver | ✅ | ✅ | ❌ | ✅ |
| Ver costo y margen | ✅ | ❌ | ❌ | ❌ |
| Inventario y movimientos | ✅ | solo ver | ❌ | ✅ |
| Compras y proveedores | ✅ | ❌ | ❌ | ✅ |
| Pedidos — crear | ✅ | ✅ | ❌ | ❌ |
| Pedidos — confirmar | ✅ | ✅ | ❌ | ❌ |
| Pedidos — anular | ✅ | ❌ | ❌ | ❌ |
| Despacho/entrega | ✅ | ❌ | ❌ | ✅ |
| Deudas — ver | ✅ | ✅ | ✅ | ❌ |
| Pagos — registrar | ✅ | ❌ | ✅ | ❌ |
| Pagos — anular | ✅ | ❌ | ❌ | ❌ |
| Caja | ✅ | ❌ | ✅ | ❌ |
| Gastos | ✅ | ❌ | ❌ | ❌ |
| Reportes | todos | ventas | cobranza | inventario |

Implementación:

- `User.rol` + clases de permiso DRF (`IsAdmin`, `IsVendedor`, `IsCobrador`, `IsAlmacenista`, `ReadOnly`).
- `RoleGuard` en frontend para ocultar rutas, pero **la seguridad real vive en el backend**.
- Un usuario inactivo no puede autenticarse ni refrescar token.

---

## 8. API REST

Base: `/api/v1/`

### Autenticación

```text
POST   /auth/token/            login (email + password)
POST   /auth/token/refresh/    refresh con rotación
POST   /auth/logout/           blacklist del refresh
GET    /auth/me/
POST   /auth/change-password/
```

### Recursos

```text
GET/PUT  /company/
GET/POST /tasas-cambio/

CRUD /clientes/          CRUD /proveedores/
CRUD /productos/         CRUD /combos/
GET  /inventario/movimientos/     POST /inventario/ajustes/
CRUD /compras/           POST /compras/{id}/recibir/
CRUD /pedidos/           POST /pedidos/{id}/confirmar/
                         POST /pedidos/{id}/anular/
                         POST /pedidos/{id}/entregar/
CRUD /deudas/            GET  /deudas/vencidas/
CRUD /pagos/             POST /pagos/{id}/anular/
CRUD /gastos/
GET/POST /caja/          POST /caja/{id}/cerrar/
GET  /reportes/cxc/      GET /reportes/ventas/
GET  /reportes/utilidad/ GET /reportes/inventario/
GET  /notificaciones/    POST /notificaciones/{id}/marcar-enviada/
```

Convenciones:

- Paginación: `page`, `page_size` (default 25, máx 100).
- Filtros con `django-filter`; orden con `ordering`.
- Errores uniformes:

```json
{
  "detail": "Mensaje legible",
  "code": "saldo_insuficiente",
  "errors": { "campo": ["detalle"] }
}
```

- Fechas ISO 8601 con zona; el frontend muestra en `America/Caracas`.
- OpenAPI en `/api/schema/` y Swagger en `/api/docs/` con `drf-spectacular`.
- `Idempotency-Key` obligatorio en `POST /pagos/` y `POST /pedidos/`.

---

## 9. Seguridad

- `AUTH_USER_MODEL` personalizado y login por email (`USERNAME_FIELD = "email"`).
- JWT: access 15 min, refresh 1 día, rotación + blacklist, logout revoca.
- Refresh en cookie `httpOnly` + `SameSite=Lax`; access en memoria (no `localStorage`).
- CSRF activo cuando se usen cookies.
- Throttling en `/auth/token/` (5/min por IP) y bloqueo tras intentos fallidos.
- `DEBUG=False` en producción, `SECRET_KEY`, `ALLOWED_HOSTS` y CORS desde `.env`.
- CORS explícito; nunca `*` con credenciales.
- HTTPS + HSTS + `SECURE_*` si se expone fuera de la red local.
- Validación de subida de imágenes: tipo, tamaño y nombre; nunca descargar URLs externas (SSRF).
- Contraseñas con validadores de Django y mínimo 12 caracteres.
- Superusuario inicial vía `python manage.py bootstrap` leyendo variables de entorno, idempotente, con `must_change_password=True`.
- **Gate de configuración fiscal en backend:** si `Empresa` no existe, toda petición devuelve `409` con `code: "company_setup_required"`, excepto `/auth/`, `/company/` y `/admin/`.
- **Primer arranque:** mientras `Empresa` no exista, el administrador puede crearla aunque `must_change_password=True`. Una vez creada, el resto de endpoints (y la edición de la empresa) exigen cambiar la contraseña temporal.
- Log de acciones sensibles (anulaciones, pagos, cambios de precio, ajustes de stock).
- Backups automáticos de SQLite antes de cada despliegue y diarios en producción.

---

## 10. Frontend

- React + Vite + **TypeScript** + Tailwind CSS.
- **TanStack Query** para datos del servidor; nada de `useEffect` para fetching.
- **react-hook-form + zod** para formularios.
- Cliente HTTP centralizado con interceptor de 401 y cola de refresh.
- `ProtectedRoute` valida sesión; `RoleGuard` valida rol.
- `AuthContext` (sesión) y `CompanyContext` (empresa/logo) separados.
- Formato de dinero con `Intl.NumberFormat("es-VE")`; nunca operar con `number`.
- Fechas con `date-fns` o `Intl.DateTimeFormat` en `America/Caracas`.
- Componentes reutilizables: tabla, paginador, modal, confirmación, toasts, skeleton.
- Estados explícitos: loading, vacío, error, sin permisos.
- Mobile-first para cobranza en campo.
- Sin `any`; sin `dangerouslySetInnerHTML`.
- `.env`: `VITE_API_URL`.

---

## 11. WhatsApp (`wa.me`)

- Normalizar teléfonos a **E.164** (`+58...`). Función única en `common/utils/phone.py`.
- El backend genera `https://wa.me/<numero>?text=<mensaje urlencoded>`.
- Plantillas en BD con placeholders: `{cliente}`, `{saldo}`, `{vencimiento}`, `{empresa}`, `{rif}`, `{instrucciones_pago}`.
- Pantalla de cobranza: lista de deudas vencidas, mensaje previsualizado, botón "Abrir WhatsApp" y "Copiar".
- Cada generación crea una `Notificacion`; el usuario puede marcarla como enviada.
- **No se usan librerías no oficiales ni automatización de WhatsApp.**
- No se envían mensajes sin acción del usuario.

---

## 12. Primer arranque

Comando idempotente `python manage.py bootstrap`:

1. Verifica `.env`.
2. Aplica migraciones.
3. Crea el superusuario si no existe ningún usuario, leyendo `DJANGO_SUPERUSER_EMAIL` y `DJANGO_SUPERUSER_PASSWORD`.
4. Crea datos semilla: métodos de pago, unidades, categorías, plantillas de mensajes, IVA por defecto.
5. No sobrescribe datos existentes.

- La base SQLite se crea con `migrate`; no se crea lógica de "detectar archivo" en `settings.py`.
- Migrar automáticamente al arrancar está permitido solo en `dev`.
- En `prod` se ejecuta `bootstrap` como paso explícito del despliegue.

---

## 13. SQLite y operación

- `PRAGMA journal_mode=WAL`, `busy_timeout=5000`, `foreign_keys=ON`.
- Un solo proceso escritor (1 worker). Si se necesita concurrencia real, migrar a PostgreSQL (fuera de alcance por ahora).
- `select_for_update()` **no bloquea por fila en SQLite**; no confiar en él. La protección real es `transaction.atomic` + validación de saldo al aplicar pagos.
- Respaldos: copia diaria de `db.sqlite3` con fecha, retención mínima 30 días, y copia previa a cada migración.
- No exponer `db.sqlite3` ni `media/` sin autenticación.

---

## 14. Convenciones de código

### Backend

- Python 3.14+, Django 6.x, DRF.
- Ruff para lint y formato (línea 100), `isort` vía Ruff.
- Vistas DRF basadas en clases; lógica en `services.py`, no en `views.py`.
- Serializers con validación explícita; `read_only_fields` para campos calculados.
- Nombres de modelos y campos en español; helpers técnicos en inglés.
- Docstrings cortas en servicios y funciones financieras.
- Sin lógica de negocio en `signals` salvo casos justificados.

### Frontend

- TypeScript estricto.
- Componentes en PascalCase, hooks `useAlgo`, archivos de utilidad en camelCase.
- Un feature = carpeta con `api.ts`, `types.ts`, `hooks.ts`, `components/`, `pages/`.
- ESLint + Prettier.
- Tailwind sin CSS ad hoc salvo casos justificados.

### Git

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- Ramas: `feat/...`, `fix/...`, `chore/...`.
- Un commit = un cambio coherente.

---

## 15. Testing

- Backend: `pytest-django` + `factory_boy`.
- Frontend: Vitest + Testing Library.
- Cobertura mínima objetivo: **80% en `finances`, `orders` e `inventory`**.

Tests obligatorios:

- Amortización parcial y total de una deuda.
- Pago que cubre varias deudas.
- Sobrepago y saldo a favor.
- Pago en moneda distinta a la deuda.
- Intento de pago mayor al saldo (debe fallar).
- Anulación de pago y de deuda con pagos aplicados (debe fallar).
- Venta de combo descuenta componentes.
- Anulación de pedido restaura stock.
- Compra recibida incrementa stock; anulación lo revierte.
- Numeración secuencial sin duplicados.
- Permisos por rol (vendedor no ve costos, cobrador no crea pedidos).
- Gate de empresa sin configurar.
- Cálculo de totales con IVA, descuentos y redondeo.

---

## 16. Comandos

### Backend (PowerShell)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
python manage.py migrate
python manage.py bootstrap
python manage.py runserver
pytest
ruff check .
ruff format .
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
npm run build
npm run test
npm run lint
```

---

## 17. Definition of Done

Una tarea está terminada solo si:

- [ ] Cumple las reglas duras de la sección 3.
- [ ] Tiene migración si cambió el modelo.
- [ ] Tiene permisos por rol.
- [ ] Tiene validaciones de negocio.
- [ ] Tiene tests (y pasan).
- [ ] `ruff check` y `npm run lint` limpios.
- [ ] No rompe la API existente.
- [ ] Actualiza documentación si cambia el contrato o una regla.
- [ ] No deja secretos ni archivos generados en el repo.

---

## 18. Roadmap

| Fase | Entregable |
|---|---|
| 0 | Bootstrap: settings por entorno, `User` custom, roles, `BaseModel`, lint, tests base, `.env.example` |
| 1 | Empresa + auth + layout + gate fiscal + cambio de contraseña |
| 2 | Clientes/proveedores + catálogo + kardex + ajustes |
| 3 | Compras + recepción + costos |
| 4 | Pedidos + combos + stock + numeración |
| 5 | Deudas + pagos + aplicaciones + recibos |
| 6 | Caja + gastos |
| 7 | Reportes + dashboard + exportaciones |
| 8 | Notificaciones `wa.me` + plantillas |
| 9 | Respaldos, hardening y despliegue |

---

## 19. Fuera de alcance

- Facturación fiscal / imprenta digital / numeración legal.
- Envío automático de WhatsApp (API oficial o librerías no oficiales).
- Multi-empresa / multi-tenant.
- PostgreSQL (por ahora).
- App móvil nativa.
- Pasarela de pagos en línea.
- Contabilidad formal (libro diario, mayores, balances).

---

## 20. Cambios respecto al plan original

| Original | Ahora | Motivo |
|---|---|---|
| `apps/authentication` | `apps/accounts` | Evitar confusión con `django.contrib.auth` |
| `Pago` 1:1 con `Deuda` | `Pago` + `PagoAplicacion` (N:M) | Un pago cubre varias deudas |
| `Producto.stock` editable | Kardex `MovimientoInventario` | Auditoría y trazabilidad |
| Sin moneda | Multimoneda con `TasaCambio` histórica | Contexto Venezuela |
| `logo_url` externo | `ImageField` + `media/` | Evitar enlaces roto y SSRF |
| Solo CxC | + compras, proveedores, caja, gastos | Alcance completo solicitado |
| WhatsApp automático | `wa.me` manual + log | Viabilidad y ToS |
| Superusuario hardcodeado | `bootstrap` + `.env` + cambio obligatorio | Seguridad |
| Gate fiscal en frontend | Middleware backend `409` | No evitable |
| React JS | React + TypeScript | Seguridad de tipos en dinero |
| Sin roles | 4 roles con permisos explícitos | Operación real |
| Sin tests | pytest + Vitest, cobertura en finanzas | Sistema financiero |
| Numeración libre | `Secuencia` por año | Control interno sin duplicados |

---

## 21. Cómo debe trabajar un agente

1. Leer este documento y el `README.md`.
2. Revisar el estado real del repo antes de asumir.
3. Si la tarea es ambigua o contradice este documento, **preguntar**.
4. Implementar en el módulo correcto, respetando la separación por features.
5. Escribir tests junto con el código, no después.
6. Ejecutar lint y tests antes de declarar terminado.
7. Resumir cambios, decisiones y riesgos al finalizar.

**Ante duda entre "rápido" y "correcto" en dinero, stock o permisos: siempre correcto.**
