<!-- markdownlint-configure-file { "MD024": { "siblings_only": true } } -->

# Changelog

Todos los cambios relevantes del proyecto se registran en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [versionado semántico](https://semver.org/lang/es/). Backend y frontend comparten una única versión: ver «Versionado» en el [README](README.md).

## Sin publicar

## 0.3.0 - 2026-11-02

### Added

- Prototipo navegable del frontend en Claude Design, [Iglesia 238 — App por roles](https://claude.ai/artifact/7GpCsLf1Kfe6e8tsWQ5DW5): 21 pantallas con la navegación de cada rol y el mapa de acceso por permiso.
- Aplicación Angular con todas las pantallas del MVP del plan, en modo demostración con datos ficticios en memoria mientras la API no expone los módulos:
  - **Acceso:** ingreso con bloqueo tras 5 intentos fallidos y recuperación de contraseña sin revelar si el correo existe.
  - **Inscripción pública:** formulario por pasos con acudiente para menores, autorización de datos según la política vigente, campo trampa contra bots, límite de envíos y consulta del estado por código.
  - **Organización:** denominaciones, sedes, razones sociales (NIT único), distritos, usuarios y roles por alcance, y auditoría.
  - **Membresía:** revisión de solicitudes con detección de duplicados por documento. La aprobación crea en una sola operación la persona, el miembro, el número de carné y la autorización de datos. La ficha del miembro incluye familia, estudios, cargos, ficha socioeconómica con permiso propio, traslados y revocación de la autorización.
  - **Secretaría:** certificados con consecutivo sin huecos por sede, tipo y año, anulación sin borrado y vista de impresión; carnés con vencimiento; asistencia por reunión y categoría; presentaciones de niños, matrimonios y periodos pastorales sin solapes.
  - **Contabilidad:** fondos, plan de cuentas y tipos de aporte; aportes nominales o anónimos; votos con abonos y saldo; libro de caja con periodos, consolidación de aportes y reversas; liquidación del diezmo sin solapes y con componentes que suman el bruto; presupuesto fijo y por comités con su ejecución.
  - **Inicio y reportes:** el inicio se adapta a los permisos de cada rol; reportes de ingresos, egresos, saldos por fondo y aportes por tipo, exportables a CSV.
- Acceso por rol y alcance:
  - Menú y rutas protegidos por permiso. Las rutas usan `canMatch`, así que el código de un módulo prohibido ni se descarga.
  - Selector «Actuar en» para quien tiene roles en varias sedes. La sede elegida se conserva al recargar la página.
- Cada módulo declara un puerto y un adaptador de demostración. Los adaptadores simulan el `TenantContext` de la API: nunca devuelven datos de otra denominación y filtran por sede.
- `DebugService` como único canal de logs: es silencioso en producción y redacta los datos personales.
- 316 pruebas unitarias con Vitest: reglas de negocio, aislamiento entre denominaciones y sedes, y permisos.

### Changed

- Angular 20 → 22.2 con TypeScript 6. La detección de cambios ya no usa zone.js, y las pruebas pasan de Karma y Jasmine a Vitest.
- Estilos con tokens SCSS en `src/assets/scss`: paleta «Plex institucional», tipografías IBM Plex Sans y Mono, y ningún color literal en los componentes.
- Imagen del frontend:
  - Node 22 y Nginx 1.29.
  - Sirve `dist/frontend/browser`, que es la ruta real del build.
  - Añade `.dockerignore`.
  - Cabeceras de seguridad con CSP, proxy de `/api/` hacia el backend, `/api/health/ready` bloqueado desde fuera y `/healthz` para el healthcheck.
- El build de producción ya no incrusta CSS crítico: ese paso necesita un script en línea que la CSP bloquea.

## 0.2.0 - 2026-11-02

### Added

- Migración inicial `init`: 71 tablas en seis contextos, 135 claves foráneas (todas `ON UPDATE RESTRICT`) y 19 reglas `CHECK`. Las claves compuestas sobre `denominationId` impiden en la base de datos referencias entre denominaciones.
- Catálogo de 245 países con códigos ISO 3166-1 alfa-2 y alfa-3, nombre en español e indicativo telefónico (`prisma/seed-data/countries.json`).
- División político-administrativa de Colombia (DIVIPOLA del DANE): 33 departamentos y 1122 municipios con su código oficial (`prisma/seed-data/colombia-divipola.json`).
- `CHANGELOG.md` y política de versionado único para backend y frontend.

### Changed

- `countries`: `iso_code` se reemplaza por `iso_alpha2`, `iso_alpha3` y `phone_code`. La migración `add_location_codes` conserva las filas existentes.
- `regions` y `municipalities`: nuevo campo `code`, único dentro de su país o departamento.
- El seed identifica departamentos y municipios por su código: inserta los nuevos en un lote por departamento y solo actualiza los renombrados.
- Swagger toma la versión de la API de `package.json` en lugar de un valor fijo.
- Plan Scrum: flujo GitHub Flow con ramas cortas por historia, *squash merge* y etiquetas por sprint.

## 0.1.0 - 2026-11-02

### Added

- Modelo de datos multi-iglesia en Prisma, dividido por contexto: organización, identidad, membresía, secretaría, ministerios y contabilidad.
- Seed idempotente de catálogos globales, roles y permisos. Nunca crea usuarios.
- `SmartLogger` con redacción de datos sensibles, filtro único de errores con traductores enchufables y validación de variables de entorno.
- Módulo de salud: *liveness* y *readiness* de MariaDB y Redis.
- Docker: MariaDB 11.8 y Redis 8 para desarrollo; en producción, migrador de una sola ejecución y usuario de base de datos con permisos mínimos.
- Auditoría técnica del estado del proyecto y plan de implementación Scrum en `docs/`.

### Changed

- Backend actualizado a NestJS 12 (ESM) sobre Fastify 5, Prisma 7 con el adaptador de MariaDB, TypeScript 6, Vitest y ESLint 10.

### Removed

- `resources/` deja de versionarse porque contiene datos personales reales.

## 0.0.1 - 2025-11-19

### Added

- Monorepo inicial: backend NestJS con Fastify y Prisma, frontend Angular 20 con componentes *standalone*, Dockerfiles multietapa y Docker Compose.
