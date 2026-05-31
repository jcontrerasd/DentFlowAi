# DentFlowAi

Plataforma clínica-laboratorio dental: dentistas crean casos con modelos 3D, el algoritmo Fauchard selecciona técnicos, los técnicos entregan diseños y/o fabricaciones.

## Claude Code y Cursor

- Este archivo es la **guía canónica del monorepo** para **Claude Code** y **Cursor** (una sola fuente de verdad).
- **Claude Code:** partir siempre de este `CLAUDE.md` en la raíz del repo. Si el trabajo es bajo `frontend/`, complementar con los `CLAUDE.md` por carpeta: [frontend/CLAUDE.md](frontend/CLAUDE.md), [frontend/app/CLAUDE.md](frontend/app/CLAUDE.md), [frontend/components/CLAUDE.md](frontend/components/CLAUDE.md), [frontend/lib/db/CLAUDE.md](frontend/lib/db/CLAUDE.md) (contexto local; no reemplazan el stack ni las restricciones globales de la raíz).
- **Cursor:** en *Settings → Rules → Project rules*, incluir al menos [CLAUDE.md](CLAUDE.md) y, si usas la convención del repo, [AGENTS.md](AGENTS.md) en la raíz (puente corto). Convenciones Next del proyecto: [frontend/AGENTS.md](frontend/AGENTS.md). Trabajo intensivo en UCH: skill del proyecto `@uch-reglas-diseno-dentflowai` (cuerpo alineado con la sección **UCH — Reglas de Diseño DentFlowAi** más abajo).
- **Orden de lectura recomendado:** `CLAUDE.md` (raíz) → `AGENTS.md` (raíz) → `frontend/AGENTS.md` → `frontend/CLAUDE.md` → el `CLAUDE.md` del subdirectorio en el que edites.

## Stack
- Next.js 15 App Router · React 19 · TypeScript · Tailwind CSS 4
- Drizzle ORM + PostgreSQL (Cloud SQL) · NextAuth 5 beta
- Google Cloud Storage (archivos STL/imágenes) · Three.js (visor 3D)
- Vitest + Testing Library · framer-motion · lucide-react
- Node ≥ 20.19 · npm ≥ 10 (`frontend/package.json` → `engines`)

## Estructura
```
frontend/              Aplicación Next.js (único deploy, output: standalone)
  app/                 Rutas App Router (auth, dashboard, api/cron, api/auth)
  components/          Componentes React (cases/, cases/uch/, admin/, ui/, …)
  lib/db/              Drizzle ORM, schema, infrastructure (migraciones runtime)
    actions/           Server Actions (única capa de mutación/lectura DB)
    actions/catalogs.ts  Catálogos UI: vita_shade, restoration_type, dental_material, urgency_level
  app/dashboard/admin/catalogos/  CRUD admin de catálogos UI
  lib/services/        GCP Storage, notificaciones (Resend)
  lib/constants/       dental.ts, caseEvents.ts, uchAuditMatrix.ts, …
  lib/cases/           Presentación ficha, filtros listado, acciones ficha
  lib/dashboard/       KPIs, métricas, clasificación dashboard
  lib/                 uchThreadLane, uchPresentation, uchCasoPublicadoSplit,
                       uchEventVisibility, uchUnread, caseEventsUchFilter,
                       deadlineMs, hooks/useRemainingUntil, …
  context/             AuthContext (+ impersonación admin), ToastContext
  test/                Vitest + Testing Library
  scripts/             seed-uat.ts (datos UAT locales)
scripts/               CLI Python legacy (toolkit.py — sync claims Firebase/admin)
.cursor/skills/        uch-reglas-diseno-dentflowai (skill UCH para Cursor)
```

## Roles del sistema
- `dentista` — crea casos, recibe propuestas anónimas, aprueba diseños
- `tecnico` — recibe invitaciones, cotiza, entrega diseños/fabricaciones
- `admin` — panel Fauchard, impersonación, métricas

## Tipos de servicio (`clinicalCase.serviceType`)
Definidos en `frontend/lib/constants/dental.ts → SERVICE_TYPES`:
- `solo_diseno` — el dentista sube scans. Flujo: **Borrador → En evaluación → Propuesta lista → Esperando inicio → En ejecución → En revisión → Completado**.
- `solo_fabricacion` — el dentista sube **un único archivo de diseño** (STL/PLY/OBJ). El laboratorio solo fabrica. Flujo: **Borrador → En evaluación → Propuesta lista → Esperando inicio → En fabricación → Enviado → Completado** (sin pasos de diseño/revisión).
- `integral` — el laboratorio diseña y fabrica. Flujo completo: solo diseño + En fabricación → Enviado → Completado.
- `needsFabrication` (boolean) se mantiene en BD por compatibilidad: `true` para `integral` y `solo_fabricacion`, `false` para `solo_diseno`.

## Flujo de estados del caso (stepper)
```
BORRADOR → EN EVALUACIÓN → PROPUESTA LISTA → ESPERANDO INICIO
→ EN EJECUCIÓN → EN REVISIÓN → DISEÑO APROBADO        [solo_diseno / integral]
  [solo integral o solo_fabricacion] → EN FABRICACIÓN → ENVIADO
→ COMPLETADO
[terminal negativo] → RECHAZADO | CERRADO
```
- El componente `CaseWorkflowStepper.tsx` recibe `serviceType` y:
  - Agrega los pasos de fabricación cuando `isIntegral || isSoloFab`.
  - Para `solo_fabricacion` salta `enEjecucion`, `enRevision`, `disenoAprobado`.
  - Cuando un caso integral o `solo_fabricacion` termina en `rechazado` / `cerrado`, los pasos posteriores no cumplidos se pintan en rosa (no en gris).
- Modo `techRejected` (técnico no ganador): banda rosa de Propuesta lista → Diseño aprobado; los pasos posteriores quedan grises.
- El estado `cambiosEnProceso` (internamente entre enRevision y enEjecucion) existe en DB pero no aparece como step propio en el stepper público.

## Cierre del caso por tipo
- `solo_diseno`: tras `approveWorkAction` el caso transiciona directo a `completado` con `completedAt` poblado (la fila de control de responsabilidad se libera).
- `integral` con CAM: tras `approveWorkAction` va a `enFabricacion` y luego sigue su flujo físico.
- `integral` sin CAM (legacy): aún cierra como `disenoAprobado`.
- `solo_fabricacion`: tras `startWorkAction` el caso entra directo a `enFabricacion`; la entrega del despacho cierra el flujo.

## Oferta del técnico
- `solo_diseno` y `solo_fabricacion` → un único precio y plazo (`kind: 'flat'`).
- `integral` → desglose obligatorio diseño + fabricación (`kind: 'split'`). Total = suma de ambos.
- `submitQuoteAction` valida coherencia `serviceType` ⇄ `kind`; persiste totales en `quotedPrice`/`quotedDays` y el desglose en `quotedDesignPrice/Days` + `quotedFabricationPrice/Days`.

## Entorno local (Docker)

Entorno aislado para desarrollo sin tocar staging/prod ([docker-compose.yml](docker-compose.yml)):
- `db` — PostgreSQL 16 (puerto 5432, BD `dentflowai_local`).
- `storage` — `fsouza/fake-gcs-server` (puerto 4443) emula GCS. El proxy [frontend/app/api/local-gcs-proxy/route.ts](frontend/app/api/local-gcs-proxy/route.ts) intermedia descargas (descomprime gzip — fake-gcs no hace decompressive transcoding).
- `frontend/lib/gcs.ts` detecta `GCS_API_ENDPOINT` y firma URLs hacia el proxy local.
- Levantar: `docker compose up -d` + `.env.local` apuntando a `localhost`.

## Sistema de tema (claro/oscuro/sistema)

- Provider: [frontend/components/theme/ThemeProvider.tsx](frontend/components/theme/ThemeProvider.tsx) + [ThemeContext.ts](frontend/components/theme/ThemeContext.ts).
- Toggle: [ThemeToggleButton.tsx](frontend/components/theme/ThemeToggleButton.tsx).
- Tokens y variables CSS en [frontend/app/theme.css](frontend/app/theme.css); Tailwind 4 los consume.

## ContactGuard

Moderación de campos libres (notas, trackingId) — bloquea intentos de saltarse el marketplace (URLs, teléfonos, dominios). Reglas administrables en `/dashboard/admin/contactguard`. Código: [frontend/lib/contactGuard/](frontend/lib/contactGuard/) (`guardOrFail`, `normalize`, `cache`). Allowlist de dominios de courier disponible para `trackingId`.

## Calendario laboral (v4.6) — businessTime + feriados

`workDeadline` y los deadlines Fauchard respetan horario y feriados configurables:
- Config en `fauchard_config`: `businessHoursStart` (default 8), `businessHoursEnd` (default 20), `businessDaysMask` (bitmask, default 31 = L-V).
- Feriados globales en tabla `fauchard_holiday` (admin CRUD).
- Helpers: [frontend/lib/businessTime.ts](frontend/lib/businessTime.ts) (`addBusinessTime`, `isBusinessDay`, `ymd`). Usado por `startWorkAction` para computar `workDeadline` desde días/horas cotizados.
- Admin UI: [frontend/components/admin/fauchard/FauchardCalendarPanel.tsx](frontend/components/admin/fauchard/FauchardCalendarPanel.tsx); actions en [frontend/lib/db/actions/fauchardHolidays.ts](frontend/lib/db/actions/fauchardHolidays.ts).

## Comandos
```bash
cd frontend && npm run dev              # desarrollo (Turbopack, puerto 3000)
cd frontend && npm run build            # producción (standalone)
cd frontend && npm run type-check       # tsc --noEmit
cd frontend && npm run test             # vitest (watch)
cd frontend && npm run test:run         # vitest una pasada
cd frontend && npm run test:smoke         # smoke tests páginas clave
cd frontend && npm run lint               # eslint
cd frontend && npm run validate:full      # lint + type-check + build
npx tsx frontend/scripts/seed-uat.ts      # seed UAT local (.env.local)
```

## Flujo Git y Deploy

- Ramas: **develop** (trabajo diario, staging) → **main** (producción). Nunca commitear directo a `main`.
- Deploy: `cd frontend && bash deploy.sh [develop|production]`.
- **Staging**: Cloud Run `dentflowai-frontend-dev` + Cloud SQL `dentflowai-psql-dev` (BD aislada de prod).
- **Producción**: Cloud Run `dentflowai-frontend` + Cloud SQL `dentflowai-cbcf2-instance`.
- Variables por entorno (`DATABASE_URL_DEV`/`_PROD`, `AUTH_URL_DEV`/`_PROD`, `NEXT_PUBLIC_APP_URL_DEV`/`_PROD`) viven en `frontend/.env.local` y se inyectan en Cloud Run por `deploy.sh`.
- Crear BD staging (one-time): `export DB_PASS=$(openssl rand -base64 24) && bash scripts/setup-staging-db.sh`.
- Refrescar staging con datos de prod (clone completo, incluye usuarios y passwordHash): `bash scripts/clone-prod-to-staging.sh`.
- Flujo paso a paso completo: [Doc/Ciclo_Desarrollo.md](Doc/Ciclo_Desarrollo.md).

## Almacenamiento GCS — compresión y lifecycle

- **Gzip transparente en uploads**: los modelos 3D (`.stl/.ply/.obj`) se comprimen en el cliente con `CompressionStream('gzip')` antes del PUT. La URL firmada se genera con `extensionHeaders['content-encoding']='gzip'` (`frontend/lib/gcs.ts` → `getUploadUrl`). GCS persiste `Content-Encoding: gzip` y aplica decompressive transcoding al servir, por lo que el visor 3D no requiere cambios. Helper: `frontend/lib/uploadCompression.ts` (`maybeGzipForUpload`, `isGzipCompressible`). Imágenes/PDF/WebP pasan intactos.
- **Marca de archivado**: al transicionar un caso a estado terminal (`completado` en `confirmReceptionAction` y `approveWorkAction` solo_diseno; `disenoAprobado` en `approveWorkAction` integral legacy; `cerrado` en `rejectInvitationOfferAction` y `expireDentistComparativeWindowAction`), se invoca `archiveCaseFilesBestEffort(caseId)` en `frontend/lib/db/archiveCaseFiles.ts`. Esto setea `customTime` en cada objeto GCS del caso. Es best-effort: nunca bloquea la transición.
- **Buckets por entorno**: `dentflowai-assets-prod` (producción) y `dentflowai-assets-dev` (staging). `deploy.sh` selecciona el bucket según `ENV_TARGET` y lo inyecta como `GCP_BUCKET_NAME` en Cloud Run. Cada bucket es independiente (un `customTime` en dev no afecta prod).
- **Lifecycle policy**: misma para ambos buckets (`infra/gcs/lifecycle.json`). A partir de `customTime`: 30d → Nearline, 120d → Coldline, 365d → Archive. Multipart incompletos abortados a 7d. Aplicar: `gsutil lifecycle set infra/gcs/lifecycle.json gs://dentflowai-assets-prod` (y lo mismo con `-dev`).
- **Clonar caso** (`cloneCaseFromTerminalAction`): tras `copyFile`, se llama `GCPStorageService.clearArchivalMark()` para resetear el `customTime` heredado del origen. El clon arranca como caso nuevo en Standard sin reloj de lifecycle iniciado.

## Catálogos UI (listas administrables)
Diseño de lookup tables uniforme:
- **Tablas**: `vita_shade`, `restoration_type`, `dental_material`, `urgency_level`. Misma estructura:
  - `id` (uuid PK) — referenciado por FK desde `clinical_case`.
  - `code` (text UNIQUE) — **opaco, system-generated** (`mat_001`, `vita_001`, `rest_001`, `urg_001`). Identificador estable sin relación semántica con el label.
  - `label` (text) — **único campo editable** por admin.
  - `sort_order`, `is_active`. DDL + seed en [frontend/lib/db/infrastructure.ts](frontend/lib/db/infrastructure.ts) (`INFRA_VERSION='v4.7'` — incluye índices de performance y tabla `fauchard_holiday`).
- **FKs en clinical_case**: `material_id`, `restoration_type_id`, `shade_id`, `urgency_id` (todos con `ON DELETE RESTRICT`).
- **Reglas de uso desde código**:
  - Form envía `code` opaco para material/restoration/shade y `label` para urgency. El resolver ([catalogResolver.ts](frontend/lib/db/catalogResolver.ts)) lo convierte a `*_id` antes de persistir.
  - Lógica de negocio (Fauchard: `RESTORATION_TO_WORK_TYPE`, complejidad crítica para "Guía Quirúrgica", comparaciones `urgency === 'Alta'`) referencia **label**. Los labels de restauraciones y urgencias son estándares clínicos estables — admin no debería renombrarlos.
  - Reads (JOINs en cases/invitations/fauchard) aplanan: `material/restorationType/shade/urgency` = `label`. Los `*Code` opacos se exponen solo para selects que persisten el code.
- **UI admin**: `/dashboard/admin/catalogos`. Admin **solo edita label**; code se genera automáticamente. Borrar una opción en uso devuelve error de FK; admin solo desactiva.
- **Sin texto libre**: el wizard no permite "Otro" libre. Si falta una opción, admin la agrega.
- **Scripts one-time** (ya aplicados):
  - [scripts/migrate-catalogs-fk.ts](frontend/scripts/migrate-catalogs-fk.ts) (deprecated): text → FK.
  - [scripts/migrate-catalogs-opaque-codes.ts](frontend/scripts/migrate-catalogs-opaque-codes.ts) (deprecated): codes slug → opacos.
  - [scripts/migrate-recovery-v39.ts](frontend/scripts/migrate-recovery-v39.ts): dedup catálogos + backfill FK + drop columnas text.
- `SERVICE_TYPES` y `WORK_TYPES` **se mantienen como constantes** (state machine y sistema de tipos).

## Restricciones críticas
<important>NUNCA acceder a la DB desde componentes — solo Server Actions en frontend/lib/db/actions/</important>
<important>getServerIdentity() es el único resolver de identidad — soporta impersonación admin</important>
<important>Migraciones se ejecutan en runtime vía infrastructure.ts — NO usar drizzle-kit push en producción</important>
<important>Leer frontend/AGENTS.md antes de escribir código Next.js</important>

## Motor Fauchard (algoritmo de selección)

El motor Fauchard es el núcleo de orquestación. Flujo de vida de un caso:

1. **Publicar** → `runFauchardAction` (clasifica, selecciona técnicos) → `sendInvitationsAction` (envía invitaciones + ancla config al caso con `fauchardConfigId`).
2. **Cotizar** → `submitQuoteAction` (técnico responde con precio/plazo) → `checkAndExpireInvitationsAction`.
3. **Evaluar** → `evaluateQuotesAction` — **idempotente**: solo procede si `status === EN_EVALUACION`. `buildProposalAction` fija `proposalExpiresAt = now + tProposalHours` (config anclada al caso).
4. **Comparar y aceptar** → dentista elige oferta en `ComparativeOffersPanel` → `acceptProposalAction`.
5. **Ejecutar** → `startWorkAction` → entregas iterativas → `approveWorkAction` / `requestRevisionAction`.
6. **Fabricación** (`integral` / `solo_fabricacion`) → `transitionToManufacturingAction` → `registerDispatchAction`.
7. **Cierre físico** → dentista confirma recepción con `confirmReceptionAction` → `completado`. (`solo_diseno` cierra en `approveWorkAction`.)

### Idempotencia garantizada
- `evaluateQuotesAction` y `buildProposalAction`: solo transicionan desde `enEvaluacion`; `buildProposal` no reescribe `proposalExpiresAt` si el caso ya avanzó.
- **Lecturas** (`getCaseDetails`, `listCasesByOrganization`): solo `expirePendingInvitationsForCase` — **no** llaman `evaluateQuotes` (evita reset del countdown 2 al refrescar).

### Dos countdowns independientes (etapas distintas)
| Etapa | Config | Campo BD | Estado caso |
|-------|--------|----------|-------------|
| Técnicos cotizan | `tQuoteMinutes` | `case_invitation.expires_at` | `enEvaluacion` |
| Dentista elige oferta | `tProposalHours` | `clinical_case.proposal_expires_at` | `propuestaLista` |

Helpers: `frontend/lib/db/caseDeadlines.ts`. Evaluación/cierre de comparativo: `submitQuote`, cron, `checkAndExpireInvitationsAction` (no en lecturas).

### Config Fauchard
- **Global:** `getActiveConfig()` — config activa actual.
- **Por caso:** `getConfigForCase(caseId)` — usa `fauchard_config_id` anclado si existe; si no, la activa.
- **Publicar / republicar:** `runFauchardAction` devuelve `fauchardConfigId`; `sendInvitationsAction` recibe el mismo id.

## UCH — Reglas de Diseño DentFlowAi

### Qué ES el UCH
El UCH (UnifiedCaseHub) NO es un chat libre. Es una pantalla de flujo guiado con tres capas:
1. **CaseWorkflowStepper** → línea de tiempo del estado del caso (`frontend/components/cases/CaseWorkflowStepper.tsx`).
2. **EventStream** → historial de eventos renderizado por rol en `frontend/components/cases/UnifiedCaseHub.tsx` (vista única tipo Actividad; sin pestaña Resumen; filtros de fase: Todos / Propuesta / Diseño / Produc.).
3. **ActionPanel** → acciones y formularios embebidos en el **mismo hilo** (`buildUchTimelineRows`, filas expandibles en `frontend/components/cases/uch/`), sin overlays `fixed inset-0` centrados por defecto. Confirmación legal breve de cotización: **sheet inferior** en el mismo hub.

### Principio fundamental
Fauchard prioriza **una acción primaria** visible expandida en el hilo (revisión dentista, entrega de diseño, bloque Fauchard, etc.); el resto puede quedar colapsado en la misma lista. **No** hay chat libre al pie del UCH.

### Mensajes estandarizados por tipo
| Tipo | Quién lo ve | Componente / ubicación en repo |
|------|-------------|--------------------------------|
| OFERTA_ENVIADA | Técnico (carril propio) | `UchFauchardActionsPanel.tsx` + `submitQuoteAction` |
| OFERTAS_COMPARATIVAS_LISTAS | Dentista | `ComparativeOffersPanel.tsx` (embebido en hilo) |
| PROPUESTA_ACEPTADA | Ambos | `AcceptedProposalSummary.tsx`, `UchDealSummary.tsx` |
| OFERTA_RECHAZADA / OFERTA_NO_SELECCIONADA | Técnico (perdedor) | `UchEventBubble.tsx` con bloque de detalle snapshot |
| TRABAJO_INICIADO | Ambos | `UchFauchardActionsPanel.tsx` + `startWorkAction` |
| REVISION_ENVIADA | Ambos | `UchDeliveryPanel.tsx` + `submitRevisionAction` |
| TRABAJO_APROBADO / REVISION_SOLICITADA | Ambos | `UchDentistReviewPanel.tsx` + `approveWorkAction` / `requestRevisionAction` |
| FABRICACION_INICIADA / CASO_DESPACHADO | Ambos | `transitionToManufacturingAction`, `registerDispatchAction` en `cases.ts` |
| RECEPCION_CONFIRMADA | Ambos | `confirmReceptionAction` en `cases.ts` |
| CASO_PUBLICADO | Dentista (split) | Dos burbujas: "Yo" (derecha) + Fauchard (izquierda) — ver split logic |

### Split de CASO_PUBLICADO
El evento `CASO_PUBLICADO` llega del servidor enmascarado como Fauchard. El cliente lo divide en dos burbujas para el dentista mediante `splitCasoPublicadoForDentista()` en `lib/uchCasoPublicadoSplit.ts`:
- Mitad dentista (`::dentist`): payload lleva `__uchPresentationSelfHalf: true` → carril **self** ("Yo", derecha).
- Mitad Fauchard (`::fauchard`): payload lleva `presentationAuthor: 'fauchard'` → carril **thread** ("Fauchard", izquierda).
- El split solo aplica cuando el contenido incluye ambas frases. Eventos legacy ya partidos pasan intactos.

### Resolución de carril (uchThreadLane.ts)
`resolveUchThreadLane(event, viewer)` determina si una burbuja va a la izquierda (`thread`) o derecha (`self`) y si muestra cabecera "Fauchard" o el nombre del usuario:
- **Tabla A (dentista)**: prioridades explícitas por acción; `isSelfHalfMarker` toma precedencia para `CASO_PUBLICADO`.
- **Tabla B (técnico)**: `INVITACION_RECIBIDA` siempre thread+Fauchard; emisiones propias del técnico → self.
- `uchPresentationRole` fuerza tabla A o B cuando admin tiene ambos flags activos.

### Ficha de caso — botones de gestión
- Lógica de visibilidad/habilitación: `lib/cases/caseDetailActions.ts` → UI en `CaseDetailManagementBar.tsx`.
- **Borrador:** Grabar, Publicar (una sola vez por `publishedAt`), Eliminar. Campos clínicos editables.
- **Intermedios:** mismos botones visibles pero deshabilitados; ficha en solo lectura; flujo en UCH.
- **Terminal** (`completado` | `rechazado` | `cerrado`): Archivar / Restaurar (por usuario en `case_user_archive`), **Crear copia** (`cloneCaseFromTerminalAction` → nuevo borrador, archivos copiados en GCS).
- **No** usar `republishCaseAction` en UI (ronda comercial legacy en el mismo `caseId`).
- Lecturas (`getCaseDetails`, listados) no deben re-evaluar Fauchard ni resetear deadlines.

### Countdowns (dos ventanas)
**Etapa 1 — cotizar:** `evaluationExpiresAt` / `invitationExpiresAt` desde `getCaseQuoteDeadlineAt` (max `expires_at` de invitaciones `pending`/`quoted`). Banner en ficha dentista (`enEvaluacion`); HMS en tarjetas técnicas y UCH.

**Etapa 2 — elegir oferta:** `proposalExpiresAt` → `proposalDeadlineMs` en la página del caso. HMS **solo en cabecera UCH** cuando `status === propuestaLista` y viewer es dentista (no duplicar en `ComparativeOffersPanel`).

- `serverClockAnchor` sincroniza reloj cliente-servidor.
- `uchPanelMounted` evita desmontar el UCH al cerrar/abrir (preserva tick del timer en cliente).

### Anonimato
- Dentista NUNCA ve nombre del técnico, precio cotizado, cantidad de invitados.
- Técnico NUNCA ve eventos de otros técnicos del mismo caso.
- `sanitizeUchPayloadForViewer()` en `uchPresentation.ts` limpia `presentationAuthor`, `technicianId`, `revieweeId` según rol.
- Admin ve identidades reales sin enmascarado.

### Archivos UCH clave
```
components/cases/
  UnifiedCaseHub.tsx             Componente principal del hub (EventStream + ActionPanel)
  CaseWorkflowStepper.tsx        Línea de tiempo de estados
  ComparativeOffersPanel.tsx     Comparativa de ofertas para el dentista
  uch/
    UchEventBubble.tsx           Burbuja individual de evento
    UchFauchardActionsPanel.tsx  Acciones Fauchard (cotizar, iniciar trabajo, etc.)
    UchDeliveryPanel.tsx         Panel de entrega (técnico)
    UchDentistReviewPanel.tsx    Panel de revisión (dentista)
    UchDealSummary.tsx           Resumen del acuerdo aceptado
    UchQuoteBreakdown.tsx        Desglose diseño/fabricación en cotizaciones integral
    buildUchTimelineRows.ts      Construye filas del timeline (eventos + acciones)
    uchTimelineTypes.ts          Tipos del timeline
    uchHubActionVisibility.ts    Lógica de visibilidad de acciones

lib/
  uchThreadLane.ts               Resolución de carril (self/thread) y voz Fauchard
  uchPresentation.ts             Enmascarado Fauchard + sanitización de payload
  uchCasoPublicadoSplit.ts       Split client-side de CASO_PUBLICADO para dentista
  uchEventVisibility.ts          Regla de visibilidad para eventos visibleTo:tecnico
  uchUnread.ts                   Contadores de mensajes no leídos
  caseEventsUchFilter.ts         Filtro de eventos por rol (espeja getCaseEventsAction)
  deadlineMs.ts                  Utilidades de deadline (toDeadlineMs, effectiveNowMs)
  hooks/useRemainingUntil.ts     Hook para countdown sincronizado con servidor
```

### Stack y rutas (UCH en este repo)
- Server Actions **solo** en `frontend/lib/db/actions/` (nunca DB desde componentes).
- Identidad: **solo** `getServerIdentity()` como resolver (impersonación admin incluida).
