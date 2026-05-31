# Frontend DentFlowAi

Aplicación Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS 4. Es el único deploy del producto (output `standalone`, Cloud Run).

Guía operativa y convenciones: [CLAUDE.md](CLAUDE.md) · [AGENTS.md](AGENTS.md). README de la raíz: [../README.md](../README.md).

## Requisitos

- Node.js ≥ 20.19
- npm ≥ 10
- Docker Desktop (para Postgres y fake-gcs locales — ver `../docker-compose.yml`)

## Setup

```bash
cp .env.example .env.local        # luego editar AUTH_SECRET, etc.
npm install
docker compose -f ../docker-compose.yml up -d
npm run dev                       # http://localhost:3000
npx tsx scripts/seed-uat.ts       # datos de prueba
```

## Scripts

| Script | Descripción |
|---|---|
| `npm run dev` | Dev server (Turbopack, :3000) |
| `npm run build` | Build producción (standalone) |
| `npm run start` | Servir build |
| `npm run lint` | ESLint |
| `npm run type-check` | `tsc --noEmit` |
| `npm run test` | Vitest watch |
| `npm run test:run` | Vitest una pasada |
| `npm run test:smoke` | Smoke tests páginas clave |
| `npm run validate:full` | lint + type-check + build (~3 min) |
| `npm run audit:unused` | knip (código no usado) |

Antes de mergear a `main`: `npm run validate:full`.

## Stack

- **NextAuth 5** (JWT). Identidad servidor: `getServerIdentity()` (`@/lib/db/actions/impersonation`).
- **Drizzle ORM** + PostgreSQL. Migraciones en runtime (`lib/db/infrastructure.ts`). Nunca usar `drizzle-kit push` en producción.
- **Google Cloud Storage** para STL/imágenes; gzip transparente en uploads y lifecycle policy por `customTime`. En local: `fake-gcs-server` + proxy en `/api/local-gcs-proxy`.
- **Three.js** para visor 3D (`components/DentalViewer3D.tsx`, loaders en `lib/three-loaders.ts`).
- **Tailwind 4** + sistema de tema claro/oscuro/sistema (`components/theme/`, tokens en `app/theme.css`).

## Deploy

```bash
bash deploy.sh develop      # staging (Cloud Run dentflowai-frontend-dev)
bash deploy.sh production   # producción (pide confirmación 'SI')
```

Flujo completo: [../Doc/Ciclo_Desarrollo.md](../Doc/Ciclo_Desarrollo.md). Las variables `*_DEV`/`*_PROD` viven en `.env.local` y `deploy.sh` las inyecta en Cloud Run.
