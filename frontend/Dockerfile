# ==========================================
# Multi-Stage Dockerfile - Frontend Angular
# Optimizado para Producción con Nginx
# ==========================================

# ==========================================
# STAGE 1: Build
# ==========================================
FROM node:20-alpine AS builder

# Metadata
LABEL maintainer="Arquitecto de Software Senior"
LABEL description="Frontend Angular - Build Stage"

# Establecer directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar Angular CLI y dependencias
RUN npm ci --quiet

# Copiar el código fuente completo
COPY . .

# Compilar la aplicación Angular en modo producción
# --configuration=production: Habilita optimizaciones (AOT, minificación, tree-shaking)
# --output-path: Especifica el directorio de salida
RUN npm run build -- --configuration=production --output-path=dist/frontend

# ==========================================
# STAGE 2: Production (Nginx)
# ==========================================
FROM nginx:alpine AS production

# Metadata
LABEL maintainer="Arquitecto de Software Senior"
LABEL description="Frontend Angular servido con Nginx Alpine"

# Instalar curl para healthchecks
RUN apk add --no-cache curl

# Eliminar la configuración por defecto de Nginx
RUN rm -rf /usr/share/nginx/html/*

# Copiar el build de Angular desde el stage anterior
COPY --from=builder /app/dist/frontend /usr/share/nginx/html

# Copiar la configuración personalizada de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exponer puerto 80
EXPOSE 80

# Configurar Nginx para ejecutarse en primer plano
CMD ["nginx", "-g", "daemon off;"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/ || exit 1
