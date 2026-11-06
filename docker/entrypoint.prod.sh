#!/bin/sh
# Script de arranque para el contenedor unificado en producción (Dokploy - matiasimpulso.com):
# 1. Aplica migraciones pendientes (prisma migrate deploy).
# 2. Sincroniza catálogos globales de forma idempotente (prisma db seed).
# 3. Si existen PLATFORM_ADMIN_EMAIL y PLATFORM_ADMIN_PASSWORD y aún no hay administrador, lo crea.
# 4. Inicia la API NestJS/Fastify en 127.0.0.1:3000 y Nginx en el puerto 80.
set -e

cd /app/backend

echo "[iglesia238] Aplicando migraciones de base de datos (prisma migrate deploy)..."
npx prisma migrate deploy

echo "[iglesia238] Sincronizando catálogos globales (prisma db seed)..."
npx prisma db seed

if [ -n "${PLATFORM_ADMIN_EMAIL:-}" ] && [ -n "${PLATFORM_ADMIN_PASSWORD:-}" ]; then
  echo "[iglesia238] Verificando primer administrador de plataforma..."
  npm run admin:create || true
fi

echo "[iglesia238] Iniciando API NestJS en 127.0.0.1:${PORT:-3000}..."
node dist/main.js &
BACKEND_PID=$!

echo "[iglesia238] Iniciando Nginx en el puerto 80..."
nginx -g "daemon off;" &
NGINX_PID=$!

trap 'kill -TERM "$BACKEND_PID" "$NGINX_PID" 2>/dev/null || true; wait' INT TERM

while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$NGINX_PID" 2>/dev/null; do
  sleep 2
done

kill -TERM "$BACKEND_PID" "$NGINX_PID" 2>/dev/null || true
wait || true
exit 1
