# Iglesia 238: aplicación web

Aplicación Angular 22 del sistema multi-iglesia: membresía, secretaría y contabilidad, con acceso por rol y por alcance (plataforma, denominación o sede).

El diseño aprobado es el prototipo navegable en Claude Design: [Iglesia 238 — App por roles](https://claude.ai/artifact/7GpCsLf1Kfe6e8tsWQ5DW5). La API y el modelo de datos están en [backend/](../backend/README.md).

## Conexión con la API real

La aplicación no tiene datos de prueba ni modo demostración: todas las pantallas hablan con la API (`/api`). Para probarla hace falta la API en marcha, la migración aplicada y un administrador de plataforma (ver [backend/README.md](../backend/README.md)):

1. En `backend/`: `npm run prisma:migrate:deploy`, `npm run prisma:seed` y `npm run admin:create` (crea el primer administrador de plataforma).
2. Arranca la API (`npm run start:dev` en `backend/`) y el frontend (`npm start`). El proxy de desarrollo (`proxy.conf.json`) envía `/api` a `http://localhost:3000`.
3. Ingresa con el correo y la contraseña del administrador. Desde Usuarios y roles invita a los demás usuarios; con SMTP sin configurar, la pantalla muestra el enlace de un solo uso para enviarlo por otro medio.

Cómo se comunica con la API:

- **Sesión:** `POST /api/auth/login` devuelve el token de acceso, que vive solo en memoria. El refresh token es una cookie `HttpOnly` que el navegador envía a `/api/auth`; al recargar, la sesión se restaura con `/api/auth/refresh`. Toda petición lleva `X-Requested-With`.
- **Alcance:** el selector «Actuar en» fija la cabecera `X-Scope` (`P`, `D:<denominaciónId>` o `C:<sedeId>`) de cada petición. La API la valida contra los roles vigentes.
- **Permisos:** la sesión trae los permisos de cada rol (calculados por la API); el frontend solo los usa para mostrar u ocultar menús y acciones.
- **Errores:** un interceptor convierte `HttpErrorResponse` en `DomainError` con el mensaje en español y el `code` de la API.
- **Registro de sedes y correo:** cualquiera puede registrar una sede desde el login (`/register-congregation`, sin cuenta): elige una razón social que creó el administrador de plataforma (Denominaciones > Razones sociales), llena los datos y su usuario, y la sede queda activa. Mientras el correo no se confirma (`emailVerified: false` en la sesión), toda ruta autenticada lleva a `/confirm-email`, y la API responde `403 EMAIL_NOT_VERIFIED`. El enlace del correo abre `/login/verify-email?token=`. Sin SMTP, la API devuelve `devVerificationLink` y la pantalla lo muestra en un recuadro de «Modo desarrollo».
- **Versión:** `src/environments/environment.ts` (`appVersion`) debe coincidir con `package.json`.

## Desarrollo

```bash
npm install
npm start                 # http://localhost:4700 (se abre automáticamente), con proxy de /api hacia http://localhost:3000
npm test                  # pruebas unitarias (ng test, Vitest)
npm run build             # build de producción en dist/frontend/browser
```

> Si tu terminal tiene `NODE_ENV=production`, `npm install` omite las dependencias de desarrollo. Usa `NODE_ENV=development` en local.

## Arquitectura

```text
src/
  app/
    app.routes.ts          rutas: cada módulo es lazy y su guard exige el permiso
    core/
      auth/                sesión, roles, permisos, alcance activo y guards
      navigation/          permiso por módulo (ACCESS) y menú
      http/                interceptores (alcance, token, errores), mapeo a DomainError y URL de la API
      catalogs/            catálogos y municipios desde la API
      models/              modelos compartidos, reflejo del esquema Prisma
      debug/               DebugService: único canal de logs, silencioso en producción
      errors/              DomainError y manejador global de errores
    layout/                shell autenticado (menú por permisos, selector de alcance) y layout público
    shared/                componentes de UI, pipes y utilidades
    features/<contexto>/   un módulo por pantalla: página, componentes y data/ (puerto + adaptador)
  assets/scss/             tokens, base y clases globales de componentes
  environments/            ruta de la API y versión
```

- **Puertos y adaptadores:** cada módulo declara un puerto (`abstract class XRepository`) y un adaptador HTTP (`HttpXRepository`) que se enlaza en los `providers` de su ruta. Los componentes dependen solo del puerto, y las pruebas lo sustituyen por un doble.
- **Aislamiento:** lo garantiza la API; el frontend solo envía el alcance activo y no mezcla datos de sedes distintas.
- **Permisos:** el menú, las rutas (`canMatch`, así que ni se descarga el código de un módulo prohibido) y las acciones de escritura se rigen por los permisos del alcance activo. La API vuelve a validar todo.
- **Angular moderno:** componentes standalone con `OnPush`, señales, `rxResource`, control de flujo nativo, formularios reactivos tipados y detección de cambios sin zone.js.
- **Estilos:** tokens en `src/assets/scss/_tokens.scss`. Ningún componente escribe colores literales.

## Roles y permisos

Los permisos de cada rol los define el seed del backend (`backend/prisma/seed.ts`) y llegan en la sesión; `core/auth/permission.ts` y `core/auth/role.ts` solo tipan los códigos y los nombres. El permiso de cada módulo está en `core/navigation/navigation.ts`.

| Módulo | Permiso |
| --- | --- |
| Denominaciones | `denominations.manage` |
| Sedes, razones sociales y distritos | `congregations.manage` |
| Usuarios y roles | `users.manage` |
| Solicitudes de membresía | `applications.review` |
| Miembros (lectura / edición) | `members.read` / `members.write` |
| Ficha socioeconómica (lectura / edición) | `socioeconomic-profiles.read` / `socioeconomic-profiles.write` |
| Certificados y carnés | `certificates.issue` |
| Asistencia | `attendance.write` |
| Registros de secretaría | `members.write` |
| Aportes y votos (lectura / registro) | `contributions.read` / `contributions.write` |
| Libro de caja | `cash-transactions.write` |
| Liquidación del diezmo | `tithe-settlements.write` |
| Presupuesto y configuración contable | `budgets.manage` |
| Reportes | `reports.read` |
| Auditoría | `audit-logs.read` |

## Producción

`Dockerfile` construye la aplicación y la sirve con Nginx (`nginx.conf`):

- Sirve la SPA con cabeceras de seguridad (CSP incluida).
- Hace de proxy de `/api/` hacia el servicio `backend`.
- Bloquea `/api/health/ready` desde fuera.
- Expone `/healthz` para el healthcheck del contenedor.
