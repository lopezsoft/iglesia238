# Monorepo FullStack - NestJS + Angular + Docker

Arquitectura Monorepo de producción con Backend (NestJS + Fastify + Prisma) y Frontend (Angular).

## 📋 Stack Tecnológico

### Backend
- **Framework:** NestJS (última versión)
- **HTTP Adapter:** Fastify
- **ORM:** Prisma
- **Base de Datos:** MariaDB
- **Autenticación:** Passport + JWT
- **Documentación:** Swagger/OpenAPI

### Frontend
- **Framework:** Angular (v20+)
- **Arquitectura:** Standalone Components
- **Reactividad:** Signals
- **Estilos:** SCSS
- **Server:** Nginx (Producción)

### Infraestructura
- **Contenedores:** Docker
- **Orquestación:** Docker Compose
- **Proxy:** Nginx

## 🚀 Inicio Rápido

### 1. Ejecutar Script de Inicialización

```bash
# Dar permisos de ejecución al script
chmod +x init.sh

# Ejecutar el script
./init.sh
```

Este script automatiza:
- Creación del proyecto NestJS con Fastify
- Instalación de dependencias de seguridad (Passport, JWT)
- Configuración de Prisma ORM
- Creación del proyecto Angular con Standalone Components
- Generación de estructura de directorios

### 2. Configurar Variables de Entorno

```bash
# Copiar archivos de ejemplo
cp .env.example .env
cp backend/.env.example backend/.env

# Editar las variables según tu entorno
nano .env
nano backend/.env
```

### 3. Configurar Base de Datos

```bash
cd backend

# Editar el esquema de Prisma
nano prisma/schema.prisma

# Crear migración inicial
npx prisma migrate dev --name init

# Generar cliente de Prisma
npx prisma generate
```

### 4. Desarrollo Local

#### Backend
```bash
cd backend
npm run start:dev
```

#### Frontend
```bash
cd frontend
npm start
# o con proxy
ng serve --proxy-config proxy.conf.json
```

### 5. Producción con Docker

```bash
# Construir imágenes
docker-compose build

# Iniciar servicios
docker-compose up -d

# Ver logs
docker-compose logs -f

# Detener servicios
docker-compose down
```

## 📁 Estructura del Proyecto

```
iglesia238-curso-fullstack/
├── backend/                    # Backend NestJS
│   ├── src/
│   ├── prisma/
│   │   └── schema.prisma      # Esquema de base de datos
│   ├── Dockerfile             # Multi-stage build
│   ├── .env.example
│   └── package.json
├── frontend/                   # Frontend Angular
│   ├── src/
│   ├── Dockerfile             # Multi-stage build
│   ├── nginx.conf             # Configuración Nginx
│   ├── proxy.conf.json        # Proxy para desarrollo
│   └── package.json
├── docs/                       # Documentación
├── resources/                  # Recursos del proyecto
├── docker-compose.yml          # Orquestación de servicios
├── .gitignore
├── .env.example
├── init.sh                     # Script de inicialización
└── README.md
```

## 🔧 Comandos Útiles

### Backend (NestJS)

```bash
# Desarrollo
npm run start:dev

# Build
npm run build

# Tests
npm run test
npm run test:e2e

# Linting
npm run lint

# Prisma
npx prisma studio              # UI para ver datos
npx prisma generate            # Generar cliente
npx prisma migrate dev         # Crear migración
npx prisma migrate deploy      # Aplicar en producción
```

### Frontend (Angular)

```bash
# Desarrollo
ng serve
ng serve --proxy-config proxy.conf.json

# Build
ng build --configuration=production

# Tests
ng test

# Linting
ng lint

# Generar componente
ng generate component nombre
```

### Docker

```bash
# Construir servicios
docker-compose build

# Iniciar servicios
docker-compose up -d

# Ver logs
docker-compose logs -f [servicio]

# Ejecutar comandos en contenedor
docker-compose exec backend sh
docker-compose exec frontend sh

# Detener y eliminar
docker-compose down

# Limpiar volúmenes
docker-compose down -v
```

## 🏗️ Arquitectura

### Flujo de Datos
```
Cliente (Browser)
    ↓
Frontend (Angular/Nginx:80)
    ↓
Backend (NestJS/Fastify:3000)
    ↓
Database (MariaDB:3306)
```

### Principios Aplicados
- **Clean Architecture:** Separación clara de responsabilidades
- **SOLID:** Principios de diseño orientado a objetos
- **DRY:** No repetir código
- **Security First:** Validación, sanitización, JWT
- **Container-First:** Todo compatible con Docker

## 🔐 Seguridad

- ✅ Validación de DTOs con `class-validator`
- ✅ JWT para autenticación
- ✅ CORS configurado
- ✅ Sanitización de inputs en Frontend
- ✅ Variables de entorno para secretos
- ✅ Usuario no-root en contenedores
- ✅ Health checks en servicios

## 📚 Documentación API

Una vez iniciado el backend, la documentación Swagger está disponible en:

```
http://localhost:3000/api/docs
```

## 🤝 Convenciones de Código

### Backend (NestJS)
- Controllers: Solo manejan HTTP requests/responses
- Services: Contienen lógica de negocio
- DTOs: Validación con decoradores
- Prisma: Para todas las operaciones de BD
- Logger: Usar `@nestjs/common` Logger

### Frontend (Angular)
- Standalone Components preferidos
- Signals para estado local
- Services con BehaviorSubject para estado global
- `ChangeDetectionStrategy.OnPush` por defecto
- Lazy Loading en rutas principales

## 📝 Git Workflow

```bash
# Crear rama de feature
git checkout -b feat/nombre-feature

# Commit usando Conventional Commits
git commit -m "feat(backend): implement user authentication"
git commit -m "fix(frontend): resolve routing issue"
git commit -m "docs: update README with deployment steps"

# Push y crear Pull Request
git push origin feat/nombre-feature
```

### Formato de Commits
- `feat`: Nueva funcionalidad
- `fix`: Corrección de bug
- `docs`: Cambios en documentación
- `style`: Formato, sin cambios de código
- `refactor`: Refactorización de código
- `test`: Agregar o modificar tests
- `chore`: Tareas de mantenimiento

## 🐛 Troubleshooting

### Puerto en uso
```bash
# Linux/Mac
lsof -i :3000
kill -9 <PID>

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Problemas con Prisma
```bash
# Regenerar cliente
npx prisma generate

# Reset base de datos (desarrollo)
npx prisma migrate reset
```

### Problemas con Docker
```bash
# Limpiar todo
docker-compose down -v
docker system prune -a

# Reconstruir sin caché
docker-compose build --no-cache
```

## 📄 Licencia

[Especificar licencia del proyecto]

## 👥 Contribuidores

[Lista de contribuidores]

---

**Última Actualización:** 2025-11-19
