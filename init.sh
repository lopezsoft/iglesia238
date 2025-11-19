#!/bin/bash

# Script de Inicialización - Monorepo FullStack (NestJS + Angular + Docker)
# Arquitectura: Backend (NestJS + Fastify + Prisma) + Frontend (Angular)
# Autor: Generado por Arquitecto de Software Senior
# Fecha: 2025-11-19

set -e  # Exit on error

echo "=========================================="
echo "  Inicializando Monorepo FullStack"
echo "=========================================="
echo ""

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ==========================================
# 1. BACKEND - NestJS + Fastify + Prisma
# ==========================================
echo -e "${BLUE}[1/4] Configurando Backend (NestJS)...${NC}"

if [ ! -d "backend" ]; then
    # Instalar Nest CLI globalmente si no está instalado
    if ! command -v nest &> /dev/null; then
        echo -e "${YELLOW}Instalando @nestjs/cli globalmente...${NC}"
        npm install -g @nestjs/cli
    fi
    
    # Crear proyecto NestJS
    echo -e "${YELLOW}Creando proyecto NestJS...${NC}"
    nest new backend --package-manager npm --skip-git
    
    cd backend
    
    # Instalar Fastify (reemplazar Express)
    echo -e "${YELLOW}Instalando Fastify adapter...${NC}"
    npm install @nestjs/platform-fastify
    
    # Instalar dependencias de seguridad y autenticación
    echo -e "${YELLOW}Instalando Passport, JWT y estrategias de autenticación...${NC}"
    npm install @nestjs/passport passport @nestjs/jwt passport-jwt passport-local
    npm install -D @types/passport-jwt @types/passport-local
    
    # Instalar Prisma ORM
    echo -e "${YELLOW}Instalando Prisma ORM...${NC}"
    npm install prisma @prisma/client
    npm install -D prisma
    
    # Inicializar Prisma
    echo -e "${YELLOW}Inicializando Prisma...${NC}"
    npx prisma init
    
    # Instalar dependencias de documentación (Swagger)
    echo -e "${YELLOW}Instalando Swagger para documentación de API...${NC}"
    npm install @nestjs/swagger swagger-ui-express
    
    # Instalar configuración
    echo -e "${YELLOW}Instalando @nestjs/config...${NC}"
    npm install @nestjs/config
    
    # Instalar validación
    echo -e "${YELLOW}Instalando class-validator y class-transformer...${NC}"
    npm install class-validator class-transformer
    
    echo -e "${GREEN}✓ Backend configurado exitosamente${NC}"
    
    cd ..
else
    echo -e "${YELLOW}El directorio backend ya existe. Omitiendo...${NC}"
fi

echo ""

# ==========================================
# 2. FRONTEND - Angular
# ==========================================
echo -e "${BLUE}[2/4] Configurando Frontend (Angular)...${NC}"

if [ ! -d "frontend" ]; then
    # Instalar Angular CLI globalmente si no está instalado
    if ! command -v ng &> /dev/null; then
        echo -e "${YELLOW}Instalando @angular/cli globalmente...${NC}"
        npm install -g @angular/cli
    fi
    
    # Crear proyecto Angular
    echo -e "${YELLOW}Creando proyecto Angular...${NC}"
    ng new frontend --routing --style=scss --skip-git --standalone
    
    # Crear proxy.conf.json
    echo -e "${YELLOW}Creando proxy.conf.json...${NC}"
    cat > frontend/proxy.conf.json <<EOF
{
  "/api": {
    "target": "http://localhost:3000",
    "secure": false,
    "changeOrigin": true,
    "logLevel": "debug"
  }
}
EOF
    
    echo -e "${GREEN}✓ Frontend configurado exitosamente${NC}"
else
    echo -e "${YELLOW}El directorio frontend ya existe. Omitiendo...${NC}"
fi

echo ""

# ==========================================
# 3. DOCUMENTACIÓN
# ==========================================
echo -e "${BLUE}[3/4] Creando directorio de documentación...${NC}"

if [ ! -d "docs" ]; then
    mkdir -p docs
    echo -e "${GREEN}✓ Directorio docs/ creado${NC}"
else
    echo -e "${YELLOW}El directorio docs ya existe. Omitiendo...${NC}"
fi

echo ""

# ==========================================
# 4. GITIGNORE GLOBAL
# ==========================================
echo -e "${BLUE}[4/4] Generando .gitignore global...${NC}"

if [ ! -f ".gitignore" ]; then
    cat > .gitignore <<EOF
# Dependencies
node_modules/
backend/node_modules/
frontend/node_modules/

# Environment variables
.env
.env.local
.env.*.local
backend/.env
frontend/.env

# Build outputs
dist/
build/
backend/dist/
frontend/dist/
frontend/.angular/

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Prisma
backend/prisma/migrations/
!backend/prisma/migrations/.gitkeep

# Testing
coverage/
.nyc_output/

# Docker
docker-compose.override.yml
EOF
    
    echo -e "${GREEN}✓ .gitignore creado exitosamente${NC}"
else
    echo -e "${YELLOW}.gitignore ya existe. Omitiendo...${NC}"
fi

echo ""
echo -e "${GREEN}=========================================="
echo -e "  ✓ Inicialización completada"
echo -e "==========================================${NC}"
echo ""
echo -e "${BLUE}Próximos pasos:${NC}"
echo "1. Configurar las variables de entorno en backend/.env"
echo "2. Definir el esquema de la base de datos en backend/prisma/schema.prisma"
echo "3. Ejecutar: cd backend && npx prisma migrate dev --name init"
echo "4. Construir las imágenes Docker: docker-compose build"
echo "5. Iniciar los servicios: docker-compose up -d"
echo ""
