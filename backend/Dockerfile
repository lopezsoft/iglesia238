# Multi-stage: builder -> migrator (migraciones + catálogos) / production (API)

FROM node:22.23-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev --quiet
COPY . .
RUN npx prisma generate
RUN npm run build

# Conserva el CLI de Prisma y tsx, que no se incluyen en la imagen de la API.
# El seed es idempotente: solo crea o actualiza catálogos globales.
FROM builder AS migrator
RUN apk add --no-cache openssl
USER node
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed"]

FROM builder AS pruned
RUN npm prune --omit=dev

FROM node:22.23-alpine AS production
RUN apk add --no-cache dumb-init
WORKDIR /app
ENV NODE_ENV=production
COPY --from=pruned --chown=node:node /app/package*.json ./
COPY --from=pruned --chown=node:node /app/node_modules ./node_modules
COPY --from=pruned --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
