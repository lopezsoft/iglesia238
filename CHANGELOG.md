<!-- markdownlint-configure-file { "MD024": { "siblings_only": true } } -->

# Changelog

Todos los cambios relevantes del proyecto se registran en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [versionado semántico](https://semver.org/lang/es/). Backend y frontend comparten una única versión: ver «Versionado» en el [README](README.md).

## Sin publicar

## 0.23.0 - 2026-11-08

### Added

- **Acta de liquidación de diezmos en PDF (`GET /api/accounting/tithe-settlements/:id/report.pdf`):** el detalle de cada liquidación tiene el botón «Descargar acta (PDF)». Es el documento para firmar y archivar: membrete de la sede, número LD y periodo cubierto, el diezmo bruto y su reparto con los porcentajes copiados al emitirla (cuota nacional, fondo local, neto del pastor), cada diezmo incluido con su recibo, aportante, carné y forma de pago, el total, dónde quedó cada egreso de caja y las firmas de tesorería, pastor y fiscal. Una liquidación anulada también se imprime, marcada como anulada con quién, cuándo (hora de Bogotá) y por qué.
- **Directorio de miembros en PDF (`GET /api/members/report.pdf`):** la pantalla «Miembros» ofrece «Descargar PDF» junto al CSV, con los mismos filtros y los mismos permisos. Hoja horizontal con carné, nombre, documento, edad, teléfono, ingreso, cargos y estado; los miembros no activos salen en gris; el subtítulo dice qué filtros se aplicaron. Contiene datos personales: cada impresión queda en la auditoría (`MEMBERS_REPORT_PRINTED`, solo la cantidad de filas, nunca quiénes) y más de 5000 miembros se rechaza con un mensaje que indica filtrar o usar el CSV.
- **Informe de asistencia en PDF (`GET /api/attendance-sessions/report.pdf`):** la pantalla «Asistencia» ofrece «Descargar PDF» junto al CSV, con los mismos filtros. Una fila por reunión en orden cronológico con una columna por categoría, fila de totales, y arriba el número de reuniones, la asistencia total, el promedio y el día de mayor asistencia; cuando hay varios tipos de reunión añade el promedio de cada uno. Más de 3000 reuniones se rechaza: hay que acotar las fechas o usar el CSV.

### Changed

- **Membrete de informes a nivel de denominación:** los informes de una sesión que cubre todas las sedes (directorio y asistencia) salen con el nombre de la denominación y «Todas las sedes», sin razón social ni NIT, porque una denominación tiene varias entidades legales. Si se filtra por una sede sale su membrete completo.
- **Piezas compartidas de los informes (`common/reports`):** `ReportIssuer` (membrete, logo, color y fecha) y `report-format` (dinero, fechas, porcentajes y nombres de archivo). El libro de caja las usa también; su resultado no cambia. El porcentaje se escribe a mano («10 %») para que no dependa de los datos ICU del servidor.

## 0.22.0 - 2026-11-08

### Added

- **Libro de caja en PDF y CSV (`GET /api/accounting/cash-book/report.pdf` y `report.csv`):** la pantalla «Libro de caja» tiene los botones «Descargar PDF» y «Descargar CSV». El informe trae **todo el mes del fondo elegido** (no solo la página ni los filtros en pantalla): saldo inicial, cada línea con su saldo corrido, totales de entradas y salidas, saldo final y las firmas de tesorería, pastor y fiscal. Las líneas reversadas y sus reversas se conservan en gris y marcadas, porque el saldo ya las incluye. Usa las mismas cifras y el mismo permiso (`cash-transactions.write`) que la pantalla. El CSV sale en UTF-8 con BOM y punto y coma, con cifras sin separador de miles para poder sumarlas y con las celdas que una hoja de cálculo ejecutaría como fórmula neutralizadas. Un mes de más de 5000 líneas se rechaza con un mensaje claro en vez de generar un archivo inmanejable.
- **Motor de informes PDF (`common/reports`, `infrastructure/pdf/pdfkit-report.renderer.ts`):** un único generador de informes tabulares que cualquier módulo puede usar con solo describir columnas y filas. Pone el membrete de la sede (denominación, razón social y NIT), el logo y el color institucional de la denominación, una franja de cifras, la tabla con encabezado repetido y paginación automática, texto que se ajusta dentro de la celda, fila de totales, notas, el bloque de firmas siempre completo en una sola hoja, y el pie «Generado el … · Página i de n». Admite hoja vertical u horizontal.

### Changed

- **El logo y el color de la denominación se leen desde un servicio compartido (`common/branding`):** `DocumentBrandingService` y su lector salieron del módulo de certificados para que los informes y los certificados usen exactamente la misma identidad. No cambia nada para quien usa la aplicación; los certificados y carnés se imprimen igual que en la 0.21.0.

## 0.21.0 - 2026-11-08

### Added

- **Logo y color por denominación (`backend/src/modules/branding`, `frontend/.../organization/branding`):** el administrador de la denominación sube su logo y elige su color institucional en la pantalla «Identidad visual». El logo se envía en **base64** (PNG o JPEG, máximo 512 KB y entre 32 y 2000 px por lado), se valida por sus bytes y se guarda **fuera de la base de datos**: en el almacenamiento, con un nombre derivado del hash de su contenido; en la BD queda solo la clave (`denominations.logo_path`). El color se valida como `#RRGGBB` con contraste mínimo 4,5:1 sobre blanco.
- **Almacenamiento de archivos (`FILE_STORAGE`, `LocalFileStorage`):** puerto con adaptador a disco, configurable con `STORAGE_DRIVER=local` y `STORAGE_DIR` (por defecto `./storage`; en producción, `/app/backend/storage`). Las claves son rutas relativas en minúsculas que no pueden salirse de la carpeta; la escritura es atómica. Al arrancar, la API avisa en el log si la carpeta no es escribible. Cambiar a S3 será añadir un adaptador, sin tocar certificados ni pantallas. **En producción hay que montar un volumen persistente en esa carpeta** (Dokploy → Advanced → Volumes) e incluirlo en los respaldos; la guía de auto-alojamiento lo explica.
- **Endpoints `GET/PATCH /api/branding`, `PUT/DELETE /api/branding/logo` y `GET /api/public/branding/:denominationId/:fileName`:** el último sirve el logo con caché de un año (`immutable`), porque el nombre lleva el hash; sirve también los logos anteriores, que usan los certificados ya expedidos. Subir un logo queda limitado a 20 por hora y por IP, y cada cambio queda en la auditoría.
- **Permiso `branding.manage`** para el rol `DENOMINATION_ADMIN` (lo sincroniza el seed, sin migración de datos).
- **Los certificados y el carné se imprimen con el logo y el color:** el PDF y la vista en pantalla muestran el logo en el membrete y usan el color para el marco, el nombre y las tablas. El certificado guarda en su snapshot el logo y el color con los que se emitió, así que **cada reimpresión sale idéntica** aunque la denominación cambie su identidad después; los emitidos antes no cambian. El carné usa la identidad vigente. Si falta el archivo o el disco falla, el documento sale sin logo en vez de fallar.

### Fixed

- **Un PNG corrupto podía tumbar la API:** `png-js` (dentro de `pdfkit`) lanza el error desde un callback de zlib, fuera de cualquier `try/catch`, y el proceso terminaba. Antes de aceptar un logo se comprueba que `pdfkit` pueda incrustarlo **en un worker aislado**: si falla, solo muere el worker y el logo se rechaza.
- **Solape de la tabla de donaciones con las firmas en el peor caso** (nombre de denominación muy largo + logo + observaciones): el nombre se reduce para caber en 2 líneas cuando hay logo y las firmas del certificado de donaciones bajan 23 pt. El diseño de los demás certificados y de los que no llevan logo no cambia.

### Changed

- **Migración `20261108080000_denomination_branding`:** agrega `denominations.primary_color` (`VARCHAR(7)`, nula) y actualiza el comentario de `logo_path`, que dejó de estar reservado. Los certificados nuevos incluyen `branding` en el snapshot solo si la denominación eligió algo.

## 0.20.0 - 2026-11-08

### Added

- **Tesorería puede emitir el certificado de donaciones (`donation-certificates.issue`):** permiso propio, concedido al rol `TREASURER` por el seed (sin migración de datos). Con él se emite, consulta, imprime y anula el certificado de donaciones, y nada más: no concede `certificates.issue`, así que Tesorería sigue sin poder emitir los certificados de membresía, traslado, bautismo o asistencia ni los carnés.
- **El módulo se acota a `DON` para quien solo tiene ese permiso (`certificate-access.ts`):** el formulario y el catálogo ofrecen solo ese tipo; el listado, la exportación y los contadores incluyen solo esos certificados (y ningún dato de carnés); ver, imprimir o anular otro tipo responde como si no existiera; emitir u obtener la vista previa de otro tipo se rechaza como tipo inexistente.
- **Pantalla «Certificados de donaciones» para Tesorería (`certificates.page`):** sin pestaña ni cifras de carnés, con el formulario de emisión y el listado; el menú «Certificados y carnés» y la acción rápida «Emitir certificado» aparecen para el rol.

### Changed

- **`GET /api/certificates`, `/api/certificate-types` y el resto de endpoints de certificados aceptan cualquiera de los dos permisos** (`RequireAnyPermission`); `countIssued` admite filtrar por tipo.

## 0.19.0 - 2026-11-08

### Added

- **Certificado de donaciones (tipo `DON`) para la declaración de renta (`backend/src/modules/certificates`):** suma los aportes vigentes (no anulados) de un miembro en un año fiscal y los imprime por concepto, con total en cifras y en letras (`amountInWords`, español, pesos colombianos), el NIT de la razón social y el periodo. Como es un tipo de certificado más, hereda la numeración sin huecos, la anulación, el listado, el PDF y el QR de verificación.
- **Alcance de los datos:** solo cuentan los aportes de las sedes que comparten la razón social de la sede que expide, que es quien figura con su NIT en el membrete. En el año en curso se suma hasta hoy; un año sin aportes no se puede emitir y no gasta un número.
- **Permisos:** emitirlo exige `certificates.issue` y además `contributions.read` (hoy el pastor), porque muestra montos; se comprueba antes de leer nada del miembro. La segunda firma es para tesorería y se firma a mano: no se imprime el nombre de la secretaria.
- **PDF con tabla de aportes (`pdfkit-document.renderer.ts`):** disposición compacta; con más de 6 conceptos los últimos se agrupan en «Otros conceptos» sin perder ningún valor. Verificado que el contenido termina antes de las firmas.
- **Selector «Año de los aportes» al emitir (`certificate-issue.component`)** y tabla de aportes en la vista previa y en el documento.
- **Marcadores nuevos para las plantillas:** `{{fiscalYear}}`, `{{periodFrom}}`, `{{periodTo}}`, `{{totalAmount}}` y `{{totalInWords}}` (vacíos en los demás tipos).

### Changed

- **Migración `20261108070000_donations_certificate_type`:** agrega el tipo `DON` a las denominaciones que ya existen (las nuevas lo reciben con la plantilla de denominación) y actualiza el comentario de `template`. Es idempotente.

## 0.18.1 - 2026-11-08

### Fixed

- **Despliegue de 0.18.0 bloqueado por el CI (`frontend/.../certificate-templates.page.ts`):** los botones de marcadores usaban el atributo nativo `title`, que el paso «Verify no native HTML title attributes» prohíbe. Ahora usan `appCustomTooltip`. 0.18.0 nunca llegó a producción: este es el primer despliegue con las plantillas de certificados y su migración.

## 0.18.0 - 2026-11-08

### Added

- **Plantillas de certificados editables por denominación (`backend/src/modules/certificates`, `frontend/.../secretariat/certificate-templates`):** el administrador de la denominación puede editar el nombre, la vigencia y los textos que imprime cada tipo de certificado: encabezado, cuerpo, cierre y títulos bajo la firma del pastor y de la secretaría. Antes solo existía el cuerpo y no había forma de editarlo desde la aplicación.
- **Endpoints `GET /api/certificate-types/templates`, `PATCH /api/certificate-types/:id` y `POST /api/certificate-types/:id/preview`:** el último devuelve una vista previa con datos ficticios, sin guardar nada. Cada cambio queda en la auditoría.
- **Marcadores nuevos** `{{denomination}}`, `{{city}}`, `{{issuedOn}}`, `{{pastorName}}` y `{{secretaryName}}`, además de los existentes. Se rechaza un marcador que no exista o una llave sin cerrar, en vez de imprimirlo vacío.
- **Permiso `certificate-types.manage`** para el rol `DENOMINATION_ADMIN`; el seed lo sincroniza en cada despliegue, sin migración de datos.

### Changed

- **Migración `20261108060000_certificate_type_full_templates`:** añade `intro_template`, `closing_template`, `pastor_title_template` y `secretary_title_template` (todas nulas) a `certificate_types`. Un texto en blanco vuelve al texto por defecto, así que nada cambia hasta que se personalice.
- **Los certificados ya expedidos no cambian:** cada uno conserva el texto con el que se imprimió (su snapshot).

## 0.17.0 - 2026-11-08

### Added

- **Código QR de verificación pública en los certificados (`backend/src/modules/certificates`):** el PDF de cada certificado imprime un QR vectorial con un enlace firmado (HMAC-SHA256) a `/verify-certificate?t=<id>.<firma>`. El token no contiene datos personales y no se puede falsificar ni adivinar a partir del consecutivo. Los PDF ya expedidos también lo llevan al reimprimirse.
- **Endpoint público `GET /api/public/certificates/verify` (`PublicCertificatesController`):** responde si el documento está vigente, vencido o anulado, con lo que el documento ya imprime y el titular enmascarado («Ana M. R. D.»). Un token inválido y un documento inexistente responden igual (404). Limitado a 30 consultas por minuto y por IP.
- **Página pública `/verify-certificate` (`frontend/src/app/features/public/verify-certificate`):** la que abre el QR; no requiere cuenta.
- **Variable opcional `CERTIFICATE_VERIFICATION_SECRET` (`backend/.env.example`):** clave de firma de los enlaces; si no se define se deriva de `JWT_SECRET`.

### Changed

- **Dependencia `qrcode` (+ `@types/qrcode`) en el backend:** para generar la matriz del QR; el dibujo es vectorial en `pdfkit`, sin imágenes incrustadas.

## 0.16.4 - 2026-11-08

### Fixed

- **Ancla `/#open-source` de la sección Open Source (`landing/src/components/OpenSourceDeployment.astro`):** la URL anunciada no existía (el `id` real es `despliegue`). Se añade un alias para que ambas anclas lleven a la misma sección.

## 0.16.3 - 2026-11-08

### Changed

- **Títulos SEO acortados a ≤60 caracteres (`landing/src/pages/*`, `BaseLayout.astro`):** home, `/how-it-works/`, `/security/` y `/docs/self-hosting/`; la home incorpora «Software para Iglesias» en el `<title>`.
- **Caché de assets y HSTS en `docker/nginx/dokploy.conf`:** `/_astro/` se sirve con `Cache-Control: public, max-age=31536000, immutable` y el sitio principal envía `Strict-Transport-Security: max-age=31536000` (sin `includeSubDomains`).

## 0.16.2 - 2026-11-08

### Changed

- **URLs de la landing con slugs en inglés (`landing/src/pages/*`):** `/soluciones` → `/solutions`, `/como-funciona` → `/how-it-works`, `/seguridad` → `/security`, `/docs/manual-roles` → `/docs/roles-manual` y `/docs/auto-alojamiento` → `/docs/self-hosting`. Se actualizan enlaces internos, breadcrumbs, canonicals y `sitemap.xml`.

### Added

- **Redirects `301` desde las URLs antiguas (`docker/nginx/dokploy.conf`):** las rutas en español redirigen a su equivalente en inglés para conservar el posicionamiento ya solicitado en Google Search Console.

## 0.16.1 - 2026-11-08

### Added

- **Verificación de propiedad en Google Search Console (`landing/public/googleef5fcd30aae71046.html`):** archivo de verificación HTML servido en la raíz de `iglesia238.com` para poder indexar el sitio.
- **Página 404 real para la landing (`landing/src/pages/404.astro`):** con `noindex` mediante la nueva prop `noindex` de `BaseLayout.astro`.

### Fixed

- **Soft-404 y contenido duplicado en `iglesia238.com` (`docker/nginx/dokploy.conf`):** las rutas inexistentes respondían `200` con la home por el fallback de SPA (`try_files … /index.html`); ahora responden `404`. `www.iglesia238.com` redirige con `301` al dominio sin `www` y los redirects de directorio son relativos (`absolute_redirect off`) para no saltar a `http`.
- **Pantalla de login de la app indexable (`frontend/src/index.html`):** se añade `<meta name="robots" content="noindex, nofollow">`.

## 0.16.0 - 2026-11-08

### Added

- **Sección Open Source (`GNU AGPLv3`), Auto-Alojamiento y Soporte Institucional en `iglesia238.com` (`landing/src/components/OpenSourceDeployment.astro`):** incorporación de las tres modalidades oficiales de despliegue (Nube Oficial Lista para Usar, Edición Open Source Auto-Alojada con Docker/Dokploy bajo licencia `GNU AGPLv3` y Soporte Institucional / Implementación Gestionada por **LopezSoft SAS**), junto con acceso directo al repositorio en GitHub desde `Navbar.astro` y `Footer.astro`.
- **Centro de Documentación y Manuales estilo Docusaurus en `/docs` (`landing/src/layouts/DocsLayout.astro` y `landing/src/pages/docs/*`):** arquitectura de documentación de tres columnas (barra lateral de capítulos sticky, contenido técnico con callouts/pasos/tablas/bloques de código y tabla de contenidos lateral `En esta página`), incluyendo:
  - [`/docs`](landing/src/pages/docs/index.astro): Guía de Implementación en 5 Pasos (desde el registro de sede hasta el cierre contable mensual).
  - [`/docs/manual-roles`](landing/src/pages/docs/manual-roles.astro): Manual Operativo por Rol (Pastor, Secretaría y Tesorería) y matriz de aislamiento RBAC (`X-Scope`).
  - [`/docs/auto-alojamiento`](landing/src/pages/docs/auto-alojamiento.astro): Guía Técnica de Auto-Alojamiento con Docker Multi-Stage, Dokploy, variables `.env` y configuración de correo transaccional con AWS SES (`us-west-2`, puerto `465`).

## 0.15.2 - 2026-11-07

### Added

- **Licenciamiento Open Source `GNU AGPLv3` y gobernanza pública (`LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `README.md`):** incorporación del texto oficial de la licencia `GNU Affero General Public License v3.0 (AGPL-3.0-or-later)` con titularidad de **LopezSoft SAS**, política de divulgación responsable de vulnerabilidades (`SECURITY.md`), guía de contribución (`CONTRIBUTING.md`) y presentación pública del monorepo en `README.md`.

## 0.15.1 - 2026-11-07

### Fixed

- **Payload del webhook de despliegue en `.github/workflows/ci-cd.yml`:** envío explícito de cabeceras `Content-Type: application/json`, `X-GitHub-Event: push` y cuerpo `{"ref":"refs/heads/main"}` al invocar `DOKPLOY_WEBHOOK_URL` para que el endpoint de Custom Git en Dokploy valide la rama `main` y ejecute el despliegue automáticamente en cada `push`.

## 0.15.0 - 2026-11-07

### Added

- **Auto-actualización del frontend al detectar nueva versión (`VersionUpdateService` y `/version.json`):** generación automática de `frontend/public/version.json` sincronizada con `package.json` y `environment.ts` (`frontend/scripts/write-version-manifest.mjs`), verificación periódica cada 60s, al recuperar el foco de la pestaña (`visibilitychange`/`focus`) y en navegación de rutas (`NavigationEnd`), recuperación automática ante errores de chunks diferidos (`ChunkLoadError` / `Failed to fetch dynamically imported module`) en `GlobalErrorHandler` y `withNavigationErrorHandler`, y cabeceras `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` en Nginx (`docker/nginx/dokploy.conf` y `frontend/nginx.conf`).

## 0.14.0 - 2026-11-07

### Added

- **Plantillas HTML personalizadas de correos transaccionales (`backend/src/common/mail/email-template.ts`):** diseño institucional responsivo para Nodemailer / AWS SES con cabecera corporativa de **Iglesia 238**, etiquetas de estado (`Invitación de acceso`, `Verificación de correo`, `Recuperación de acceso`, `Aviso de seguridad`), botón CTA destacado, bloque alternativo de copia de enlace, nota de seguridad, pie institucional y escape estricto anti-XSS en los 5 correos de la plataforma (`INVITATION`, `EMAIL_VERIFICATION`, `PASSWORD_RESET`, `REGISTRATION_NOTICE`, `RECOVERY_NOTICE`).

## 0.13.7 - 2026-11-07

### Added

- **Disparo manual `workflow_dispatch` en `.github/workflows/ci-cd.yml`:** soporte para ejecutar el pipeline completo de CI/CD y el webhook de despliegue hacia Dokploy tanto en cada `push` como manualmente desde la pestaña *Actions* de GitHub.

## 0.13.6 - 2026-11-07

### Fixed

- **Normalización automática de `DATABASE_URL` en `docker/entrypoint.prod.sh`:** conversión transparente del esquema `mariadb://` (generado por la interfaz de Dokploy) a `mysql://` antes de ejecutar Prisma y la validación de entorno de NestJS.

## 0.13.5 - 2026-11-07

### Fixed

- **CSP del bloque `iglesia238.com` en `docker/nginx/dokploy.conf`:** habilitación de `script-src 'self' 'unsafe-inline'` y preservación de cabeceras de seguridad en `location /` del sitio estático en Astro para permitir la ejecución de los scripts ligeros de cambio de tema, palabras rotativas del Hero y pestañas interactivas en producción.

## 0.13.4 - 2026-11-06

### Fixed

- **Versión de Node.js en GitHub Actions (`.github/workflows/ci-cd.yml`):** actualización de `node-version` de `"22.22.3"` a `">=22.23.4"` en los jobs `ci-backend` y `ci-frontend` para cumplir el requerimiento de motor de `astro@7.4.7` (`node >= 22.23.4`).

## 0.13.3 - 2026-11-06

### Fixed

- **Espaciado y alineación en una sola línea del Navbar (`landing/src/components/Navbar.astro`):** contenedor ampliado a `1320px`, `white-space: nowrap` y `flex-shrink: 0` en marca (`IGLESIA 238`), píldora (`Formato F-701`), enlaces de navegación (`Soluciones`, `Cómo funciona`, `Seguridad`, `Preguntas`) y acciones (`Iniciar sesión`, `Registrar mi sede`), eliminando el salto de línea apilado y el enlace redundante «Características».

## 0.13.2 - 2026-11-06

### Fixed

- **Fidelidad de dominio en `landing/` (`iglesia238.com`):** eliminación de menciones inexistentes en el producto («Asistente con IA», cifras inventadas y conmutador de idioma decorativo) en [`Navbar.astro`](landing/src/components/Navbar.astro), [`Hero.astro`](landing/src/components/Hero.astro) y [`AppMockup.astro`](landing/src/components/AppMockup.astro), reemplazándolas exclusivamente por funcionalidades y datos reales del proyecto (**Formato F-701**, **Certificados y Carnés PDF**, **18 países hispanohablantes / 9.229 municipios**, **Multi-denominación, distritos y sedes** y menú lateral alineado con `NAV_GROUPS`).

## 0.13.1 - 2026-11-06

### Added

- **SEO Técnico, Semántico y GEO (AI Search) en `landing/` (`iglesia238.com`):**
  - Datos estructurados **JSON-LD (`Schema.org`)** en [`BaseLayout.astro`](landing/src/layouts/BaseLayout.astro) con grafo `@graph`: `Organization`, `WebSite`, `SoftwareApplication`, `BreadcrumbList` dinámico por ruta y `FAQPage` para Rich Snippets en Google.
  - Generador estático de [`/sitemap.xml`](landing/src/pages/sitemap.xml.ts) con prioridades y etiquetas `xhtml:link hreflang` (`es-CO`, `es-419`, `x-default`).
  - [`robots.txt`](landing/public/robots.txt) y [`llms.txt`](landing/public/llms.txt) (contexto estructurado para motores de búsqueda con IA).
  - URLs canónicas dinámicas, etiquetas Open Graph completas (`og:image` `1024x512`), Twitter/X Cards (`summary_large_image`), `apple-touch-icon.png` y `favicon.ico`.

## 0.13.0 - 2026-11-06

### Added

- Sitio web multipágina construido con **Astro 5** (`landing/`) para **`iglesia238.com`**:
  - **Arquitectura Astro (`landing/src/`):** layout global (`BaseLayout.astro`), navegación con mega-menú desplegable (`Navbar.astro`), Hero con titular rotativo y réplica detallada de la interfaz de `app.iglesia238.com` con barra lateral, 8 KPIs, dos gráficos y 4 tarjetas flotantes animadas (`Hero.astro` + `AppMockup.astro`), pestañas interactivas de módulos (`InteractiveSuites.astro`), Bento Grid de roles (`SolutionsBento.astro`), pasos de puesta en marcha (`HowItWorks.astro`), bloque de seguridad y cumplimiento Ley 1581 de 2012 (`SecurityCompliance.astro`), acordeón FAQ (`FaqSection.astro`) y páginas dedicadas (`/`, `/soluciones`, `/como-funciona`, `/seguridad`).
  - **Integración en Docker y CI/CD:** etapa `landing-builder` en el `Dockerfile` raíz y paso de compilación de Astro en `.github/workflows/ci-cd.yml`.

## 0.12.0 - 2026-11-06

### Added

- Sitio web principal (`landing/` para **`iglesia238.com`** y **`www.iglesia238.com`**) y configuración Multi-Host en el contenedor unificado de producción (`Dockerfile` y `docker/nginx/dokploy.conf`):
  - **`iglesia238.com` / `www.iglesia238.com`:** Landing page institucional de **Iglesia 238** con barra de navegación fija, selector de tema claro/oscuro, cambio de idioma `ES | EN`, hero de dos columnas con vista previa interactiva de `app.iglesia238.com` y tarjetas flotantes de métricas, soluciones por rol, módulos integrados, pasos de puesta en marcha, seguridad/Habeas Data (Ley 1581 de 2012), preguntas frecuentes y llamadas a la acción hacia `https://app.iglesia238.com/register-congregation`, `/apply`, `/apply/status` y `/login`.
  - **`app.iglesia238.com`:** sirve la aplicación web Angular y mantiene el proxy interno `/api/` hacia `127.0.0.1:3000` (garantizando cookies `HttpOnly; SameSite=Strict` en el mismo origen).
  - **`api.iglesia238.com`:** bloque de servidor dedicado que enruta peticiones directamente hacia la API NestJS/Fastify en `127.0.0.1:3000`.

## 0.11.1 - 2026-11-06

### Fixed

- `FakeFamilyRepository.updateType` en `in-memory-membership.ts`: reemplazo inmutable de la fila familiar para satisfacer `readonly type` en `npm run typecheck` (`tsc --noEmit`) dentro del workflow de CI.

## 0.11.0 - 2026-11-06

### Added

- Pipeline de **CI/CD en GitHub Actions** (`.github/workflows/ci-cd.yml`) para **Dokploy (`matiasimpulso.com`)**:
  - **Job `ci-backend`:** validación de diccionario de datos (`npm run db:comments:check`), generación de Prisma Client, chequeo de tipos (`npm run typecheck`), compilación (`npm run build`) y ejecución de pruebas unitarias y de aislamiento multi-tenant (`npm run test`).
  - **Job `ci-frontend`:** verificación de prohibición de atributo `title` nativo (`node scripts/check-native-title.js`), compilación Angular en producción (`npm run build -- --configuration=production`) y pruebas unitarias (`npx ng test --watch=false`).
  - **Job `deploy-dokploy`:** disparo condicionado a la aprobación de ambos *quality gates* mediante el secret `DOKPLOY_WEBHOOK_URL`.

## 0.10.0 - 2026-11-06

### Added

- Imagen de Docker unificada para despliegue en **Dokploy** (`matiasimpulso.com`):
  - `Dockerfile` multi-stage en la raíz que compila el Frontend (Angular 22) y el Backend (NestJS 12 + Prisma 7) y los ejecuta en un único contenedor (`nginx` en `:80` + `node dist/main.js` en `127.0.0.1:3000`).
  - `docker/entrypoint.prod.sh`: aplica automáticamente migraciones (`npx prisma migrate deploy`), sincroniza catálogos globales (`npx prisma db seed`), crea opcionalmente el primer administrador de plataforma si se definen `PLATFORM_ADMIN_EMAIL` y `PLATFORM_ADMIN_PASSWORD`, y supervisa los procesos de Nginx y NestJS.
  - `docker/nginx/dokploy.conf` y `frontend/nginx.conf`: restauración de la IP real del visitante (`set_real_ip_from` / `real_ip_header X-Forwarded-For`) detrás del proxy Traefik de Dokploy y reenvío de `X-Forwarded-Proto`.

## 0.9.2 - 2026-11-06

### Fixed

- Despliegue en producción (`docker-compose.prod.yml`, `.env.example` y `backend/.env.example`): el servicio `backend` ahora recibe `JWT_SECRET`, `JWT_EXPIRATION`, `REFRESH_TTL`, `REFRESH_MAX_LIFETIME`, `APP_BASE_URL`, `DEFAULT_COUNTRY_ISO`, `TRUST_PROXY=1` (detrás del Nginx del contenedor `frontend`) y las variables `SMTP_*`.

## 0.9.1 - 2026-11-06

### Security

- Endurecimiento de aislamiento multi-tenant e higiene de datos personales (PII):
  - `PrismaFamilyRepository.updateRelativePerson`: restricción por sede (`congregationId`) al actualizar el registro `Person` de un familiar, impidiendo que un usuario con alcance de sede modifique los datos personales de un miembro perteneciente a otra congregación de la misma denominación.
  - `AddFamilyRelationUseCase` y `UpdateFamilyRelationUseCase`: validación de fecha de nacimiento (`assertPastOrToday`) para rechazar fechas futuras en familiares y verificación de conflicto de padre/madre inverso (`PARENT_ALREADY_SET`) al cambiar el tipo de parentesco.
  - `sensitive-data-redactor`: redacción automática en logs y auditoría de los nuevos campos sensibles/PII (`fatherFullName`, `motherFullName`, `childrenNames`, `tribunalOpinion`).
  - `PrismaPersonRepository.syncMarriage` y `SubmitApplicationDto`: alcance explícito por `denominationId` al actualizar matrimonios y límite `@Max(30)` en `childrenCount`.

## 0.9.0 - 2026-11-06

### Added

- Flujo completo de visualización y edición en la ficha del miembro (`/members/:id`):
  - **Datos personales y matrimoniales:** resolución automática de nombres de municipios (`municipalityCode`, `documentIssuePlaceCode`, `birthPlaceCode`, `baptismMunicipalityCode`) en `PersonalDataTabComponent`, selectores en cascada `Departamento` → `Municipio` (`[selectByRegion]="true"`) en `PersonFieldsComponent` y `MembershipEditDialogComponent`, y edición/sincronización de cónyuge y tipo de matrimonio (`spouseFullName`, `marriageIsCivil`, `marriageIsChristian`, `marriageIsCatholic`, `tribunalOpinion`) contra la tabla `marriages`.
  - **Familiares (`FamilyTabComponent` y `PATCH /api/members/:id/family/:relationId`):** tarjeta de resumen matrimonial en la pestaña Familia, registro directo de familiares nuevos (sin requerir que existan previamente como miembros) y edición de familiares existentes (`type`, `firstName`, `lastName`, `secondLastName`, `sex`, `birthDate`).
  - **Estudios (`StudiesTabComponent` y `PATCH /api/members/:id/studies/:studyId`):** edición de estudios registrados del miembro.

## 0.8.0 - 2026-11-06

### Added

- Identidad visual de Iglesia 238: componente `<app-brand-mark>` (`BrandMarkComponent`) con variantes `sede` y `simple`, integrado en el panel de autenticación (`AuthBrandPanelComponent`), la barra lateral del shell (`ShellComponent`) y la cabecera pública (`PublicLayoutComponent`).
- Recursos de marca e íconos de aplicación: `favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, íconos PWA (`192x192` y `512x512`), `manifest.webmanifest`, tokens de degradado de marca (`--brand-mark-from` / `--brand-mark-to`) y catálogo visual en `frontend/public/brand/`.

## 0.7.1 - 2026-11-06

### Fixed

- Los campos de municipio en el formulario público de solicitud (`/apply`: expedición, nacimiento, residencia y bautismo), en el registro público de sedes (`/register-congregation`) y en los modales de sedes y razones sociales (`/organization` y `/denominations`) ahora muestran un `<select>` desplegable con todos los municipios del departamento o estado seleccionado (`REGION_MUNICIPALITY_LIMIT = 1000` en `GET /api/public/geo/municipalities` y `GET /api/geo/municipalities`), eliminando la caja de búsqueda de texto y el autocompletado de direcciones del navegador.

## 0.7.0 - 2026-11-06

### Added

- Normalización 3FN/FNBC del esquema de membresía (`20261106044100_normalize_member_baptism_and_origin`) proyectado para escala nacional (5.400 sedes): llave foránea `baptism_municipality_id` hacia `municipalities` y `previous_congregation_id` hacia `congregations` en la tabla `members`, junto con diccionario de datos actualizado (`docs/2026-11-05-2342-modelo-de-datos.md`).
- Cobertura completa del formato oficial `Datos de membresía (F-701)` en el formulario público de solicitud (`/apply`), organizado en tres secciones en grilla *mobile-first* de dos columnas (`.form-grid`) con filtro por departamento/estado:
  - Identificación, lugar de expedición, nacimiento, contacto (`MOBILE`, `LANDLINE`, `EMAIL`, `WORK_PHONE`), nivel educativo, profesión, ocupación y lugar de trabajo.
  - Estado civil, tipo de matrimonio (civil, cristiano, católico), cónyuge, concepto del Tribunal Eclesiástico, padres y lista dinámica de hijos.
  - Datos eclesiásticos y ministeriales: conversión, bautismo en agua (fecha, municipio, congregación y pastor que bautizó), bautismo del Espíritu Santo, reconciliación, iglesia de procedencia, cargos actuales/anteriores, áreas de servicio y maestro de Educación Cristiana.
- Proyección transaccional al aprobar una solicitud (`ApproveApplicationUseCase` y `PrismaMembershipRegistry`) hacia las tablas normalizadas `persons`, `person_contacts`, `person_addresses`, `neighborhoods`, `family_relations`, `marriages`, `members`, `church_positions` y `member_positions`.
- Visualización y edición de los nuevos campos personales, familiares y eclesiásticos en la revisión de solicitudes (`/applications`) y en la ficha del miembro (`/members/:id`).

## 0.6.1 - 2026-11-05

### Added

- Selector en cascada `Departamento / estado *` → `Municipio *` en el registro público de sedes (`/register-congregation`), filtrando los municipios por el departamento o estado seleccionado del país de la razón social y organizando el paso «Tu sede» en grilla adaptable de dos columnas (`.form-grid`).

### Fixed

- Se corrigió el error `500 INTERNAL_SERVER_ERROR` (`PrismaClientValidationError`) al crear o actualizar razones sociales (`POST/PATCH /api/platform/legal-entities` y `POST/PATCH /api/organization/legal-entities`) y sedes (`POST/PATCH /api/organization/congregations`), omitiendo los campos transitorios `municipalityCode` y `neighborhood` antes de persistir en `legal_entities` y `congregations` con Prisma.

## 0.6.0 - 2026-11-05

### Added

- Directiva propia de tooltips `[appCustomTooltip]` (`CustomTooltipDirective`) en el frontend, accesible por teclado (`focus`/`blur`, `Escape`) y con posicionamiento inteligente sobre el viewport, además del script de validación `node scripts/check-native-title.js` (`npm run lint:tooltips`).
- Catálogo de departamentos y estados por país en la API (`GET /api/geo/regions?countryId=` y `GET /api/public/geo/regions?countryId=`) y filtro `regionCode` en `GET /api/geo/municipalities` y `GET /api/public/geo/municipalities`.
- Selector en cascada `País *` → `Departamento / estado *` → `Municipio *` en los formularios de razones sociales (`/organization?tab=razones` y `/denominations?tab=razones`) y de sedes (`/organization?tab=sedes`), incluyendo `regionCode` en las vistas de organización y plataforma.
- Foco automático (`autofocus`) en el primer campo editable al abrir cualquier diálogo modal (`DialogComponent`) y formularios de entidad legal y sede.

### Changed

- Rediseño *mobile-first* de todos los formularios (`.form-grid`) y modales (`.dialog`): 1 columna en móvil (`< 640px`) y máximo 2 columnas (`repeat(2, minmax(0, 1fr))`) desde `640px`, reduciendo el ancho de los diálogos amplios de `56rem` a `40rem` para evitar dispersión visual.
- El servidor de desarrollo del frontend corre ahora en el puerto `4700` y abre automáticamente el navegador al iniciar (`ng serve`).
- El pie de página (`<app-footer>` y layout público) permanece fijo en la parte inferior de la ventana (`position: sticky; bottom: 0`) igual que la barra superior, y actualiza la atribución de derechos a `© lopezsoft.net.co · Todos los derechos reservados`.
- Se reemplazaron todos los atributos HTML nativos `title` en 18 componentes del frontend por `[appCustomTooltip]`.

## 0.5.0 - 2026-11-03

### Added

- Registro público de sedes (`/register-congregation`): asistente de tres pasos (iglesia, sede y usuario) que crea la sede activa y el usuario responsable con los roles de Pastor, Secretario y Tesorero. Sin razones sociales cargadas, la página lo explica en lugar de mostrar el formulario.
- Confirmación de correo: el usuario nuevo puede entrar, pero la API responde `403 EMAIL_NOT_VERIFIED` y la app solo muestra «Confirma tu correo» hasta que confirma (`/login/verify-email`, reenvío y enlace de desarrollo sin SMTP).
- Razones sociales administradas por la plataforma (`/api/platform/legal-entities`), con país obligatorio; pestañas «Razones sociales» y «Países» en Denominaciones.
- País en la razón social (`legal_entities.country_id`) y municipio obligatorio en la sede, que debe ser del país de su razón social (`MUNICIPALITY_COUNTRY_MISMATCH`).
- Países activos (`countries.is_active`): los 18 hispanohablantes de Latinoamérica quedan activos; `GET /api/geo/countries` y `GET/PATCH /api/platform/countries`. La búsqueda de municipios acepta `countryId`.
- Divisiones administrativas de 17 países más (AR, BO, CL, CR, CU, DO, EC, GT, HN, MX, NI, PA, PE, PY, SV, UY, VE): 363 regiones y 9229 municipios en total, tomados de fuentes oficiales y verificados; procedencia y advertencias en `backend/prisma/seed-data/divisions/SOURCES.md`.
- Diccionario de datos: comentario en español en cada tabla y columna, guardado en MariaDB (`COMMENT`). Comandos `db:comments:check`, `db:comments:inject` y `db:dictionary`, y modelado en `docs/2026-11-02-2339-modelo-de-datos.md`.
- Animaciones en el panel de marca del login (respetan «reducir movimiento»).
- Descarga en PDF de recibos y comprobantes (`GET /api/accounting/vouchers/:id/pdf`), con botón en Aportes, en el aviso de registro y en Comprobantes. El aporte ahora trae `voucherId`.
- El reporte financiero informa los aportes registrados que el libro de caja aún no consolida (`pendingConsolidation`) y la pantalla lo avisa.
- Comando `npm run admin:reset-password` para el administrador de plataforma que olvidó su contraseña sin SMTP.
- Variable `REFRESH_MAX_LIFETIME` (duración absoluta de la sesión, 30 días) y `TRUST_PROXY` como número de saltos o lista de proxies.
- Aviso en Sedes cuando la denominación no tiene política de datos publicada, y recarga de la sesión tras cambiar roles o sedes.

### Changed

- Las migraciones se unificaron en una sola, `20261103000000_init`, con las 24 reglas `CHECK` y los comentarios; la base de desarrollo se reconstruye desde cero.
- Espaciado más compacto en tarjetas, formularios, diálogos y cabeceras de página.
- El seed carga un archivo de divisiones por país (`seed-data/divisions/<ISO>.json`); `DEFAULT_COUNTRY_ISO` (por defecto `CO`) resuelve los códigos de municipio que llegan sin país.
- Nadie puede otorgarse roles a sí mismo (`409 SELF_GRANT`). Invitar un correo que ya tiene cuenta responde `409 DUPLICATE_EMAIL` y no vincula la cuenta; invitar tiene límite por IP.
- El enlace de recuperación de otra cuenta se niega si la cuenta tuvo roles fuera de la denominación o es de otro administrador, y avisa a la persona por correo sin enlace.
- Cerrar sesión, cambiar la contraseña o detectar un refresh token robado invalida también el access token (`JwtAuthGuard` comprueba la sesión). El access token dura 30 minutos como máximo.
- Los roles de una sede desactivada o borrada dejan de servir en la API, no solo en el menú.
- Una cuenta bloqueada por intentos responde `401 INVALID_CREDENTIALS` como cualquier credencial incorrecta (ya no `423`).
- La invitación se valida con `POST /api/auth/invitations/lookup` (token en el cuerpo) y las páginas de enlace quitan el token de la URL.
- La cookie del refresh token lleva `Secure` también en cualquier entorno con `APP_BASE_URL` https; la sesión tiene duración absoluta.
- Los errores de descargas (PDF, CSV) conservan el código y el mensaje de la API; las fechas «de hoy» del frontend usan la hora de Bogotá; los textos de solo lectura hablan de lo que no se puede hacer, no de códigos de permiso.
- Se quitó del texto inicial de la política de datos la frase de borrador, y el Nginx del frontend reemplaza `X-Forwarded-For`.

### Fixed

- Páginas de caja, configuración contable, certificados y solicitud pública ya no quedan en blanco cuando una consulta falla: muestran el aviso con «Reintentar».
- El nombre del archivo CSV de asistencia ya no admite texto libre del filtro; el widget de auditoría del tablero oculta los nombres del equipo de plataforma a las denominaciones.
- El límite del número de documento del formulario de miembros coincide con el de la API (30).

## 0.4.0 - 2026-11-02

### Added

- **Acceso real:** inicio de sesión con correo y contraseña, token de acceso solo en memoria, refresh token en cookie `HttpOnly` con rotación y detección de reutilización, bloqueo tras 5 intentos fallidos, recuperación de contraseña, invitaciones de un solo uso y cambio de contraseña. Las contraseñas se guardan con `scrypt`.
- **Alcance y permisos por petición:** cabecera `X-Scope` (`P`, `D:<id>` o `C:<id>`) validada contra los roles vigentes; los permisos se calculan en cada petición y la sesión los devuelve desde la base de datos.
- **API de todos los módulos del MVP:** denominaciones (con aprovisionamiento transaccional), sedes, razones sociales, distritos, usuarios y roles, auditoría, catálogos y municipios, inscripción pública, solicitudes y políticas de datos, miembros (alta manual, estado, traslados, familia, estudios, cargos, ficha socioeconómica, consentimientos y anonimización), certificados y carnés con PDF, asistencia, registros de secretaría, configuración contable, libro de caja, aportes, votos, liquidación del diezmo, presupuesto, reportes y dashboard.
- Tablero de inicio compuesto por proveedores de widgets de cada área (miembros, solicitudes, certificados, asistencia, sedes, ingresos, saldos y diezmo).
- Migración `20261102150000_api_support_fields`: código de sede, estado de la política, datos del carné, emisor y motivo de anulación del certificado, lugar y oficiante del matrimonio, institución y año de estudios, autor de la asistencia e índice de caja. **Hay que aplicarla** con `npm run prisma:migrate:deploy` y luego `npm run prisma:seed`.
- Comando `npm run admin:create` para el primer administrador de plataforma, y variables `JWT_SECRET`, `JWT_EXPIRATION`, `REFRESH_TTL`, `APP_BASE_URL` y `SMTP_*` (ver backend/README.md).
- Diseño del frontend renovado: barra lateral de iconos, barra superior, tarjeta principal, indicadores, paneles por sección y pestañas, e ingreso en dos paneles.

### Changed

- El frontend ya no tiene modo demostración: todas las pantallas usan el adaptador HTTP de su módulo, con listas paginadas en el servidor donde crecen. Un interceptor convierte los errores de la API en mensajes en español.
- Los porcentajes del diezmo nunca tienen valores por defecto: se ingresan por denominación en Contabilidad > Configuración. El primer periodo contable de una sede se crea desde la misma pantalla.
- Un único buscador de personas (`SearchPeopleUseCase`) atiende certificados, aportes, secretaría y familia, con el documento siempre enmascarado en el servidor.
- Numeración de documentos con un único servicio (`MEMBER`, `VOUCHER:<TIPO>`, `CERT:<CÓDIGO>`), sin reinicio anual.
- El build de la API excluye los auxiliares de prueba `src/**/testing`.

### Removed

- Adaptadores y datos de demostración del frontend (`core/demo`, almacenes en memoria, la contraseña común de demostración y el aviso «Modo demostración»).
- Las rutas duplicadas `GET /api/members/lookup` y `GET /api/members/lookup/:memberId`, y las constantes de catálogos del frontend (ahora vienen de `GET /api/catalogs`).
- Las promesas de adjuntos y de logotipo en las pantallas: no hay almacenamiento de archivos.

## 0.3.0 - 2026-11-02

### Added

- Prototipo funcional del frontend (`Iglesia 238 — App por roles`): 21 pantallas con la navegación de cada rol y el mapa de acceso por permiso.
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
