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

`prisma migrate dev` usa la base auxiliar `<base>_shadow`, que crea `docker/mariadb/init/01-shadow-database.sh` la primera vez que arranca el volumen.

## Datos de ubicación

El seed carga 245 países y los 33 departamentos y 1122 municipios de Colombia desde `prisma/seed-data/`. Cada archivo indica su origen en el campo `source`:

- `countries.json`: códigos ISO 3166-1 alfa-2 e indicativos de `libphonenumber-js`, nombres en español de CLDR y códigos alfa-3 de la base de ubicaciones de MatiasApp.
- `colombia-divipola.json`: códigos DANE de departamentos (`05`) y municipios (`05001`), con nombres normalizados (sin espacios sobrantes y con conectores en minúscula: «Villa de Leyva»).

Los municipios se identifican por su código, así que corregir un nombre en el JSON y volver a ejecutar el seed lo actualiza sin duplicar filas. Para otro país, se agrega un archivo con la misma estructura y una llamada a `seedAdministrativeDivisions`.

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
