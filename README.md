# Iglesia 238: gestión multi-iglesia

**Versión 0.13.4**. Los cambios de cada versión están en el [CHANGELOG](CHANGELOG.md).

Plataforma para administrar varias denominaciones con sus sedes: membresía, secretaría y contabilidad. Cada denominación ve solo sus datos.

| Parte | Tecnología | Estado | Detalle |
| --- | --- | --- | --- |
| [backend/](backend/) | NestJS 12 (ESM) sobre Fastify 5, Prisma 7, MariaDB 11.8, Redis 8 | API de los módulos del MVP: acceso, organización, membresía, secretaría y contabilidad | [backend/README.md](backend/README.md) |
| [frontend/](frontend/) | Angular 22 sin zone.js, señales y Vitest | Todas las pantallas del MVP por rol y permiso, conectadas a la API real | [frontend/README.md](frontend/README.md) |
| [docker/](docker/) | Docker Compose | Desarrollo: MariaDB y Redis. Producción: [docker-compose.prod.yml](docker-compose.prod.yml) | |

El diseño aprobado de la aplicación es el prototipo navegable [Iglesia 238 — App por roles](https://claude.ai/artifact/7GpCsLf1Kfe6e8tsWQ5DW5) en Claude Design, privado mientras no se comparta.

El plan, las decisiones de arquitectura y el backlog están en [docs/2026-11-02-0215-plan-implementacion-scrum.md](docs/2026-11-02-0215-plan-implementacion-scrum.md). La auditoría del punto de partida, en [docs/2026-11-02-0058-auditoria-estado-proyecto.md](docs/2026-11-02-0058-auditoria-estado-proyecto.md).

## Puesta en marcha local

Requisitos: Node.js 22 y Docker.

```bash
cp .env.example .env               # credenciales y puertos de MariaDB y Redis
docker compose up -d               # solo MariaDB y Redis; la API corre en el equipo
```

Los pasos de la API (dependencias, migraciones, seed y primer administrador con `npm run admin:create`) están en [backend/README.md](backend/README.md#puesta-en-marcha-local). Los del frontend, en [frontend/README.md](frontend/README.md).

## Versionado

- Backend y frontend comparten una única versión, la del proyecto, en el campo `version` de `backend/package.json` y `frontend/package.json`.
- Se sigue [versionado semántico](https://semver.org/lang/es/). Mientras la versión sea `0.x`: un `feat` sube la versión menor (`0.2.0` → `0.3.0`) y un `fix`, `refactor` o `perf` sube el parche (`0.2.0` → `0.2.1`). Un cambio incompatible sube la menor hasta llegar a `1.0.0`.
- Todo commit que cambia el código de una aplicación actualiza a la vez la versión de ambos `package.json` (y sus `package-lock.json`), el [CHANGELOG](CHANGELOG.md) y este README. Los commits que solo tocan documentación o CI registran su cambio en «Sin publicar» del CHANGELOG sin subir la versión.
- Para subir la versión: `npm version <x.y.z> --no-git-tag-version` en `backend/` y en `frontend/`.
- Mientras no haya ramas fusionadas en `main`, backend y frontend se desarrollan juntos en `feat/backend-frontend`.
- La API publica su versión en Swagger (`/api/docs`), leída de `backend/package.json`.
- Al cerrar un sprint que se despliega, se etiqueta `main` con la versión vigente (`v0.2.0`).

## Flujo de trabajo con Git

GitHub Flow: `main` protegida, una rama corta por historia (`feat/a-01-login`), commits en [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/) y *squash merge*. El detalle está en la sección «Flujo de trabajo con Git» del plan.

## Estructura

```text
backend/              API NestJS (ver su README)
frontend/             aplicación Angular (ver su README)
docker/               scripts de inicialización de MariaDB (desarrollo y producción)
docs/                 auditoría, plan Scrum y guías
docker-compose.yml    MariaDB y Redis para desarrollo
docker-compose.prod.yml
CHANGELOG.md
```

`resources/` guarda localmente los archivos de origen con datos personales reales y no se versiona.
