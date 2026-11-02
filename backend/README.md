# Church Management API

API multi-iglesia para membresía, secretaría y contabilidad. Construida con NestJS 12 (ESM) sobre Fastify 5, Prisma 7 y MariaDB 11.8, con Redis.

El plan, las decisiones de arquitectura y el backlog están en [docs/2026-11-02-0215-plan-implementacion-scrum.md](../docs/2026-11-02-0215-plan-implementacion-scrum.md).

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

El esquema está dividido por contexto en `prisma/schema/`. Algunas reglas no se pueden expresar en Prisma (`CHECK`), así que viven en `prisma/sql/constraints.sql` y se agregan a la migración inicial:

```bash
npx prisma migrate dev --create-only --name init
cat prisma/sql/constraints.sql >> prisma/migrations/<fecha>_init/migration.sql
npx prisma migrate dev
```

Las migraciones posteriores que añadan reglas `CHECK` deben incluirlas en su propio `migration.sql`. Una columna usada en un `CHECK` no admite `ON UPDATE CASCADE`: por eso todas las relaciones declaran `onUpdate: Restrict`.

`prisma migrate dev` usa la base auxiliar `<base>_shadow`, que crea `docker/mariadb/init/01-shadow-database.sh` la primera vez que arranca el volumen.

## Scripts

| Script | Uso |
|---|---|
| `start:dev` | API con recarga |
| `build` / `start:prod` | Compilar a `dist/` y ejecutar |
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
  common/
    errors/                filtro único de errores y puerto ErrorTranslator
    logging/               SmartLogger con redacción de datos sensibles
  infrastructure/          Prisma (adaptador MariaDB) y Redis
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
```

## Convenciones

- **Idioma:** todo identificador de código y de esquema va en inglés. Documentación y comentarios descriptivos, en español.
- **Dependencias:** los módulos dependen de puertos; solo los repositorios usan `PrismaService`. La raíz de composición es el único lugar que conoce las implementaciones.
- **Multi-iglesia:** toda tabla de negocio lleva `denominationId`, y sus FK son compuestas, de modo que la base rechaza referencias entre denominaciones.
- **Logs:** solo con `SmartLogger`, nunca `console.log`. No se registran contraseñas, tokens ni datos personales.
- **Errores:** las respuestas tienen un formato único y nunca exponen detalles internos ni la query string.

## Producción

`docker-compose.prod.yml` en la raíz levanta MariaDB, Redis, un migrador de una sola ejecución (migraciones y catálogos), la API y el frontend. La API se conecta con un usuario que solo tiene permisos de datos (`docker/mariadb/init-prod`).
