# Iglesia 238 — Plataforma de Gestión Eclesiástica, Contable y Administrativa

[![Versión](https://img.shields.io/badge/versi%C3%B3n-0.15.2-1d4ed8)](CHANGELOG.md)
[![Licencia: AGPL v3](https://img.shields.io/badge/licencia-GNU%20AGPLv3-047857)](LICENSE)
[![Sitio Oficial](https://img.shields.io/badge/web-iglesia238.com-0f172a)](https://iglesia238.com)
[![Nube Oficial](https://img.shields.io/badge/app-app.iglesia238.com-2563eb)](https://app.iglesia238.com)

**Versión 0.15.2**. Los cambios de cada versión están en el [CHANGELOG](CHANGELOG.md).

**Iglesia 238** es una plataforma multi-iglesia y multi-denominación de código abierto diseñada para gestionar con rigor pastoral, administrativo y contable cada congregación: **membresía, secretaría eclesiástica, contabilidad por fondos y liquidación denominacional de diezmos**, con aislamiento estricto de datos por denominación y por sede.

---

## Arquitectura del Monorepo

| Parte | Tecnología | Descripción | Documentación |
| --- | --- | --- | --- |
| [`backend/`](backend/) | NestJS 12 (ESM) sobre Fastify 5, Prisma 7, MariaDB 11.8, Redis 8, Nodemailer (AWS SES) | API REST multi-tenant con arquitectura de puertos y adaptadores, RBAC por alcance (`P`, `D`, `C`), numeración documental transaccional y rastro de auditoría libre de PII | [`backend/README.md`](backend/README.md) |
| [`frontend/`](frontend/) | Angular 22 Zoneless, Signals, `rxResource`, SCSS con tokens de diseño y Vitest | Aplicación web SPA por rol y alcance con auto-actualización en vivo (`/version.json`) y todas las pantallas de plataforma, denominación y congregación | [`frontend/README.md`](frontend/README.md) |
| [`landing/`](landing/) | Astro 5, TypeScript, JSON-LD (`Schema.org`), Sitemap dinámico y `llms.txt` | Sitio institucional de alto rendimiento (`https://iglesia238.com`) con arquitectura SEO técnica y semántica | [`landing/package.json`](landing/package.json) |
| [`docker/`](docker/) | Docker Multi-Stage + Nginx Multi-Host | Desarrollo (`docker-compose.yml` para MariaDB y Redis) y contenedor unificado de producción ([`Dockerfile`](Dockerfile) y [`docker-compose.prod.yml`](docker-compose.prod.yml)) | [`docker/nginx/dokploy.conf`](docker/nginx/dokploy.conf) |

El plan de ingeniería, las decisiones de arquitectura y el backlog están en [`docs/2026-11-02-0215-plan-implementacion-scrum.md`](docs/2026-11-02-0215-plan-implementacion-scrum.md). La auditoría inicial está en [`docs/2026-11-02-0058-auditoria-estado-proyecto.md`](docs/2026-11-02-0058-auditoria-estado-proyecto.md).

---

## Módulos Principales

1. **Gobierno Multi-Denominación y Estructura Organizacional:**
   - Denominaciones, razones sociales (entidades legales / NIT), distritos y sedes (congregaciones), con autorregistro público de congregaciones (`/register-congregation`).
2. **Membresía, Familias y Habeas Data:**
   - Solicitudes públicas de membresía (`/apply`), flujo de aprobación/rechazo, ficha integral del miembro, núcleo familiar, estudios, cargos eclesiásticos, rangos pastorales, perfil socioeconómico, consentimientos de privacidad y anonimización.
3. **Secretaría Eclesiástica y Certificados:**
   - Registro de asistencia por servicio y tendencias, actas de matrimonio, presentación de niños, períodos pastorales, carnés de membresía y emisión/verificación de certificados oficiales.
4. **Contabilidad Congregacional y Liquidación de Diezmos:**
   - Configuración contable por denominación/sede, fondos y categorías, registro de aportes (diezmos, ofrendas, votos), libro de caja y comprobantes, presupuesto anual y liquidación periódica de diezmos hacia la denominación.
5. **Seguridad, Usuarios, Roles y Auditoría:**
   - Invitaciones por correo transaccional (AWS SES / SMTP) y enlace único de un solo uso para WhatsApp, verificación de correo electrónico, límites de intentos en Redis y bitácora de auditoría sin exposición de datos personales.

---

## Puesta en marcha local

Requisitos: **Node.js >= 22.23.4** y **Docker**.

```bash
cp .env.example .env               # credenciales y puertos de MariaDB y Redis
docker compose up -d               # levanta MariaDB 11.8 y Redis 8 en local
```

Los pasos detallados para iniciar la API (instalación, migraciones con Prisma, seed de catálogos y creación del primer administrador de plataforma con `npm run admin:create`) están en [`backend/README.md`](backend/README.md#puesta-en-marcha-local). Los pasos de la aplicación web están en [`frontend/README.md`](frontend/README.md).

---

## Versionado y Flujo de Trabajo

- `backend/`, `frontend/` y `landing/` comparten una única versión en sus respectivos `package.json`, sincronizada con [`frontend/src/environments/environment.ts`](frontend/src/environments/environment.ts) y [`frontend/public/version.json`](frontend/public/version.json).
- Se sigue [Versionado Semántico](https://semver.org/lang/es/) y [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/).
- Para consultar cómo contribuir o reportar vulnerabilidades de seguridad, revisa [`CONTRIBUTING.md`](CONTRIBUTING.md) y [`SECURITY.md`](SECURITY.md).

---

## Licencia y Nube Oficial

**Iglesia 238** es software libre y de código abierto distribuido bajo la licencia **[GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE)**.

- **Nube Oficial Administrada (`https://app.iglesia238.com`):** operada por **[LopezSoft SAS](https://lopezsoft.net.co)** con infraestructura lista para usar, copias de seguridad automatizadas, envío de correos transaccionales y actualizaciones continuas.
- **Soporte Institucional, Implementación y Licenciamiento Comercial:** para convenios denominacionales, migración asistida de censos, capacitación a secretarios/tesoreros o licenciamiento comercial alternativo, contáctanos en `contact@lewislopez.io` o en [https://iglesia238.com](https://iglesia238.com).

Copyright © 2026 **LopezSoft SAS** (`lopezsoft.net.co`). Todos los derechos reservados.
