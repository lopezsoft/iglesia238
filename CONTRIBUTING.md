# Guía de Contribución (Contributing)

¡Gracias por tu interés en contribuir a **Iglesia 238**! Este documento resume las convenciones técnicas y de arquitectura que mantienen el proyecto limpio, seguro y mantenible.

## 1. Principios de arquitectura y código

- **Idioma del código:** todo identificador técnico (variables, funciones, clases, interfaces, propiedades, rutas de código y claves de API) se escribe en **inglés**. Los comentarios explicativos y todos los textos visibles para el usuario final van en **español**.
- **Arquitectura Limpia (Puertos y Adaptadores):**
  - En `backend/`, los casos de uso (`application/`) dependen únicamente de puertos (`*.port.ts` / `*.ports.ts`) y nunca importan detalles de Prisma, Fastify o Nodemailer directamente.
  - En `frontend/`, cada módulo de negocio (`features/<módulo>/`) define su repositorio abstracto (`data/*.repository.ts`) y su adaptador HTTP (`data/http-*.repository.ts`).
- **Seguridad y privacidad en logs:**
  - En `backend/` (NestJS), usa siempre `SmartLogger` (`smart-logger.service.ts`). Nunca uses `console.log`.
  - En `frontend/` (Angular), usa siempre `DebugService` (`debug.service.ts`). Nunca uses `console.log`.
  - Jamás registres contraseñas, tokens ni datos personales (PII) en logs ni en el rastro de auditoría.
- **Tooltips en Angular:** nunca uses el atributo nativo `title` (`title="..."`, `[title]`, `[attr.title]`). Usa la directiva `[appCustomTooltip]` y verifica con `node scripts/check-native-title.js`.

## 2. Flujo para enviar un Pull Request

1. Haz *fork* del repositorio y crea una rama descriptiva desde `main` (`feat/nombre-corto` o `fix/nombre-corto`).
2. Ejecuta las validaciones locales antes de hacer commit:
   - **Backend:**
     ```bash
     cd backend
     npm run typecheck
     npm run lint:check
     npm test
     npm run build
     ```
   - **Frontend:**
     ```bash
     node scripts/check-native-title.js
     cd frontend
     npm run build -- --configuration=production
     npx ng test --watch=false
     ```
   - **Landing (`iglesia238.com`):**
     ```bash
     cd landing
     npm run build
     ```
3. Usa mensajes de commit bajo el estándar [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/) (`feat(accounting): ...`, `fix(membership): ...`).

## 3. Licencia de las contribuciones

Al enviar un Pull Request a este repositorio, aceptas que tu contribución se distribuya bajo los términos de la licencia **[GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE)** del proyecto y pueda ser incluida tanto en la edición comunitaria como en los servicios administrados operados por **LopezSoft SAS**.
