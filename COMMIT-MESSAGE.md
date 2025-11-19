# Mensaje de Commit Recomendado

## Commit Principal

```bash
git add .
git commit -m "feat(project): initialize fullstack monorepo with complete architecture

- Backend: NestJS with Fastify adapter and Prisma ORM
  * Configure Fastify as HTTP adapter
  * Setup Prisma with MariaDB provider
  * Install Passport + JWT for authentication
  * Configure Swagger/OpenAPI documentation
  * Implement global validation with class-validator
  * Create PrismaService with global injection
  * Add health check endpoint

- Frontend: Angular v20 with Standalone Components
  * Setup project with SCSS and routing
  * Configure development proxy to backend
  * Prepare Nginx config for SPA routing
  * Enable standalone components architecture

- Infrastructure: Docker orchestration
  * Create multi-stage Dockerfiles for optimization
  * Setup docker-compose with 3 services (db, backend, frontend)
  * Configure health checks for all services
  * Add persistent volumes for MariaDB
  * Setup dedicated bridge network

- Database: Prisma schema with User model
  * Define User model with authentication fields
  * Add Role enum (USER, ADMIN, MODERATOR)
  * Configure MariaDB as database provider

- Documentation: Complete project guides
  * Main README with full architecture overview
  * GETTING-STARTED guide for quick setup
  * INITIALIZATION-SUMMARY with project status
  * Conventional commits guidelines

- Security: Production-ready configurations
  * CORS enabled and configurable
  * Environment variables for secrets
  * Non-root users in Docker containers
  * Input validation ready

BREAKING CHANGE: Initial project setup"
```

## Commits Alternativos (Si prefieres commits más pequeños)

### Commit 1: Estructura Base
```bash
git add init.sh docker-compose.yml .gitignore .env.example README.md
git commit -m "chore(infra): add project scaffolding and docker orchestration"
```

### Commit 2: Backend
```bash
git add backend/
git commit -m "feat(backend): setup NestJS with Fastify, Prisma, and JWT auth"
```

### Commit 3: Frontend
```bash
git add frontend/
git commit -m "feat(frontend): setup Angular v20 with standalone components"
```

### Commit 4: Documentación
```bash
git add docs/
git commit -m "docs: add comprehensive project documentation"
```

---

## Verificar Cambios Antes de Commit

```bash
# Ver status
git status

# Ver diferencias
git diff

# Ver archivos staged
git diff --staged
```

---

## Push al Repositorio

```bash
# Push a main
git push origin main

# O crear rama de feature
git checkout -b feat/initial-setup
git push origin feat/initial-setup
```

---

**Nota:** Ajusta el mensaje según tus preferencias de estilo de commits.
