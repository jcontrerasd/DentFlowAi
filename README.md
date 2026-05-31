# DentFlowAi

Plataforma clínica-laboratorio dental: los dentistas crean casos con modelos 3D, el motor **Fauchard** selecciona técnicos de forma anónima, y los técnicos entregan diseños y/o fabricaciones.

La guía canónica para agentes (Claude Code, Cursor) y desarrolladores está en [CLAUDE.md](CLAUDE.md). Este README es la entrada rápida.

## Stack

- **Next.js 15** (App Router) · **React 19** · **TypeScript** · **Tailwind CSS 4**
- **Drizzle ORM** + **PostgreSQL** (Cloud SQL)
- **NextAuth 5 beta** (JWT)
- **Google Cloud Storage** (modelos 3D STL/PLY/OBJ + imágenes, con gzip transparente y lifecycle policy)
- **Three.js** (visor 3D)
- **Vitest** + Testing Library
- Despliegue: **Cloud Run** (imagen Docker `standalone`)

Requisitos: Node ≥ 20.19, npm ≥ 10, Docker Desktop, Google Cloud CLI.

## Estructura

```
frontend/              Aplicación Next.js (único deploy)
  app/                 Rutas App Router
  components/          Componentes React (cases/, cases/uch/, admin/, theme/, ui/)
  lib/db/              Drizzle: schema, infrastructure (migraciones runtime), actions/
  lib/services/        GCP Storage, notificaciones (Resend)
  lib/contactGuard/    Moderación de campos libres
  lib/businessTime.ts  Calendario laboral (horario + feriados)
  test/                Vitest + Testing Library
  scripts/             seed-uat.ts
docker-compose.yml     Postgres 16 + fake-gcs (entorno local)
Doc/                   Documentación operativa (ciclo de desarrollo, especs)
.cursor/skills/        Skills para Cursor (UCH)
```

## Entorno local (Docker)

```bash
docker compose up -d                # Postgres + fake-gcs
cd frontend && npm install          # solo la primera vez
cp .env.example .env.local          # editar AUTH_SECRET, etc.
npm run dev                         # http://localhost:3000
npx tsx scripts/seed-uat.ts         # datos de prueba
```

`docker-compose.yml` levanta:
- **db** — PostgreSQL 16 en `localhost:5432`, BD `dentflowai_local`.
- **storage** — `fsouza/fake-gcs-server` en `localhost:4443` emulando GCS. `lib/gcs.ts` firma URLs hacia `/api/local-gcs-proxy` (descomprime gzip antes de servir).

## Comandos frontend

```bash
cd frontend
npm run dev              # desarrollo (Turbopack, :3000)
npm run build            # build producción (standalone)
npm run type-check       # tsc --noEmit
npm run test             # vitest watch
npm run test:run         # vitest una pasada
npm run test:smoke       # smoke tests páginas clave
npm run lint             # eslint
npm run validate:full    # lint + type-check + build (~3 min)
npm run audit:unused     # knip (auditoría de código no usado)
```

Correr `npm run validate:full` antes de mergear a `main`.

## Ciclo de desarrollo y deploy

Detalle completo en [Doc/Ciclo_Desarrollo.md](Doc/Ciclo_Desarrollo.md). Resumen:

```
LOCAL → push a develop → bash deploy.sh develop → STAGING (Cloud Run dev + Cloud SQL dev)
                                        ↓ merge
                                       main → bash deploy.sh production → PROD
```

**Reglas de oro:**
- Nunca commitear directo a `main`. `main` = lo que está en `dentflowai.com`.
- Toda feature pasa por `develop` y se prueba en staging antes de producción.
- Las BD de staging y producción están totalmente separadas.

### Deploy

```bash
cd frontend
bash deploy.sh develop      # staging (servicio dentflowai-frontend-dev)
bash deploy.sh production   # producción (pide confirmación 'SI')
```

El script lee variables `*_DEV`/`*_PROD` de `frontend/.env.local`, construye imagen en Cloud Build y la despliega en Cloud Run.

### Infraestructura GCP

| | Staging | Producción |
|---|---|---|
| Cloud Run | `dentflowai-frontend-dev` | `dentflowai-frontend` |
| Cloud SQL | `dentflowai-psql-dev` | `dentflowai-cbcf2-instance` |
| Bucket GCS | `dentflowai-assets-dev` | `dentflowai-assets-prod` |
| Región | `southamerica-west1` | `southamerica-west1` |

Setup inicial de staging (one-time): `export DB_PASS=$(openssl rand -base64 24) && bash scripts/setup-staging-db.sh`.
Clonar prod → staging (incluye usuarios y `passwordHash`): `bash scripts/clone-prod-to-staging.sh`.

## Conceptos clave del producto

- **Tipos de servicio** (`clinical_case.service_type`): `solo_diseno`, `solo_fabricacion`, `integral`. Cada uno tiene su propio flujo de estados y formato de cotización (flat vs split). Ver [CLAUDE.md](CLAUDE.md).
- **Motor Fauchard**: clasifica casos, selecciona técnicos por habilidades + categoría, ancla `fauchard_config_id` al caso al publicar (copy-on-write). Idempotente — las lecturas no resetean deadlines.
- **UCH (Unified Case Hub)**: pantalla de flujo guiado (NO chat libre). Acciones embebidas en el hilo, anonimato dentista ⇄ técnico, dos countdowns independientes (cotizar / elegir oferta).
- **Calendario laboral (v4.6)**: `workDeadline` y deadlines Fauchard respetan horario y feriados configurables (`fauchard_config` + tabla `fauchard_holiday`).
- **Catálogos UI** (v4.0): `vita_shade`, `restoration_type`, `dental_material`, `urgency_level` — administrables desde `/dashboard/admin/catalogos`. Admin solo edita `label`; `code` es opaco system-generated.
- **GCS lifecycle**: archivos comprimidos con gzip al subir; al cerrar el caso se marca `customTime` y el lifecycle policy transiciona Standard → Nearline (30d) → Coldline (120d) → Archive (365d).
- **ContactGuard**: moderación de campos libres (notas, trackingId) para bloquear intentos de saltarse el marketplace.

## Restricciones críticas

- **No** acceder a la DB desde componentes — solo Server Actions en `frontend/lib/db/actions/`.
- **Identidad servidor**: usar `getServerIdentity()` (soporta impersonación admin). Nunca leer JWT directamente.
- **Migraciones**: runtime vía `frontend/lib/db/infrastructure.ts`. NO usar `drizzle-kit push` en producción.
- **UCH**: sin overlays `fixed inset-0`, sin chat libre. Acciones embebidas en el hilo (`buildUchTimelineRows`).
- **Feedback UI**: `useToast()` de `@/context/ToastContext` — nunca `alert()`.

## Roles

- `dentista` — crea casos, recibe propuestas anónimas, aprueba diseños.
- `tecnico` — recibe invitaciones, cotiza, entrega diseños y/o fabricaciones.
- `admin` — panel Fauchard, impersonación, métricas, gestión de catálogos y feriados.

## CI/CD

- Workflow: `.github/workflows/frontend-ci.yml`
- Trigger: `push` y `pull_request` con cambios en `frontend/**`
- Pipeline: `lint` → `type-check` → `build` → `test:run`

## Documentación adicional

- [CLAUDE.md](CLAUDE.md) — guía canónica del monorepo (stack, Fauchard, UCH, restricciones)
- [AGENTS.md](AGENTS.md) — puente corto para Cursor y otros agentes
- [frontend/AGENTS.md](frontend/AGENTS.md) — convenciones Next.js 15 / React 19
- [frontend/CLAUDE.md](frontend/CLAUDE.md) — auth, impersonación, wizard de casos, tema
- [frontend/lib/db/CLAUDE.md](frontend/lib/db/CLAUDE.md) — schema y server actions
- [Doc/Ciclo_Desarrollo.md](Doc/Ciclo_Desarrollo.md) — flujo paso a paso local → staging → prod
- [Doc/DentFlowAi_Especificaciones.md](Doc/DentFlowAi_Especificaciones.md) — especificación del producto
