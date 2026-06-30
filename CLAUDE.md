# DentFlowAi

Plataforma clínica-laboratorio dental: dentistas crean casos con modelos 3D, el algoritmo Fauchard selecciona técnicos, los técnicos entregan diseños.

## Claude Code y Cursor

- Este archivo es la **guía canónica del monorepo** para Claude Code y Cursor.
- **Claude Code:** partir siempre de este `CLAUDE.md`. Si el trabajo es bajo `frontend/`, complementar con [frontend/CLAUDE.md](frontend/CLAUDE.md) y [frontend/AGENTS.md](frontend/AGENTS.md).
- **Cursor:** en *Settings → Rules → Project rules*, incluir al menos `CLAUDE.md` y `AGENTS.md` en la raíz.
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

## Estructura
```
frontend/              Aplicación Next.js (output: standalone)
  app/                 Rutas App Router (auth, dashboard, api/cron, api/auth, api/demo)
  components/          Componentes React (cases/, cases/uch/, admin/, ui/, theme/, …)
  lib/db/              Drizzle ORM + schema + migrations runtime (infrastructure.ts)
    actions/           Server Actions — única capa de mutación/lectura DB (33 archivos)
    actions/catalogs.ts  Catálogos UI: vita_shade, restoration_type, dental_material, urgency_level
  app/dashboard/admin/ Panel admin: catalogos/, contactguard/, fauchard/, observability/,
                         prices/, users/, legal/, danger/
  lib/services/        gcp-storage.ts, notifications.ts (EmailJS), emailPreviewBuffer.ts
  lib/constants/       dental.ts, caseEvents.ts, uchAuditMatrix.ts, addressData.ts,
                       availabilityFlags.ts, qualityFlags.ts, uchCaseEvents.ts,
                       uchEmitterMatrix.ts, legalReasons.ts, dataProcessingRegistry.ts
  lib/cases/           workDeadline.ts, caseDetailActions.ts, filtros, presentación ficha
  lib/fauchard/        caseWorkType.ts, assignmentScore.ts
  lib/                 uchThreadLane.ts, uchPresentation.ts, uchCasoPublicadoSplit.ts,
                       uchEventVisibility.ts, uchUnread.ts, caseEventsUchFilter.ts,
                       deadlineMs.ts, localCron.ts, league.ts, leagueScore.ts,
                       uchQuoteDisplay.ts, hooks/useRemainingUntil.ts
  context/             AuthContext.tsx, ToastContext.tsx
  test/                Vitest + Testing Library
  scripts/             seed-uat.ts, seed-demo-tecnicos.ts, backfill-availability.ts,
                       reseed-contact-guard-regex.ts, seed-price-rules.ts y otros
scripts/               clone-prod-to-staging.sh, setup-staging-db.sh, local-db-pull.sh,
                       GCPControl.sh, promote_admin.mjs
.cursor/skills/        uch-reglas-diseno-dentflowai
```

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
Los tipos `integral`/`solo_fabricacion` y el flujo de cotización son **legacy** en schema y BD histórica; sus server actions (`submitQuoteAction`, `evaluateQuotesAction`, `acceptProposalAction`, `runFauchardAction`) existen en `fauchard.ts`/`proposal.ts` solo para datos históricos — no usar en flujos nuevos.

`SERVICE_TYPES` en `frontend/lib/constants/dental.ts`:
- `solo_diseno` — dentista sube scans. Flujo: **Borrador → En evaluación → Esperando inicio → En ejecución → En revisión → Completado**

## Flujo de estados (`solo_diseno`)
```
BORRADOR → EN EVALUACIÓN → ESPERANDO INICIO → EN EJECUCIÓN → EN REVISIÓN → COMPLETADO
[terminal negativo] → RECHAZADO | CERRADO
```
Durante `enEvaluacion`, `internalStatus` puede ser `asignacionPendiente` o `pendiente_pool`.

## Precio y plazo (v2)
Al publicar, el caso se ancla a una regla de precio (`listPriceCost`, `listPriceSale`, `listPriceFeePercent`). El técnico ve compensación y plazo fijos. No hay cotización ni comparativo.

## Motor Fauchard (asignación directa)

1. **Publicar** → `publishCaseAction` → `classifyCaseAction` (work type, regla de precio) → `runAssignmentAction` (ranking Q/P/E/B/L/N en `lib/fauchard/assignmentScore.ts`).
2. **Asignar** → top-1 en `case_assignment` (`internalStatus: asignacionPendiente`); si no hay elegibles y pool on: `enterPendingPoolAction` (`pendiente_pool`).
3. **Aceptar o rechazar** → `acceptAssignmentAction` o `rejectInvitationIndividualAction` → `tryReplaceAfterRejectAction` (siguiente del ranking, hasta `maxAssignmentAttempts`).
4. **Ejecutar** → `startWorkAction` → entregas iterativas → `approveWorkAction` / `requestRevisionAction` → `completado`.

### Simulador admin
`/dashboard/admin/fauchard/simulate` — funnel workspace con stepper navegable (Caso · Clasificación · Filtros · Ranking · Asignación). Motor: `simulateAssignmentAction`. Componentes en `components/admin/fauchard/simulator/`.

### Config Fauchard
- Global: `getActiveConfig()` · Por caso: `getConfigForCase(caseId)` (usa `fauchard_config_id` anclado si existe).
- 3 pestañas admin: Parámetros · Categorías · Historial.

## Modelo de disponibilidad (flag `AVAILABILITY_MODEL_ENABLED`)

Sistema gradual de 3 niveles jerárquicos (global · CAD/CAM · 7 categorías). Sin el flag, Fauchard usa `user.is_available`.

- **Elegibilidad AND triple** sin caché — `computeEligibleAction` en cada corrida.
- **Sanción rolling 14d** (`noResponseEvents.ts`): nivel 1 warning · nivel 2 penalización score · nivel 3 auto-OFF.
- **Cola `pendiente_pool`** (`poolQueue.ts`): si no hay elegibles, el caso espera; `runAssignmentAction` retorna `{ pooled: true }`.
- **Rechazo individual** (flag `REJECTION_INDIVIDUAL_ENABLED`): `rejectInvitationIndividualAction` → `tryReplaceAfterRejectAction`. No cuenta como no-respuesta.
- **Crons**: `/api/cron/process-availability` (cada hora) y `/api/cron/process-pool-queue` (cada 2 min). Header `Authorization: Bearer ${CRON_SECRET}`. Inertes con el flag off.
- **Badge de disponibilidad**: `components/availability/AvailabilityBadge.tsx` en header (solo técnico). Panel completo en `/dashboard/profile/availability`.

## Motor de ligas (flag `LEAGUE_ENGINE_ENABLED`)

4 categorías fijas (Bronce/Plata/Oro/Élite). El gating por liga opera en `runAssignmentAction`.

- **Ascenso/descenso** automático via `processLeagueMaintenanceAction` (`leagueCron.ts`).
- **Cron**: `/api/cron/process-league` (diario). En local: `instrumentation.ts` → `lib/localCron.ts` (flags `LOCAL_CRONS_ENABLED` / `LOCAL_LEAGUE_CRON_INTERVAL_MS`).
- **UI admin**: badge de categoría + chip "Transición" en `TechnicianRankingTable`; `LeagueConfigPanel`.
- **Código**: motor en `actions/league.ts`; helpers en `lib/league.ts`; penalización score en `lib/leagueScore.ts`.
- Columnas en `user`: `league_level`, `league_transition_started_at`, `league_demotion_watch_since`, `league_last_evaluated_at`. Auditoría en `league_change_event`.

## UCH — Reglas de Diseño

El UCH **no es un chat libre**. Tres capas:
1. `CaseWorkflowStepper.tsx` — línea de tiempo de estados.
2. `UnifiedCaseHub.tsx` — EventStream por rol (filtros: Todos / Asignación / Entrega / Calificación).
3. `buildUchTimelineRows.ts` — acciones embebidas en el hilo (filas expandibles), sin overlays `fixed inset-0`.

**Una acción primaria** visible expandida; el resto colapsado. No hay chat libre al pie.

### Componentes UCH
```
components/cases/
  UnifiedCaseHub.tsx             Hub principal
  CaseWorkflowStepper.tsx        Línea de tiempo de estados
  PendingPoolBanner.tsx          Banner dentista durante pendiente_pool
  uch/
    UchEventBubble.tsx           Burbuja individual
    UchFauchardActionsPanel.tsx  Aceptar/rechazar asignación, iniciar trabajo
    UchDeliveryPanel.tsx         Entrega (técnico)
    UchDealSummary.tsx           Resumen acuerdo (precio/plazo de catálogo)
    UchRatingPanel.tsx           Calificación dentista → técnico
    UchRejectInvitationDialog.tsx Rechazar asignación pendiente
    UchQuoteBreakdown.tsx        Desglose cotización (legacy — casos históricos)
    UchDerivationRequestPanel.tsx  Derivación a control de calidad
    UchDeriveQualityDialog.tsx
    UchRejectDerivationDialog.tsx
    UchSendToDentistPanel.tsx
    QualityIterationHistory.tsx
    DeliveryViewer3DModal.tsx
    buildUchTimelineRows.ts      Construye filas del timeline
    uchTimelineTypes.ts
    uchHubActionVisibility.ts    Visibilidad de acciones
```

### Archivos lib/ clave
```
lib/uchThreadLane.ts           Resolución de carril (self/thread) y voz Fauchard
lib/uchPresentation.ts         Enmascarado Fauchard + sanitización payload
lib/uchCasoPublicadoSplit.ts   Split client-side de CASO_PUBLICADO para dentista
lib/uchEventVisibility.ts      Visibilidad eventos visibleTo:tecnico
lib/uchUnread.ts               Contadores no leídos
lib/caseEventsUchFilter.ts     Filtro de eventos por rol
lib/deadlineMs.ts              Utilidades de deadline
lib/hooks/useRemainingUntil.ts Countdown sincronizado servidor-cliente
```

### Anonimato
- Dentista nunca ve nombre del técnico ni cantidad de candidatos.
- Técnico nunca ve eventos de otros técnicos del mismo caso.
- `sanitizeUchPayloadForViewer()` limpia `presentationAuthor`, `technicianId`, `revieweeId` por rol.
- Admin ve identidades reales.

### Split CASO_PUBLICADO
`splitCasoPublicadoForDentista()` en `lib/uchCasoPublicadoSplit.ts` divide en burbuja dentista (carril self) + burbuja Fauchard (carril thread). Solo en cliente.

### Countdowns
- **Aceptar asignación**: `tQuoteMinutes` → `case_assignment.expires_at`. HMS en header UCH (técnico).
- **Revisión dentista**: `tDentistReviewHours` → `last_revision_submitted_at + config`. Cada entrega reinicia. Sin auto-acción al vencer.

## Catálogos UI

Tablas: `vita_shade`, `restoration_type`, `dental_material`, `urgency_level`. Misma estructura: `id` (uuid PK) · `code` (opaco, system-generated: `mat_001`, `vita_001`, …) · `label` (único campo editable) · `sort_order` · `is_active`.

- FKs en `clinical_case`: `material_id`, `restoration_type_id`, `shade_id`, `urgency_id` (`ON DELETE RESTRICT`).
- Form envía `code` opaco para material/restoration/shade y `label` para urgency. Resolver: `catalogResolver.ts`.
- UI admin: `/dashboard/admin/catalogos`. Admin solo edita label; borrar opción en uso devuelve error FK.
- Sin texto libre "Otro" — admin agrega opciones que falten.

## ContactGuard

Modera campos libres (notas, trackingId) — bloquea intentos de saltarse el marketplace.
- Código: `frontend/lib/contactGuard/` (`guardOrFail.ts`, `normalize.ts`, `cache.ts`, `phonePatterns.ts`, `index.ts`, `clientHelpers.ts`).
- Reglas admin en `/dashboard/admin/contactguard`.
- Teléfonos detectados por país: `PHONE_PATTERNS_BY_COUNTRY` para 9 países + patrón `+CC`. `resolveInvolvedCountryCodes` resuelve unión dentista + técnico + actor.
- Campo `dispatchTracking` exento de detección numérica (`NUMERIC_EXEMPT_FIELDS`).
- Números dentro de URLs/dominios no se marcan como teléfono (`findProtectedSpans`).

## Almacenamiento GCS

- **Gzip en uploads**: `.stl/.ply/.obj` comprimidos con `CompressionStream('gzip')`. Helper: `lib/uploadCompression.ts`. GCS aplica decompressive transcoding al servir.
- **Marca de archivado**: al terminar un caso, `archiveCaseFilesBestEffort(caseId)` setea `customTime` en GCS (best-effort).
- **Buckets**: `dentflowai-assets-prod` (prod) y `dentflowai-assets-dev` (staging).
- **Lifecycle** (`infra/gcs/lifecycle.json`): desde `customTime` → 30d Nearline, 120d Coldline, 365d Archive.
- **Clonar caso** (`cloneCaseFromTerminalAction`): tras `copyFile` llama `clearArchivalMark()` para resetear `customTime`.
- **Proxy local**: `app/api/local-gcs-proxy/route.ts` descomprime gzip (fake-gcs no hace decompressive transcoding).

## Plazos de entrega

`workDeadline` = `desiredDeliveryAt` fijado por el dentista al publicar. Helpers en `lib/cases/workDeadline.ts` (`resolveWorkDeadline`, `computeProposedDeliveryDays`, `isCompletedOnTime`).

## Dirección geográfica (v5.7)

Columnas en `user` (TEXT nullable): `country`, `region`, `comuna`, `address`, `address_number`, `address_office`.
- `REGIONS_BY_COUNTRY` en `lib/constants/addressData.ts`: 9 países (Chile completo, 16 regiones, 346 comunas).
- Selects cascada País → Región → Comuna en registro y perfil.
- Badge de ubicación en ficha de caso con divulgación en tres niveles (completa / gruesa / ninguna) vía `getDoctorAddressDisclosure`.

## LGPD / Cumplimiento legal (v5.15)

- Panel admin: `/dashboard/admin/legal`.
- `lib/constants/legalReasons.ts` — motivos de eliminación.
- `lib/constants/dataProcessingRegistry.ts` — categorías de tratamiento de datos.
- Actions: `getLegalEvidenceUploadUrlAction` en `admin.ts`.

## Sistema de tema

Provider: `components/theme/ThemeProvider.tsx` + `ThemeContext.ts`. Toggle: `ThemeToggleButton.tsx`. Tokens CSS en `app/theme.css`. No usar `next-themes`.

## Preview de emails (DEMO local)

Flag `NEXT_PUBLIC_DEMO_EMAIL_PREVIEW=true` (default off). `notifyUser` registra el correo en buffer sin enviarlo.
- `lib/services/emailPreviewBuffer.ts` — ring buffer, máx 50 entradas.
- `app/api/demo/email-preview/route.ts` — `GET ?since=<timestamp>`.
- `components/demo/DemoEmailPreviewListener.tsx` — polling 2s, modal informativo.

## Entorno local (Docker)

`docker compose up -d` en la raíz levanta PostgreSQL 16 (puerto 5432, BD `dentflowai_local`) y `fsouza/fake-gcs-server` (puerto 4443). `.env.local` apunta a localhost. `lib/gcs.ts` detecta `GCS_API_ENDPOINT` y firma URLs hacia el proxy local.

## GUI de Deploy

`frontend/deploy_gui.py` — interfaz Python/Tkinter para deploy a staging/prod. Política dual-track:
- **STAGING**: desde `develop` o `v2` (pestaña STAGING).
- **PRODUCTION**: solo desde `main` (bloquea `develop`/`v2`).
- `deploy.sh` no recorta comentarios inline de `.env.local`; la GUI sí los recorta al leer y guardar.

## Flujo Git

- Línea v1 (`develop`→`main`) + línea v2 (`v2`→`main`). Respaldo: rama `v1` + tag `v1.0-produccion` (commit `d9a9f5a`) — no eliminar nunca.
- Staging: Cloud Run `dentflowai-frontend-dev` + Cloud SQL `dentflowai-psql-dev`.
- Producción: Cloud Run `dentflowai-frontend` + Cloud SQL `dentflowai-cbcf2-instance`.
- Variables por entorno (`DATABASE_URL_DEV`/`_PROD`, `AUTH_URL_DEV`/`_PROD`, `NEXT_PUBLIC_APP_URL_DEV`/`_PROD`) en `frontend/.env.local`.
- Guías: [Doc/Estrategia_Versionado.md](Doc/Estrategia_Versionado.md) · [Doc/Ciclo_Desarrollo.md](Doc/Ciclo_Desarrollo.md).

## Comandos
```bash
cd frontend && npm run dev              # desarrollo (Turbopack, puerto 3000)
cd frontend && npm run build            # producción (standalone)
cd frontend && npm run type-check       # tsc --noEmit
cd frontend && npm run test:run         # vitest una pasada
cd frontend && npm run test:smoke       # smoke tests páginas clave
cd frontend && npm run lint             # eslint
cd frontend && npm run validate:full    # lint + type-check + build (solo si se pide)
npx tsx frontend/scripts/seed-uat.ts   # seed UAT local (.env.local)
cd frontend && python3 deploy_gui.py   # GUI gráfica de deploy
```
