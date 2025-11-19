# Guía de Inicio Rápido - Desarrollo Local

## ✅ Estado Actual del Proyecto

El proyecto ha sido inicializado exitosamente con:

### Backend (NestJS)
- ✅ Proyecto NestJS creado
- ✅ Fastify adapter instalado
- ✅ Prisma ORM configurado (MariaDB)
- ✅ Passport + JWT instalado
- ✅ Swagger documentación instalada
- ✅ Validación con class-validator
- ✅ ConfigModule configurado
- ✅ Health check endpoint implementado
- ✅ PrismaService con inyección global

### Frontend (Angular)
- ✅ Angular v20 con Standalone Components
- ✅ Routing configurado
- ✅ SCSS configurado
- ✅ Proxy para desarrollo configurado

### Infraestructura
- ✅ Docker Compose listo
- ✅ Dockerfiles multi-stage optimizados
- ✅ Nginx configurado para SPA

---

## 🚀 Desarrollo Local

### 1. Iniciar Backend

```bash
cd backend

# El backend ya está listo, solo inicia el servidor
npm run start:dev
```

**Endpoints disponibles:**
- API: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/api/docs`
- Health: `http://localhost:3000/api/health`

### 2. Iniciar Frontend

```bash
cd frontend

# Inicia el servidor con proxy configurado
npm start
```

**Aplicación disponible en:** `http://localhost:4200`

El proxy redirige automáticamente `/api/*` → `http://localhost:3000/api/*`

---

## 🐳 Despliegue con Docker

**IMPORTANTE:** Antes de ejecutar Docker, necesitas tener MariaDB corriendo localmente o modificar el `DATABASE_URL` en `.env`

### Opción A: Docker Compose (Recomendado)

```bash
# Construir imágenes
docker-compose build

# Iniciar todos los servicios
docker-compose up -d

# Ver logs
docker-compose logs -f

# Detener servicios
docker-compose down
```

### Opción B: Iniciar solo la Base de Datos con Docker

```bash
# Iniciar solo MariaDB
docker-compose up -d db

# Backend y Frontend ejecutarlos localmente
cd backend && npm run start:dev
cd frontend && npm start
```

---

## 📊 Base de Datos - Prisma

### Crear Migración Inicial

**IMPORTANTE:** Solo ejecutar cuando tengas MariaDB corriendo

```bash
cd backend

# Opción 1: Con Docker (MariaDB en container)
docker-compose up -d db
# Espera 10 segundos para que MariaDB inicie
npx prisma migrate dev --name init

# Opción 2: Con MariaDB local
# Asegúrate de tener MariaDB instalado y corriendo
npx prisma migrate dev --name init
```

### Comandos Útiles de Prisma

```bash
# Generar cliente
npx prisma generate

# Ver datos con UI
npx prisma studio

# Crear nueva migración
npx prisma migrate dev --name nombre_migracion

# Reset base de datos (SOLO DESARROLLO)
npx prisma migrate reset

# Aplicar migraciones en producción
npx prisma migrate deploy
```

---

## 🔧 Esquema Prisma Actual

El esquema incluye un modelo `User` básico con autenticación:

```prisma
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  password  String
  name      String?
  role      Role     @default(USER)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum Role {
  USER
  ADMIN
  MODERATOR
}
```

---

## 📝 Próximos Pasos Sugeridos

### 1. Implementar Módulo de Autenticación

```bash
cd backend

# Generar módulo de Auth
nest g module auth
nest g service auth
nest g controller auth

# Generar estrategia JWT
nest g module auth/strategies --flat
```

### 2. Crear DTOs y Guards

```bash
# DTOs para validación
nest g class auth/dto/login.dto --no-spec
nest g class auth/dto/register.dto --no-spec

# Guards para protección de rutas
nest g guard auth/guards/jwt-auth --no-spec
nest g guard auth/guards/roles --no-spec
```

### 3. Frontend - Crear Servicios y Guards

```bash
cd frontend

# Servicio de autenticación
ng generate service core/services/auth

# Guard para protección de rutas
ng generate guard core/guards/auth

# Interceptor para JWT
ng generate interceptor core/interceptors/jwt
```

---

## 🐛 Troubleshooting

### Error: "Cannot connect to database"

**Solución:**
```bash
# Verificar que MariaDB está corriendo
docker-compose ps

# Reiniciar solo la base de datos
docker-compose restart db

# Ver logs de la base de datos
docker-compose logs db
```

### Error: "Port 3000 already in use"

**Solución:**
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac
lsof -i :3000
kill -9 <PID>
```

### Error: Prisma Client desactualizado

**Solución:**
```bash
cd backend
npx prisma generate
npm run start:dev
```

---

## 📚 Documentación Adicional

- **NestJS:** https://docs.nestjs.com/
- **Angular:** https://angular.dev/
- **Prisma:** https://www.prisma.io/docs
- **Fastify:** https://www.fastify.io/docs/latest/
- **Docker:** https://docs.docker.com/

---

**Última Actualización:** 2025-11-19
**Estado:** ✅ Proyecto inicializado y listo para desarrollo
