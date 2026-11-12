# paez — Sistema de Cobros, Inventario y Gestión Comercial

Sistema interno para una firma/empresa venezolana: catálogo, inventario con kardex,
compras, pedidos, cuentas por cobrar, pagos, caja, gastos, reportes y recordatorios
de cobro por WhatsApp mediante enlaces `wa.me`.

> La fuente de verdad del diseño y las reglas del proyecto es [`AGENTS.md`](./AGENTS.md).
> Léelo antes de contribuir.

## Stack

- Backend: Python 3.14 + Django 6 + Django REST Framework
- Base de datos: SQLite (WAL)
- Frontend: React + Vite + TypeScript + Tailwind CSS
- Auth: JWT (`djangorestframework-simplejwt`)
- Moneda: multimoneda con tasa histórica
- WhatsApp: enlaces `wa.me` (sin envío automático)

## Puesta en marcha (backend)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# edita .env con tu SECRET_KEY y credenciales del administrador
python manage.py bootstrap
python manage.py runserver
```

`bootstrap` aplica migraciones y crea el superusuario solo si no existe ningún usuario.
En el primer arranque se configura la empresa; después el sistema exige cambiar
la contraseña temporal antes de operar el resto de módulos.

### API

- Base: `http://127.0.0.1:8000/api/v1/`
- Login: `POST /api/v1/auth/token/` con `{"email": "...", "password": "..."}`
- Documentación: `http://127.0.0.1:8000/api/docs/`
- Admin: `http://127.0.0.1:8000/admin/`

## Puesta en marcha (frontend)

Con el backend corriendo en otra terminal:

```powershell
cd frontend
npm install
copy .env.example .env
npm run dev
```

Abre `http://127.0.0.1:5173`. Vite hace proxy de `/api` hacia
`http://127.0.0.1:8000`, por lo que la cookie de refresco funciona en el mismo
origen. En producción, sirve el build de React y la API bajo el mismo dominio.

### Tests, lint y build

Backend:

```powershell
cd backend
pytest
ruff check .
ruff format .
```

Frontend:

```powershell
cd frontend
npm run test
npm run lint
npm run build
```

## Estado

- **Fase 0** completada: estructura, `User` personalizado, roles, `BaseModel`,
  auth JWT, bootstrap, lint y tests.
- **Fase 1** completada: empresa singleton, tasas de cambio, gate fiscal en
  backend, login, restauración de sesión, cambio de contraseña obligatorio,
  layout con sidebar/header, rutas protegidas, `RoleGuard`, `CompanyGate` y
  pantalla de configuración de empresa.
- **Fase 2** completada: clientes y proveedores, catálogo de productos y combos,
  kardex auditable, ajustes de stock y pantallas de inventario.
- **Fase 3** completada: compras con numeración anual `COMP-YYYY-000001`,
  recepción atómica con entrada al kardex y costo promedio, anulación con
  reverso de inventario y pantalla de compras con filtros y acciones.
- **Histórico de tasas:** registro diario del dólar BCV, euro y USDT
  (`/app/tasas`), con resumen del día y correcciones; la última tasa del día es
  la que aplican compras y pedidos en bolívares.

Las apps restantes (`orders`, `finances`, `notifications`, `reports`) están
creadas como esqueleto para las siguientes fases del roadmap en `AGENTS.md`.
