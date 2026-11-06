# Dockerfile unificado para producción en Dokploy (matiasimpulso.com):
# Empaqueta Frontend (Angular 22 + Nginx) + Backend (NestJS 12 + Fastify) + Migraciones (Prisma 7) en un solo contenedor.

# Etapa 1: compilación del Frontend (Angular)
FROM node:22.23-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build -- --configuration=production

# Etapa 2: compilación del Backend (NestJS + Prisma Client)
FROM node:22.23-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY backend/ ./
RUN npx prisma generate
RUN npm run build

# Etapa 3: imagen unificada de producción (Nginx + Node.js + Prisma)
FROM node:22.23-alpine AS production
RUN apk add --no-cache nginx dumb-init openssl && mkdir -p /run/nginx

WORKDIR /app/backend
ENV NODE_ENV=production \
    PORT=3000 \
    TRUST_PROXY=1

# Estáticos de Angular y configuración de Nginx (proxy interno /api/ -> 127.0.0.1:3000)
COPY --from=frontend-builder /app/frontend/dist/frontend/browser /usr/share/nginx/html
COPY docker/nginx/dokploy.conf /etc/nginx/http.d/default.conf

# Backend compilado, Prisma CLI, migraciones, seed y scripts CLI (admin:create / admin:reset-password)
COPY --from=backend-builder /app/backend/package*.json ./
COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/prisma ./prisma
COPY --from=backend-builder /app/backend/prisma.config.ts ./prisma.config.ts
COPY --from=backend-builder /app/backend/tsconfig.json ./tsconfig.json
COPY --from=backend-builder /app/backend/src ./src

COPY docker/entrypoint.prod.sh /usr/local/bin/entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh && chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null && wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/entrypoint.sh"]
