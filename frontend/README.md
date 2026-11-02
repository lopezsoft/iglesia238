# Iglesia 238: aplicación web

Aplicación Angular 22 del sistema multi-iglesia: membresía, secretaría y contabilidad, con acceso por rol y por alcance (plataforma, denominación o sede).

El diseño aprobado es el prototipo navegable en Claude Design: [Iglesia 238 — App por roles](https://claude.ai/artifact/7GpCsLf1Kfe6e8tsWQ5DW5). La API y el modelo de datos están en [backend/](../backend/README.md).

## Modo demostración

La API todavía no expone autenticación ni módulos de negocio: llegan en los Sprints 1 a 6 del [plan](../docs/2026-11-02-0215-plan-implementacion-scrum.md). Mientras tanto, cada módulo usa un adaptador de demostración en memoria con datos ficticios, y la aplicación muestra el aviso «Modo demostración».

- Los datos viven solo en la pestaña del navegador: recargar conserva la sesión, cerrar la pestaña lo reinicia todo.
- La contraseña de todos los usuarios de demostración es `Demo2026!`. La pantalla de ingreso los lista.

| Usuario | Rol | Alcance |
| --- | --- | --- |
| `laura.gomez@iglesia238.example` | Administrador de plataforma | Plataforma |
| `andres.molina@montedesion.example` | Administrador de denominación | Iglesia Cristiana Monte de Sion |
| `daniel.herrera@montedesion.example` | Pastor | Sede Central |
| `marta.castillo@montedesion.example` | Secretario(a) | Sede Central |
| `jorge.ramirez@montedesion.example` | Tesorero(a) | Sede Central |
| `paola.ruiz@montedesion.example` | Secretario(a) y Tesorero(a) | Sede Norte y Sede Soacha: cambia con el selector «Actuar en» |

Cuando un endpoint exista, su adaptador HTTP reemplaza al de demostración en los `providers` de la ruta del módulo; los componentes no cambian.

## Desarrollo

```bash
npm install
npm start                 # http://localhost:4200, con proxy de /api hacia http://localhost:3000
npm test                  # pruebas unitarias con Vitest
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
      demo/                base de datos en memoria y latencia simulada
      models/              modelos compartidos, reflejo del esquema Prisma
      debug/               DebugService: único canal de logs, silencioso en producción
      errors/              DomainError y manejador global de errores
    layout/                shell autenticado (menú por permisos, selector de alcance) y layout público
    shared/                componentes de UI, pipes y utilidades
    features/<contexto>/   un módulo por pantalla: página, componentes y data/ (puerto + adaptador)
  assets/scss/             tokens, base y clases globales de componentes
  environments/            modo demostración y latencia
```

- **Puertos y adaptadores:** cada módulo declara un puerto (`abstract class XRepository`) y un adaptador de demostración. Los componentes dependen solo del puerto.
- **Aislamiento:** los adaptadores simulan el `TenantContext` de la API. Nunca devuelven datos de otra denominación y filtran por sede cuando el alcance es una sede.
- **Permisos:** el menú, las rutas (`canMatch`, así que ni se descarga el código de un módulo prohibido) y las acciones de escritura se rigen por los permisos del alcance activo. La API vuelve a validar todo.
- **Angular moderno:** componentes standalone con `OnPush`, señales, `rxResource`, control de flujo nativo, formularios reactivos tipados y detección de cambios sin zone.js.
- **Estilos:** tokens en `src/assets/scss/_tokens.scss`. Ningún componente escribe colores literales.

## Roles y permisos

Los permisos son los del seed del backend (`backend/prisma/seed.ts`), en `core/auth/permission.ts` y `core/auth/role.ts`. El permiso de cada módulo está en `core/navigation/navigation.ts`.

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
