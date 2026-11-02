<!-- markdownlint-configure-file { "MD024": { "siblings_only": true } } -->

# Changelog

Todos los cambios relevantes del proyecto se registran en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [versionado semántico](https://semver.org/lang/es/). Backend y frontend comparten una única versión: ver «Versionado» en el [README](README.md).

## Sin publicar

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
