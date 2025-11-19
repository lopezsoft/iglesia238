# ==========================================
# Multi-Stage Dockerfile - Backend NestJS
# Optimizado para Producción con Fastify
# ==========================================

# ==========================================
# STAGE 1: Build
# ==========================================
FROM node:20-alpine AS builder

# Metadata
LABEL maintainer="Arquitecto de Software Senior"
LABEL description="Backend NestJS con Fastify y Prisma - Build Stage"

# Instalar dependencias del sistema necesarias para Prisma
RUN apk add --no-cache openssl libc6-compat

# Establecer directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./
COPY tsconfig*.json ./

# Instalar dependencias (incluidas devDependencies para el build)
RUN npm ci --quiet

# Copiar el esquema de Prisma
COPY prisma ./prisma

# Generar Prisma Client
RUN npx prisma generate

# Copiar el código fuente
COPY . .

# Compilar la aplicación NestJS
RUN npm run build

# Limpiar devDependencies para reducir tamaño
RUN npm prune --production

# ==========================================
# STAGE 2: Production
# ==========================================
FROM node:20-alpine AS production

# Metadata
LABEL maintainer="Arquitecto de Software Senior"
LABEL description="Backend NestJS con Fastify y Prisma - Production Stage"

# Instalar dependencias del sistema para runtime de Prisma
RUN apk add --no-cache openssl libc6-compat dumb-init

# Crear usuario no-root por seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Establecer directorio de trabajo
WORKDIR /app

# Copiar package.json para tener metadata
COPY --chown=nestjs:nodejs package*.json ./

# Copiar node_modules de producción del stage builder
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules

# Copiar el código compilado
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist

# Copiar el esquema de Prisma y archivos generados
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

# Cambiar a usuario no-root
USER nestjs

# Exponer puerto (Fastify por defecto usa 3000)
EXPOSE 3000

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Usar dumb-init para manejar señales correctamente
ENTRYPOINT ["dumb-init", "--"]

# Comando de inicio
CMD ["node", "dist/main.js"]
