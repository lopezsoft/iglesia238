# Church Management API

API multi-iglesia para membresía, secretaría y contabilidad. Construida con NestJS 12 (ESM) sobre Fastify 5, Prisma 7 y MariaDB 11.8, con Redis.

El plan, las decisiones de arquitectura y el backlog están en [docs/2026-11-02-0215-plan-implementacion-scrum.md](../docs/2026-11-02-0215-plan-implementacion-scrum.md).

La versión es la de `package.json`, compartida con el frontend, y Swagger la muestra. Los cambios están en el [CHANGELOG](../CHANGELOG.md) y la política de versionado en el [README raíz](../README.md#versionado).

## Requisitos

- Node.js 22.22.3 o superior (ver `.nvmrc`).
- Docker, solo para la base de datos y Redis.

## Puesta en marcha local

En local, la base de datos y Redis corren en Docker, y la API corre en el equipo.

```bash
# 1. En la raíz del repositorio: copiar y completar las variables de Docker Compose
cp .env.example .env
docker compose up -d          # MariaDB en 127.0.0.1:3306 y Redis en 127.0.0.1:6379

# 2. En backend/: copiar y completar las variables de la API, con las mismas credenciales
cp .env.example .env
npm install
npm run prisma:generate

# 3. Base de datos: ver «Migraciones» la primera vez
npm run prisma:migrate:dev
npm run prisma:seed

# 4. API en modo desarrollo
npm run start:dev             # http://localhost:3000/api  ·  Swagger en /api/docs
```

> Si tu terminal tiene `NODE_ENV=production`, `npm install` omite las dependencias de desarrollo y la API valida el entorno como producción. Usa `NODE_ENV=development` en local.

Si el puerto 3306 u 80 está ocupado (por ejemplo, por WAMP), cambia `DB_PORT` o `REDIS_PORT` en el `.env` de la raíz y la URL en `backend/.env`.

## Migraciones

El esquema está dividido por contexto en `prisma/schema/`. Algunas reglas no se pueden expresar en Prisma (`CHECK`), así que viven en `prisma/sql/constraints.sql`; la migración inicial (`prisma/migrations/<fecha>_init`) ya las incluye.

Para un cambio de esquema:

```bash
npx prisma migrate dev --create-only --name <cambio>   # genera sin aplicar
# revisar migration.sql y añadir a mano las reglas CHECK nuevas (y a prisma/sql/constraints.sql)
npx prisma migrate dev                                  # aplica
```

Una columna usada en un `CHECK` no admite `ON UPDATE CASCADE`: por eso todas las relaciones declaran `onUpdate: Restrict`.

`prisma migrate diff --from-migrations` muestra `MODIFY ... JSON` en las tres columnas JSON aunque no haya cambios: MariaDB guarda JSON como `LONGTEXT` con un `CHECK (json_valid(...))`. Para detectar desviaciones, usar `migrate dev --create-only` o `migrate diff --from-config-datasource`.

**Migración pendiente de aplicar:** `20261102150000_api_support_fields` (código de sede, estado de la política de privacidad, sede y número del carné, emisor y motivo de anulación del certificado, lugar y oficiante del matrimonio, institución y año de estudios, autor de la asistencia e índice de caja). Está generada y revisada, pero **no aplicada**. Para aplicarla:

```bash
npm run prisma:migrate:deploy   # aplica las migraciones pendientes (en producción lo hace el servicio migrator)
npm run prisma:generate         # regenera el cliente si aún no lo hiciste
npm run prisma:seed             # agrega los tipos de reunión y mantiene los catálogos
```

La migración rellena las sedes existentes con el código provisional `S<id>`; corrígelo desde Sedes (campo «código»). Hasta aplicarla, la API compila pero las consultas que usan las columnas nuevas fallan.

`prisma migrate dev` usa la base auxiliar `<base>_shadow`, que crea `docker/mariadb/init/01-shadow-database.sh` la primera vez que arranca el volumen.

## Datos de ubicación

El seed carga 245 países y los 33 departamentos y 1122 municipios de Colombia desde `prisma/seed-data/`. Cada archivo indica su origen en el campo `source`:

- `countries.json`: códigos ISO 3166-1 alfa-2 e indicativos de `libphonenumber-js`, nombres en español de CLDR y códigos alfa-3 de la base de ubicaciones de MatiasApp.
- `colombia-divipola.json`: códigos DANE de departamentos (`05`) y municipios (`05001`), con nombres normalizados (sin espacios sobrantes y con conectores en minúscula: «Villa de Leyva»).

Los municipios se identifican por su código, así que corregir un nombre en el JSON y volver a ejecutar el seed lo actualiza sin duplicar filas. Para otro país, se agrega un archivo con la misma estructura y una llamada a `seedAdministrativeDivisions`.

## Variables de entorno

La API valida el entorno al arrancar (`src/config/environment.ts`) y no arranca si falta una obligatoria. La plantilla es `.env.example`; en producción las define `docker-compose.prod.yml`.

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL`, `REDIS_URL` | Sí | Conexiones a MariaDB y Redis |
| `JWT_SECRET` | Sí | Firma de los tokens de acceso. Mínimo 32 caracteres, distinto en cada entorno (`openssl rand -hex 48`) |
| `JWT_EXPIRATION` | No (`15m`) | Vigencia del token de acceso (`30s`, `15m`, `30m`). Máximo 30 minutos: un token robado sirve hasta que vence |
| `REFRESH_TTL` | No (`7d`) | Vigencia del refresh token y de su cookie (ventana deslizante: cada rotación la renueva) |
| `REFRESH_MAX_LIFETIME` | No (`30d`) | Duración absoluta de una sesión, por muchas veces que se rote su refresh token; pasado ese tiempo hay que ingresar de nuevo. No puede ser menor que `REFRESH_TTL` |
| `APP_BASE_URL` | No (`http://localhost:4200`) | Dirección pública de la web; base de los enlaces de invitación y recuperación |
| `TRUST_PROXY` | No (`false`) | Proxies cuyo `X-Forwarded-For` se acepta para conocer la IP del cliente, de la que dependen los límites de intentos. Admite `false`, un número de saltos (`1` detrás de un solo proxy, el caso de Nginx en Docker), o direcciones/rangos CIDR separados por coma (`172.18.0.0/16`). Evita `true`: confía en todos los saltos y, si el proxy añade al encabezado en vez de reemplazarlo, el cliente puede inventar su IP y saltarse los límites. Con `false` detrás de un proxy, todos los visitantes comparten el mismo contador (por ejemplo, las 5 solicitudes por hora del formulario público serían para toda la iglesia). `frontend/nginx.conf` reenvía `X-Forwarded-For $remote_addr`, que reemplaza lo que envíe el cliente |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | No | Correo saliente. Sin `SMTP_HOST` la API no envía correos: lo registra sin destinatario ni enlace, y quien invita recibe el enlace de un solo uso para enviarlo por otro medio. Con `SMTP_HOST`, `SMTP_FROM` es obligatorio; usuario y contraseña van juntos |
| `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD`, `PLATFORM_ADMIN_NAME` | No | Solo las lee `npm run admin:create` (ver más abajo). La API no las usa |

`docker-compose.prod.yml` debe pasar `JWT_SECRET` (y, si se usa correo, `SMTP_*`) al servicio de la API. La cookie del refresh token lleva `Secure` en producción y en cualquier entorno cuyo `APP_BASE_URL` empiece por `https://`.

### Límites por IP

| Ruta | Límite |
|---|---|
| `POST /api/public/membership-applications` | 5 por hora |
| `POST /api/public/membership-applications/status` | 30 cada 10 minutos |
| `POST /api/auth/login` | 30 cada 15 minutos (y 10 por correo; cerrado si Redis falla) |
| `POST /api/auth/password-reset/request` y `/confirm` | 20 por hora |
| `POST /api/users/invitations` | 20 por hora |
| `POST /api/geo/municipalities/:code/neighborhoods` | 30 por hora |

Son por IP del cliente tal como la resuelve Fastify con `TRUST_PROXY`: si no está bien configurado, los límites no protegen o castigan a todos por igual.

## Autenticación, alcance y permisos

- **Token de acceso** (JWT HS256): lleva solo `sub` (usuario) y `sid` (sesión). Va en `Authorization: Bearer`, el frontend lo guarda solo en memoria. Los permisos **no** viajan en el token: se calculan en cada petición, así que revocar un rol surte efecto de inmediato. `JwtAuthGuard` además comprueba que la sesión (`sid`, la familia del refresh token) siga abierta: cerrar sesión, cambiar la contraseña o detectar un refresh token robado invalida también el access token en la petición siguiente, no cuando vence.
- **Refresh token**: opaco, cookie `HttpOnly`, `SameSite=Strict`, `Path=/api/auth`, y la cabecera `X-Requested-With` es obligatoria en `/api/auth/refresh` y `/api/auth/logout`. `@fastify/cookie` está registrado en `configureApp`.
- **Alcance activo**: toda petición de dominio lleva `X-Scope` con el formato de `UserRole.scopeKey`: `P` (plataforma), `D:<denominationId>` o `C:<congregationId>`. `PermissionsGuard` lo valida contra los `user_roles` vigentes: la plataforma solo cubre `P`, un rol de denominación cubre su denominación y sus sedes, un rol de sede solo su sede. Un alcance ajeno responde `403 SCOPE_FORBIDDEN` y la plataforma nunca llega a las tablas de negocio.
- **Guardas globales** (`APP_GUARD`): `JwtAuthGuard` (todo requiere token salvo `@Public()`) y `PermissionsGuard`. Los permisos de una ruta se declaran con `@RequirePermissions(...todos)` o `@RequireAnyPermission(...alguno)`; el contexto llega al controlador con `@CurrentTenant()` y los repositorios reciben un `TenantScope`.
- **Aislamiento**: los repositorios de tablas de negocio extienden `TenantScopedRepository` y reciben un `TenantScope` (no se puede construir sin denominación). Un recurso de otro inquilino responde `404`, nunca `403`. `test/support/cross-tenant.ts` ofrece `describeCrossTenantIsolation`, que cada caso de uso usa en sus pruebas.
- **Contraseñas**: puerto `PasswordHasher` con `scrypt` de `node:crypto` (hash autodescriptivo `scrypt$logN$r$p$sal$clave`, se rehace al iniciar sesión si cambia el costo). El hash `!` marca una cuenta invitada sin contraseña.
- **Límite de intentos**: `RateLimitService` sobre Redis (`INCR` con `EXPIRE` atómico). El inicio de sesión se cierra si Redis falla; los endpoints públicos se abren y lo registran. `@RateLimit({ name, limit, windowSeconds })` limita por IP en una ruta.
- **Errores**: todas las respuestas de error llevan `code` estable además del mensaje (`DomainException` y sus subclases; los `CHECK` de MariaDB se traducen a `422 CONSTRAINT_VIOLATION`).
- **Numeración**: `DocumentNumberingService` con claves `MEMBER`, `VOUCHER:<TIPO>` y `CERT:<CÓDIGO>` en `document_sequences`; los contadores no se reinician, el año solo se formatea. Llamarlo dentro de la transacción que guarda el documento.
- **Serialización**: `src/common/mappers` convierte `Decimal` y `BigInt` a número y las columnas `DATE` a `YYYY-MM-DD`; «hoy» se calcula en `America/Bogota` con `Clock`.

## Módulo de autenticación (`modules/auth`)

| Ruta | Descripción |
|---|---|
| `POST /api/auth/login` | Correo y contraseña. Devuelve `{ accessToken, expiresIn, session }` y la cookie `refresh_token`. 5 intentos fallidos bloquean la cuenta 15 minutos (queda en auditoría como `ACCOUNT_LOCKED`), pero la respuesta es siempre `401 INVALID_CREDENTIALS`, con el mismo trabajo de hash que un correo desconocido: el bloqueo no revela si el correo existe. Además hay límite por IP y por correo en Redis (cerrado si Redis falla) |
| `POST /api/auth/refresh` | Rota el refresh token y devuelve lo mismo que el login. Si un token ya rotado reaparece pasados 10 s, se revoca toda la sesión (`REFRESH_REUSE_DETECTED` en auditoría) |
| `POST /api/auth/logout` | Revoca la sesión de la cookie y la borra. Funciona con el access token vencido |
| `GET /api/auth/me` | Sesión: roles vigentes con permisos (de la BD) y alcances seleccionables. Los roles de una denominación inactiva o de una sede inactiva o borrada no aparecen |
| `POST /api/auth/password-reset/request` | Responde siempre `202`, y nunca antes de 400 ms (la cuenta existente hace más trabajo en la base de datos; el tiempo no debe delatarla). Si la cuenta existe y hay SMTP, envía un enlace de un solo uso (30 min, `UserToken` tipo `PASSWORD_RESET`) |
| `POST /api/auth/password-reset/confirm` | `{ token, newPassword }`: cambia la contraseña y cierra todas las sesiones |
| `POST /api/auth/invitations/lookup` | `{ token }`: valida un enlace de invitación (`UserToken` tipo `EMAIL_VERIFICATION`, 72 h) y devuelve `{ email, displayName, expiresAt }`. El token va en el cuerpo y no en la URL, para que no quede en los registros de acceso del proxy |
| `POST /api/auth/invitations/accept` | `{ token, password }`: activa la cuenta y verifica el correo. Solo sirve para cuentas que aún no tienen contraseña (hash `!`), nunca para reescribir la de una cuenta activa |
| `POST /api/auth/change-password` | `{ currentPassword, newPassword }`: cierra las demás sesiones |

**Para quien crea invitaciones y enlaces de recuperación (módulo `users`):** el token es `generateOpaqueToken()` de `common/security/opaque-token.ts` (32 bytes en base64url); en `user_tokens.token_hash` se guarda `hash` (SHA-256 en hexadecimal) y el `token` solo viaja en el enlace. `modules/auth/application/auth-mail.ts` construye los enlaces (`/login/accept-invitation?token=` y `/login/reset-password?token=`) a partir de `APP_BASE_URL`. Al crear una invitación, el usuario queda con `UNUSABLE_PASSWORD_HASH`.

## Catálogos y geografía (`modules/catalogs`)

| Ruta | Descripción |
|---|---|
| `GET /api/public/catalogs` | Sin sesión: tipos de documento y estados civiles (con `ETag`) |
| `GET /api/public/geo/municipalities?search=&limit=` | Sin sesión: municipios por nombre o inicio del código DIVIPOLA |
| `GET /api/catalogs` | Con sesión: todos los catálogos globales (con `ETag`) |
| `GET /api/geo/municipalities?search=&limit=` · `GET /api/geo/municipalities/:code` | Búsqueda y consulta por código DIVIPOLA (`{ code, name, regionCode, regionName }`) |
| `GET/POST /api/geo/municipalities/:code/neighborhoods` | Lista y «busca o crea» barrios (el `POST` exige `congregations.manage`, `members.write` o `applications.review`) |

## Dashboard (`modules/dashboard`)

`GET /api/dashboard/summary?period=today|yesterday|7d|month` (requiere `X-Scope`) devuelve `{ period, periodLabel, previousLabel, asOf, range, scope, hero, kpis, panels, lists, trends, unavailable }`. El módulo solo orquesta: cada área aporta sus widgets con un **proveedor**.

```ts
@Injectable()
@RegisterDashboardWidgets()
export class MembershipWidgets implements DashboardWidgetProvider {
  readonly key = 'membership';                       // único; sale en `unavailable` si falla
  readonly requiredPermissions = ['members.read'];   // TODOS, en el alcance activo
  readonly scopeKinds = ['DENOMINATION', 'CONGREGATION'] as const;

  async provide({ tenant, window }: DashboardContext): Promise<DashboardContribution> {
    // tenant.tenantScope() para filtrar por denominación/sede; window.current y window.previous (YYYY-MM-DD, Bogotá)
    return { kpis: [...], panels: [...], lists: [...], trends: [...], hero: { priority: 100, ... } };
  }
}
```

- Basta declarar la clase como `provider` de cualquier módulo: `DashboardWidgetRegistry` la descubre con `DiscoveryService`, sin importar el módulo del dashboard.
- Tipos de widget (`application/dashboard.types.ts`): `hero` (uno por página: gana la mayor `priority`; `previous` y `series` honestos, `series: []` si no hay historia), `kpis`, `panels` (cuadrícula de cifras), `lists` y `trends` (barras). Cada uno elige su pestaña (`general` o `indicators`) y su `order`. Las claves repetidas se descartan.
- Los proveedores corren en paralelo; si uno falla se registra con `SmartLogger`, se omite y su `key` aparece en `unavailable` (la página avisa que faltan cifras en lugar de mostrar ceros).
- `buildPeriodWindow` (`period-window.ts`) traduce el periodo a fechas de Bogotá y define el periodo de comparación (hoy vs ayer, 7 días vs los 7 anteriores, mes vs los mismos días del mes anterior).
- Claves de proveedor ya usadas: `platform-overview`, `platform-security`, `users-overview`, `activity` (hero y tendencia desde auditoría), `recent-audit`, `members`, `applications`, `certificates`, `attendance`, `congregations-overview` (conteos de secretaría, a través de un único puerto `DashboardOperationsReader`), y los de contabilidad: `financial-income`, `cash-balances` y `tithe-settlement`.

## Aportes y votos (`modules/contributions`, `modules/vows`)

Todas las rutas exigen `X-Scope`. Leer pide `contributions.read`; registrar, anular y modificar piden `contributions.write` **y una sede** (en el alcance de toda la denominación las lecturas agregan todas las sedes y las escrituras responden `400 CONGREGATION_SCOPE_REQUIRED`). Las rutas de otra sede o denominación responden `404`.

| Ruta | Descripción |
|---|---|
| `GET /api/accounting/contributions/form-options` | Tipos activos, periodos, fechas permitidas, rangos de diezmo liquidados y próximo recibo |
| `GET /api/accounting/contributions?year=&month=` (o `from=&to=`) `&category=&contributionTypeId=&paymentMethod=&status=&search=&page=&pageSize=` | Aportes con filtros y paginación en el servidor, y totales por categoría de todo el filtro |
| `GET /api/accounting/contributions/:id` | Detalle: quién lo registró, recibo, consolidación y liquidación |
| `GET /api/accounting/contributions/export?...` | CSV (`;`, UTF-8 con BOM) con los mismos filtros; deja una entrada de auditoría con el número de filas |
| `POST /api/accounting/contributions` | Registra un aporte nominal, anónimo o colecta y emite su recibo `REC` (numeración `VOUCHER:REC` por sede, sin reinicio anual) |
| `POST /api/accounting/contributions/:id/void` | Anula con motivo (10–255): se conserva la fila y se anula el recibo; se rechaza si está liquidado o consolidado |
| `GET /api/accounting/contributors/search?q=` | Buscador de aportantes (máx. 8, los de la sede primero, documento enmascarado). Pide `contributions.read`, no `members.read` |
| `GET /api/accounting/vow-pledges` | Promesas con filtros (`status`, `contributionTypeId`, `search`, `overdueOnly`), paginación, indicadores y conteo por estado |
| `GET /api/accounting/vow-pledges/export` · `GET /api/accounting/vow-pledges/:id` | CSV y detalle con abonos (de toda la denominación) |
| `GET /api/accounting/vow-pledges/open?personId=&contributionTypeId=` · `GET /api/accounting/vow-pledges/:id/payment-target` | Promesas abiertas para el formulario de abono (pide `contributions.write`) |
| `POST /api/accounting/vow-pledges` · `PATCH /api/accounting/vow-pledges/:id` · `POST /api/accounting/vow-pledges/:id/cancel` | Crea, modifica (valor, fecha límite, observaciones) y cancela con motivo |

Reglas que conviene conocer:

- **Abonos a votos:** solo a una promesa de la misma persona y del mismo tipo, activa y dentro del saldo. La promesa se bloquea (`SELECT ... FOR UPDATE`) mientras se registra o anula un abono, así que dos abonos simultáneos no superan el saldo. El estado de la promesa (`ACTIVE`/`FULFILLED`) se guarda en la misma transacción; una promesa cancelada sigue cancelada.
- **Periodos:** el periodo contable del mes del aporte debe existir y estar abierto (`PERIOD_NOT_FOUND` 422, `PERIOD_CLOSED` 409). Los periodos los administra la configuración contable; este módulo solo los lee.
- **Diezmo liquidado:** un diezmo con fecha dentro de una liquidación emitida se rechaza (`TITHE_RANGE_SETTLED`).
- **Código de promesa:** `VOTO-AAAA-NNNN` usa el año de la promesa y el `id` de la fila (no hay columna para un consecutivo por sede).
- **Auditoría:** `CONTRIBUTION_RECORDED`, `CONTRIBUTION_VOIDED`, `CONTRIBUTIONS_EXPORTED`, `VOW_PLEDGE_CREATED|UPDATED|CANCELLED`, `VOW_PLEDGES_EXPORTED`, siempre sin nombres ni descripciones libres (el motivo de cancelación se guarda en el cambio `reason`).

## Roles, permisos y mapa de la API

Los permisos salen de la base de datos (seed en `prisma/seed.ts`); la sesión (`GET /api/auth/me`) los devuelve por rol y alcance, así que el frontend no los duplica. Toda ruta de dominio exige `X-Scope`.

| Rol | Permisos |
|---|---|
| Administrador de plataforma | `denominations.manage`, `users.manage`, `audit-logs.read` |
| Administrador de denominación | `congregations.manage`, `users.manage`, `members.read`, `reports.read`, `audit-logs.read` |
| Pastor | `applications.review`, `members.read`, `members.write`, `socioeconomic-profiles.read`, `certificates.issue`, `contributions.read`, `reports.read` |
| Secretario(a) | `applications.review`, `members.read`, `members.write`, `socioeconomic-profiles.read`, `socioeconomic-profiles.write`, `certificates.issue`, `attendance.write` |
| Tesorero(a) | `contributions.read`, `contributions.write`, `cash-transactions.write`, `tithe-settlements.write`, `budgets.manage`, `reports.read` |

Prefijos por módulo (el detalle de cada ruta, con su cuerpo y sus errores, está en Swagger: `SWAGGER_ENABLED=true` y `/api/docs`):

| Módulo | Prefijo | Qué ofrece |
|---|---|---|
| `auth` | `/api/auth` | Inicio y cierre de sesión, refresh, recuperación, invitaciones, cambio de contraseña |
| `denominations` | `/api/platform/denominations` | Alta, edición y estado de denominaciones; una denominación nueva se aprovisiona en una transacción (fondo, tipos de aporte con su cuenta, plan de cuentas mínimo, certificados, cargos y política de datos en borrador). **Los porcentajes del diezmo no se aprovisionan**: se ingresan en Contabilidad > Configuración |
| `organization` | `/api/organization`, `/api/congregations/selectable` | Sedes (código obligatorio), razones sociales, distritos |
| `users` | `/api/users`, `/api/user-roles`, `/api/roles` | Usuarios, invitaciones (devuelven el enlace de un solo uso solo a quien invita), `POST /api/users/:id/reset-link`, asignación y revocación de roles. Reglas: nadie se otorga roles a sí mismo (`409 SELF_GRANT`); una invitación a un correo que ya tiene cuenta responde `409 DUPLICATE_EMAIL` y no vincula nada (el acceso de una cuenta existente lo otorga el equipo de plataforma); el enlace de recuperación de otra cuenta lo genera quien administra su denominación solo si la cuenta nunca tuvo roles fuera de ella ni es de otro administrador, y la persona recibe un aviso por correo sin enlace |
| `audit-logs` | `/api/audit-logs` | Consulta paginada con filtros |
| `catalogs` | `/api/catalogs`, `/api/geo`, `/api/public` | Catálogos globales, municipios DIVIPOLA y barrios |
| `public`, `membership-applications`, `privacy-policies` | `/api/public/*`, `/api/membership-applications`, `/api/privacy-policies` | Formulario público y estado por código, revisión, duplicados, aprobación (también sobre una persona ya registrada), políticas con publicación |
| `membership` | `/api/members`, `/api/church-positions`, `/api/pastoral-ranks` | Miembros (alta manual, estado, traslados), familia, estudios, cargos, ficha socioeconómica, consentimientos, anonimización, exportación. `SearchPeopleUseCase` es el único buscador de personas: certificados, aportes y secretaría lo usan con un propósito distinto |
| `certificates` | `/api/certificates`, `/api/membership-cards`, `/api/certificate-types` | Emisión con consecutivo `CERT:<CÓDIGO>`, vista previa, anulación, carnés, PDF (`GET .../pdf`, pdfkit) y CSV |
| `attendance`, `secretariat-records` | `/api/attendance-sessions`, `/api/secretariat`, `/api/marriages`, `/api/child-dedications`, `/api/pastoral-terms` | Asistencia por reunión y categoría; matrimonios, presentaciones y periodos pastorales |
| `accounting-setup`, `cash-book` | `/api/accounting/{setup,funds,accounts,contribution-types,periods,tithe-rules,cash-book,vouchers}` | Fondos, plan de cuentas, tipos de aporte, periodos (el primero se crea aquí), reglas del diezmo, libro de caja, consolidación y reversas. `GET /api/accounting/vouchers/:id/pdf` imprime el recibo o comprobante (anulado, con marca de agua) con el mismo permiso por tipo que el detalle |
| `contributions`, `vows` | `/api/accounting/{contributions,contributors,vow-pledges}` | Aportes con recibo, buscador de aportantes y votos con abonos |
| `tithe-settlements`, `budgets`, `reports` | `/api/accounting/{tithe-settlements,budgets}`, `/api/reports` | Liquidación del diezmo, presupuesto y su ejecución, reportes financieros y CSV. El reporte separa los ingresos de caja de los aportes registrados que el libro de caja aún no consolida (`pendingConsolidation`) |
| `dashboard` | `/api/dashboard/summary` | Resumen por rol y alcance armado con proveedores de widgets |
| `health` | `/api/health` | Vivo y listo (`/api/health/ready`) |

Las listas que crecen (miembros, aportes, votos, certificados, carnés, auditoría, usuarios, movimientos de caja) paginan en el servidor con `page` y `pageSize`.

## Primer administrador de plataforma

La base queda sin usuarios. El primer administrador se crea con un comando (no hay credenciales en el seed, ni en el código, ni en Docker Compose):

```bash
npm run admin:create
# pide el correo y la contraseña (oculta); o bien:
PLATFORM_ADMIN_EMAIL=admin@ejemplo.org PLATFORM_ADMIN_PASSWORD='…' npm run admin:create
```

Se niega a ejecutarse si ya existe un administrador de plataforma, o si el correo ya está en uso. Exige antes `npm run prisma:seed` (crea el rol `PLATFORM_ADMIN`). Los demás usuarios se invitan desde la aplicación. En Docker: `docker compose run --rm -it migrator npm run admin:create`.

### Si el administrador de plataforma olvida la contraseña

Sin SMTP, «Olvidé mi contraseña» no envía nada, y otro administrador de plataforma (si lo hay) puede generar un enlace desde la pantalla de usuarios. Si no hay quien lo haga, con acceso al servidor:

```bash
npm run admin:reset-password
# pide el correo y la contraseña nueva (oculta); o bien PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD
```

Solo sirve para un administrador de plataforma activo, quita el bloqueo por intentos y cierra sus sesiones abiertas. En Docker: `docker compose run --rm -it migrator npm run admin:reset-password`.

## Scripts

| Script | Uso |
|---|---|
| `admin:create` | Crea el primer administrador de plataforma (ver arriba) |
| `admin:reset-password` | Restablece la contraseña de un administrador de plataforma desde el servidor (ver arriba) |
| `start:dev` | API con recarga |
| `build` / `start:prod` | Compilar a `dist/` (excluye los auxiliares de prueba `src/**/testing`) y ejecutar |
| `test` / `test:cov` | Pruebas unitarias (Vitest) |
| `test:e2e` | Pruebas de la API sobre Fastify, sin base de datos |
| `lint` / `lint:check` | ESLint con corrección o solo verificación |
| `typecheck` | TypeScript sin emitir archivos |
| `prisma:*` | `generate`, `validate`, `format`, `migrate:dev`, `migrate:deploy`, `seed`, `studio` |

## Estructura

```text
src/
  main.ts                  arranque; carga .env antes que nada
  app.module.ts            raíz de composición: conecta puertos con infraestructura
  bootstrap/               seguridad, validación y Swagger, compartidos con las pruebas e2e
  config/                  variables de entorno validadas
  cli/                     comandos (admin:create, admin:reset-password), se ejecutan con tsx
  foundation/              módulo global que enlaza cada puerto transversal con su adaptador
  common/
    errors/                DomainException, filtro único de errores y puerto ErrorTranslator
    logging/               SmartLogger con redacción de datos sensibles
    security/              guardas globales, decoradores, tokens de acceso, PasswordHasher, política de contraseñas
    tenancy/               TenantContext, TenantScope, resolución de X-Scope, TenantScopedRepository
    rate-limit/            RateLimiter (puerto), RateLimitService, @RateLimit
    mail/                  puerto Mailer
    audit/                 puerto AuditRecorder y buildAuditChanges
    numbering/             DocumentNumberingService
    persistence/           puerto TransactionRunner
    mappers/ time/ pagination/   Decimal/BigInt/fechas, hora de Bogotá, Page<T>
  infrastructure/          adaptadores: Prisma (MariaDB), Redis, correo (nodemailer), scrypt
  modules/
    <módulo>/
      application/         casos de uso y puertos
      infrastructure/      adaptadores del módulo
      presentation/        controladores y DTO
  generated/prisma/        cliente generado (no se versiona)
prisma/
  schema/                  esquema por contexto: organization, identity, membership, secretariat, ministries, accounting
  sql/constraints.sql      reglas CHECK
  seed.ts                  catálogos globales; nunca crea usuarios
  seed-data/               países (ISO 3166-1, nombres en español) y DIVIPOLA de Colombia, en JSON
```

## Convenciones

- **Idioma:** todo identificador de código y de esquema va en inglés. Documentación y comentarios descriptivos, en español.
- **Dependencias:** los módulos dependen de puertos; solo los repositorios usan `PrismaService`. La raíz de composición es el único lugar que conoce las implementaciones.
- **Multi-iglesia:** toda tabla de negocio lleva `denominationId`, y sus FK son compuestas, de modo que la base rechaza referencias entre denominaciones.
- **Logs:** solo con `SmartLogger`, nunca `console.log`. No se registran contraseñas, tokens ni datos personales.
- **Errores:** las respuestas tienen un formato único y nunca exponen detalles internos ni la query string.

## Producción

`docker-compose.prod.yml` en la raíz levanta MariaDB, Redis, un migrador de una sola ejecución (migraciones y catálogos), la API y el frontend. La API se conecta con un usuario que solo tiene permisos de datos (`docker/mariadb/init-prod`).
