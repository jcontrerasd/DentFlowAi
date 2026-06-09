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

### Scripts one-time del rollout de disponibilidad (v5.0, Fase 7)

Ejecutar con `npx tsx scripts/<archivo>.ts` desde `frontend/` (lee `.env.local` — confirmar que apunta a la BD destino antes de correr en prod).

| Script | Propósito |
|---|---|
| `backfill-availability.ts` | Inserta `technician_availability` por técnico (infiere CAD/CAM de `technician_skill`). Idempotente. Se corre **una vez** en la activación |
| `send-rollout-email.ts proximo\|activado` | Comunicación masiva a técnicos vía EmailJS (best-effort). `proximo` antes del rollout, `activado` tras encender el flag |

## Stack

- **NextAuth 5** (JWT). Identidad servidor: `getServerIdentity()` (`@/lib/db/actions/impersonation`).
- **Drizzle ORM** + PostgreSQL. Migraciones en runtime (`lib/db/infrastructure.ts`). Nunca usar `drizzle-kit push` en producción.
- **Google Cloud Storage** para STL/imágenes; gzip transparente en uploads y lifecycle policy por `customTime`. En local: `fake-gcs-server` + proxy en `/api/local-gcs-proxy`.
- **Three.js** para visor 3D (`components/DentalViewer3D.tsx`, loaders en `lib/three-loaders.ts`).
- **Tailwind 4** + sistema de tema claro/oscuro/sistema (`components/theme/`, tokens en `app/theme.css`).

## Deploy

```bash
# Asistente gráfico (recomendado): guía paso a paso, explica cada parámetro,
# muestra el impacto por ambiente y confirma antes de desplegar.
bash deploy-wizard.sh            # interactivo
bash deploy-wizard.sh --dry-run  # muestra el plan, NO despliega

# Script directo (no interactivo, para CI):
bash deploy.sh develop      # staging (Cloud Run dentflowai-frontend-dev)
bash deploy.sh production   # producción (pide confirmación 'SI')
```

`deploy-wizard.sh` es autónomo (replica la lógica de `deploy.sh`, no lo invoca): elige ambiente, permite activar/desactivar los flags v5.0 y `NOTIFICATIONS_LIVE` **solo para ese deploy** (sin tocar `.env.local`), y avisa si staging enviaría correos reales.

Flujo completo: [../Doc/Ciclo_Desarrollo.md](../Doc/Ciclo_Desarrollo.md). Las variables `*_DEV`/`*_PROD` viven en `.env.local` y se inyectan en Cloud Run. Override por ambiente de flags/secretos: sufijo `_DEV`/`_PROD` (cae a la clave plana).
