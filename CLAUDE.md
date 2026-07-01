# DentFlowAi

Plataforma clínica-laboratorio dental: dentistas crean casos con modelos 3D, el algoritmo Fauchard selecciona técnicos, los técnicos entregan diseños.

## Claude Code y Cursor

- **Claude Code:** partir siempre de este `CLAUDE.md`. Si el trabajo es bajo `frontend/`, complementar con [frontend/CLAUDE.md](frontend/CLAUDE.md) y [frontend/AGENTS.md](frontend/AGENTS.md).
- **Cursor:** en *Settings → Rules → Project rules*, incluir `CLAUDE.md` y `AGENTS.md`.
- **Orden de lectura:** `CLAUDE.md` (raíz) → `AGENTS.md` → `frontend/AGENTS.md` → `frontend/CLAUDE.md`.

### Flujo de trabajo con planes
Cuando el usuario aprueba un plan vía `ExitPlanMode`, **no implementar automáticamente**. Esperar confirmación explícita antes de ejecutar. Nunca proponer ni ejecutar merge `v2 → main` — requiere validación en staging y decisión explícita del dueño.

### Acciones destructivas o visibles externamente
Pedir confirmación antes de: deploy (`deploy.sh`, `deploy_gui.py`, comandos `gcloud`), `git push`, commits, PR, `git reset --hard`, borrar ramas o truncar tablas.

### Alcance de los comandos de validación
No ejecutar `npm run validate:full` salvo pedido explícito. Usar solo lo necesario:
- Tipos → `npm run type-check` · Estilo → `npm run lint` · Feature → `npm run test:run`

## Stack
- Next.js 15 · React 19 · TypeScript · Tailwind CSS 4
- Drizzle ORM + PostgreSQL (Cloud SQL) · NextAuth 5 beta
- Google Cloud Storage (STL/imágenes) · Three.js (visor 3D)
- Vitest + Testing Library · framer-motion · lucide-react · recharts
- Node ≥ 20.19 · npm ≥ 10

## Restricciones críticas
<important>NUNCA acceder a la DB desde componentes — solo Server Actions en frontend/lib/db/actions/</important>
<important>getServerIdentity() es el único resolver de identidad — soporta impersonación admin</important>
<important>Migraciones en runtime vía infrastructure.ts (INFRA_VERSION actual: v5.25) — NO usar drizzle-kit push en producción</important>
<important>Leer frontend/AGENTS.md antes de escribir código Next.js</important>

## Roles del sistema
- `dentista` — crea casos, ve precio/plazo de catálogo, aprueba diseños
- `tecnico` — recibe asignaciones, acepta o rechaza, entrega diseños
- `admin` — panel Fauchard, impersonación, métricas, LGPD/legal

## Tipos de servicio

**Producto activo (v2):** solo `solo_diseno` con asignación directa (score Q/P/E/B/L/N).
Los tipos `integral`/`solo_fabricacion` y el flujo de cotización son **legacy**; sus server actions en `fauchard.ts`/`proposal.ts` existen solo para datos históricos — no usar en flujos nuevos.

## Flujo de estados (`solo_diseno`)
```
BORRADOR → EN EVALUACIÓN → ESPERANDO INICIO → EN EJECUCIÓN → EN REVISIÓN → COMPLETADO
[terminal negativo] → RECHAZADO | CERRADO
```
Durante `enEvaluacion`, `internalStatus` puede ser `asignacionPendiente` o `pendiente_pool`.

## Motor Fauchard (asignación directa)

1. **Publicar** → `publishCaseAction` → `classifyCaseAction` → `runAssignmentAction` (ranking Q/P/E/B/L/N en `lib/fauchard/assignmentScore.ts`).
2. **Asignar** → top-1 en `case_assignment` (`internalStatus: asignacionPendiente`); sin elegibles y pool on → `enterPendingPoolAction` (`pendiente_pool`).
3. **Aceptar o rechazar** → `acceptAssignmentAction` o `rejectInvitationIndividualAction` → `tryReplaceAfterRejectAction` (siguiente del ranking, hasta `maxAssignmentAttempts`).
4. **Ejecutar** → `startWorkAction` → entregas iterativas → `approveWorkAction` / `requestRevisionAction` → `completado`.

**Config:** Global: `getActiveConfig()` · Por caso: `getConfigForCase(caseId)` (usa `fauchard_config_id` anclado si existe).

## Modelo de disponibilidad (flag `AVAILABILITY_MODEL_ENABLED`)

Sistema de 3 niveles jerárquicos (global · CAD/CAM · 7 categorías). Sin el flag, Fauchard usa `user.is_available`.

- **Elegibilidad AND triple** sin caché — `computeEligibleAction` en cada corrida.
- **Sanción rolling 14d** (`noResponseEvents.ts`): nivel 1 warning · nivel 2 penalización score · nivel 3 auto-OFF.
- **Rechazo individual** (flag `REJECTION_INDIVIDUAL_ENABLED`): no cuenta como no-respuesta.
- **Crons**: `/api/cron/process-availability` (cada hora) y `/api/cron/process-pool-queue` (cada 2 min). Header `Authorization: Bearer ${CRON_SECRET}`.

## Motor de ligas (flag `LEAGUE_ENGINE_ENABLED`)

4 categorías fijas (Bronce/Plata/Oro/Élite). Gating por liga en `runAssignmentAction`. Ascenso/descenso automático via `processLeagueMaintenanceAction`. Cron diario: `/api/cron/process-league`.

## UCH — Reglas de Diseño

El UCH **no es un chat libre**. Tres capas:
1. `CaseWorkflowStepper.tsx` — línea de tiempo de estados.
2. `UnifiedCaseHub.tsx` — EventStream por rol (filtros: Todos / Asignación / Entrega / Calificación).
3. `buildUchTimelineRows.ts` — acciones embebidas en el hilo (filas expandibles), sin overlays `fixed inset-0`.

**Una acción primaria** visible expandida; el resto colapsado. No hay chat libre al pie.

### Anonimato (invariante crítica)
- Dentista nunca ve nombre del técnico ni cantidad de candidatos.
- Técnico nunca ve eventos de otros técnicos del mismo caso.
- `sanitizeUchPayloadForViewer()` limpia `presentationAuthor`, `technicianId`, `revieweeId` por rol.
- `splitCasoPublicadoForDentista()` divide CASO_PUBLICADO en burbuja dentista + burbuja Fauchard (solo cliente).

### Countdowns
- **Aceptar asignación**: `tQuoteMinutes` → `case_assignment.expires_at`. HMS en header UCH (técnico).
- **Revisión dentista**: `tDentistReviewHours` → `last_revision_submitted_at + config`. Cada entrega reinicia. Sin auto-acción al vencer.

## Catálogos UI

Tablas: `vita_shade`, `restoration_type`, `dental_material`, `urgency_level`. Estructura: `id` · `code` (opaco, system-generated) · `label` (único campo editable) · `sort_order` · `is_active`. FKs en `clinical_case` con `ON DELETE RESTRICT`. Sin texto libre "Otro".

## ContactGuard

Modera campos libres (notas, trackingId) — bloquea intentos de saltarse el marketplace. Código en `frontend/lib/contactGuard/`. Reglas admin en `/dashboard/admin/contactguard`. Campo `dispatchTracking` exento de detección numérica. Números dentro de URLs/dominios no se marcan como teléfono.

## Almacenamiento GCS

- `.stl/.ply/.obj` comprimidos con gzip en upload; GCS aplica decompressive transcoding al servir.
- Al completar un caso, `archiveCaseFilesBestEffort(caseId)` setea `customTime` (lifecycle: 30d Nearline, 120d Coldline, 365d Archive).
- Buckets: `dentflowai-assets-prod` / `dentflowai-assets-dev`.
- Proxy local (`app/api/local-gcs-proxy/route.ts`) descomprime gzip (fake-gcs no hace decompressive transcoding).

## Sistema de tema

`components/theme/ThemeProvider.tsx` + tokens en `app/theme.css`. No usar `next-themes`.

## Entorno local (Docker)

`docker compose up -d` levanta PostgreSQL 16 (puerto 5432) y fake-gcs-server (puerto 4443). `.env.local` apunta a localhost.

## GUI de Deploy

`frontend/deploy_gui.py` — Python/Tkinter. STAGING: desde `develop` o `v2`. PRODUCTION: solo desde `main`. `deploy.sh` no recorta comentarios inline de `.env.local`; la GUI sí.

## Flujo Git

- Línea v1 (`develop`→`main`) + línea v2 (`v2`→`main`). Tag `v1.0-produccion` (commit `d9a9f5a`) — no eliminar nunca.
- Staging: Cloud Run `dentflowai-frontend-dev` + Cloud SQL `dentflowai-psql-dev`.
- Producción: Cloud Run `dentflowai-frontend` + Cloud SQL `dentflowai-cbcf2-instance`.

## Comandos
```bash
cd frontend && npm run dev              # desarrollo (Turbopack, puerto 3000)
cd frontend && npm run type-check       # tsc --noEmit
cd frontend && npm run test:run         # vitest una pasada
cd frontend && npm run lint             # eslint
cd frontend && npm run validate:full    # lint + type-check + build (solo si se pide)
npx tsx frontend/scripts/seed-uat.ts   # seed UAT local
cd frontend && python3 deploy_gui.py   # GUI gráfica de deploy
```
