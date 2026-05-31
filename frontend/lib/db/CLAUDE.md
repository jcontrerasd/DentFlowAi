# lib/db/ — Capa de datos (Drizzle ORM)

## Archivos clave
- `schema.ts` — Definición de todas las tablas. Fuente de verdad del modelo.
- `infrastructure.ts` — Conexión DB + runtime migrations (NO usar drizzle-kit push en producción)
- `index.ts` — Exporta instancia `db`

## Tablas principales

### `clinicalCase`
Estado del caso: `borrador → enEvaluacion → propuestaLista → aceptadaPendienteInicio → enEjecucion → enRevision [→ cambiosEnProceso] → disenoAprobado [→ enFabricacion → enviado] → completado`

Para `solo_fabricacion` el flujo salta `enEjecucion`/`enRevision`/`disenoAprobado` y va directo de `aceptadaPendienteInicio` → `enFabricacion`.

Campos clave:
- `serviceType`: `solo_diseno` | `solo_fabricacion` | `integral` — fuente de verdad del tipo de servicio
- `needsFabrication`: boolean (`true` para `integral` y `solo_fabricacion`; mantenido por retrocompatibilidad con casos legacy)
- `proposedPrice`, `proposedDeliveryDays`: oferta aceptada (totales canónicos del único técnico ganador)
- `proposedDeliveryHours`, `proposedDesignHours`, `proposedFabricationHours`, `proposedShippingHours`: granularidad horaria opcional (v4.6) — usada por `buildProposalAction` + `startWorkAction` para computar `workDeadline` con `addBusinessTime()` respetando jornada y feriados. Si están null, el cálculo cae al equivalente en días
- `proposalExpiresAt`: deadline del comparativo (fijado por `buildProposalAction`). **No resetear si `status !== enEvaluacion`** (idempotencia).
- `assignedTechnicianId`: técnico ganador (uno solo por caso; no hay aprobación parcial)
- `workDeadline`: fecha de entrega comprometida (se muestra en el stepper)
- `fauchardConfigId`: config Fauchard anclada al publicar (copy-on-write admin)
- `internalStatus`: estados internos granulares para el motor (no visible al usuario)

### `caseInvitation`
Una fila por técnico invitado por caso. Status: `pending | quoted | accepted | confirmed | rejected | expired | withdrawn`

Campos de cotización:
- `quotedPrice`, `quotedDays`: **totales canónicos** (ordenamiento, comparativo, reporting). Para integral son suma de diseño + fabricación; para solo_diseno / solo_fabricacion son el único valor cotizado.
- `quotedDesignPrice`, `quotedDesignDays`, `quotedFabricationPrice`, `quotedFabricationDays`: desglose **nullable**. Se persisten solo cuando `serviceType === 'integral'` (kind 'split'). Cotizaciones antiguas o de tipos flat quedan con estos campos null y la UI hace fallback al total.
- `techNotes`, `dentistRejectionFeedback`

### `technicianSkill`
Habilidades del técnico por `workType`: `designLevel` y `fabricationLevel` (0–7 cada uno).
El motor Fauchard usa estos niveles para filtrar y puntuar invitados.

### `fauchardConfig`
Parámetros del algoritmo. **Como máximo una fila `is_active`** (índice único parcial). El admin actualiza con copy-on-write: nueva fila + desactivar la anterior. Cada `clinicalCase` puede anclar `fauchardConfigId` al publicar.

Campos de **calendario laboral** (v4.6, alimentan `lib/businessTime.ts`):
- `businessHoursStart` (default 8), `businessHoursEnd` (default 20) — jornada `[start, end)` abierta a la derecha (8–20 = 12h diarias).
- `businessDaysMask` (default 31 = `0b0011111` = L-V) — bitmask: bit 0=Lun, 1=Mar, 2=Mié, 3=Jue, 4=Vie, 5=Sáb, 6=Dom. Ej: 63 (`0b0111111`) habilita sábado.
- Consumidos junto con la tabla `fauchard_holiday` por `addBusinessTime(from, days, hours, cfg, holidays)` para calcular `workDeadline` en `startWorkAction` y `buildProposalAction`. Reloj de feriado/horario aplica también a expiración de invitaciones y propuestas.

### `fauchardHoliday` (v4.6)
Lista global de feriados (no por config). Columnas: `holiday_date` (UNIQUE), `label`, `created_by`. Admin CRUD en `/dashboard/admin/fauchard` → panel Calendario. Actions en `lib/db/actions/fauchardHolidays.ts`.

### `caseUserArchive`
Archivo por usuario y caso (`case_user_archive`). Usado por `archiveCaseForUserAction` / `unarchiveCaseForUserAction` en terminal.

### `clinicalCaseEvent`
Log de todos los eventos UCH. Campos: `userId`, `type`, `action`, `content`, `payload` (jsonb), `stateChange` (jsonb), `createdAt`.

Convención de `payload`:
- `visibleTo`: `'dentista'` | `'tecnico'` | `'ambos'` | `'sistema'` — filtra visibilidad
- `presentationAuthor: 'fauchard'` — el receptor ve a Fauchard como emisor
- `invitationId` — acota el evento al hilo de esa invitación (aislamiento técnico)

### `clinicalCaseDelivery`
Entregas de diseño/revisión. Campos: `technicianId`, `version`, `files` (jsonb), `status`, `reviewComment`.

### `clinicalCaseHubRead`
Cursores de lectura del UCH por usuario + caso: `lastReadTechHubAt`, `lastReadNegHubAt`. Usado por `uchUnread.ts` para los contadores de mensajes no leídos.

### Catálogos UI — `vitaShade`, `restorationType`, `dentalMaterial`, `urgencyLevel`
Tablas administrables (v4.0, dos identificadores: opaco + label):
- `id` (uuid PK) — referenciado por FK desde `clinical_case`.
- `code` (text UNIQUE NOT NULL) — **opaco** system-generated (`mat_001`, `vita_001`, `rest_001`, `urg_001`). Estable; sin relación semántica con el label.
- `label` (text) — único campo editable por admin (los labels de restauración y urgencia son estándares clínicos estables; no renombrar a la ligera).
- `sortOrder`, `isActive`.

`clinical_case` tiene FKs `material_id`, `restoration_type_id`, `shade_id`, `urgency_id` (`ON DELETE RESTRICT`). Columnas text legacy eliminadas (script `migrate-recovery-v39.ts`).

**Reglas de acceso** (ver `catalogResolver.ts`):
- Form/wizard → envía `code` opaco para material/restoration/shade; **`label`** para urgency (la lógica de negocio compara contra labels estándar).
- Resolver → convierte code→id (mat/rest/shade) o label→id (urgency) antes de persistir.
- App code referencia **label** (`urgency === 'Alta'`, `RESTORATION_TO_WORK_TYPE[label]`). Nunca el code opaco.
- Reads (JOIN) aplanan: `material/restorationType/shade/urgency` = label. Los `*Code` opacos solo se exponen para selects que necesitan persistir code.

**Admin CRUD**: admin solo edita `label`. `code` se genera automáticamente como `${prefix}_${NNN}` (siguiente disponible).

Scripts one-time (ya aplicados): `migrate-catalogs-fk.ts`, `migrate-catalogs-opaque-codes.ts`, `migrate-recovery-v39.ts` (dedup catálogos + backfill FK + drop columnas text + retira `business_key`).

## Patrón Server Actions
<important>Todas las funciones retornan `{ success: boolean; data?: T; error?: string }`</important>
<important>Usar `getServerIdentity()` para userId/role — nunca leer JWT directamente</important>
<important>Validar role antes de cualquier mutación</important>

## actions/ clave

| Archivo | Responsabilidad |
|---------|----------------|
| `fauchard.ts` | Motor Fauchard: classifyCase, runFauchard, sendInvitations, submitQuote, evaluateQuotes, buildProposal |
| `cases.ts` | CRUD casos, publicar, archivar, clonar, fabricación/despacho/recepción, `logCaseEvent()`, `getCaseEventsAction` |
| `proposal.ts` | acceptProposal, rejectInvitationOffer, startWork, withdrawQuote, expireDentistComparativeWindow |
| `invitations.ts` | Listado de invitaciones; archivos visibles solo si `invitation.status === confirmed` |
| `skills.ts` | Matriz habilidades; lee rol desde DB (no JWT) |
| `files.ts` | Upload/download vía GCS signed URLs |
| `archiveCaseFiles.ts` | `archiveCaseFilesBestEffort(caseId)` — marca `customTime` en archivos GCS al cerrar el caso (alimenta la lifecycle policy del bucket). Opera sobre el bucket configurado en runtime (`GCP_BUCKET_NAME`): staging y prod tienen buckets distintos (`-dev` / `-prod`), así que la transición en uno no afecta al otro |
| `impersonation.ts` | `getServerIdentity()` — resolver canónico de identidad |
| `hubRead.ts` | Cursores de lectura del UCH (`markCaseAsReadAction`) + contadores no leídos. Actualiza `clinical_case_hub_read` (`lastReadTechHubAt` / `lastReadNegHubAt`); consumido por `lib/uchUnread.ts` |
| `dashboard.ts` | Métricas y agregados del dashboard |
| `admin.ts` | Operaciones admin (usuarios, orgs) |
| `user.ts` / `organization.ts` | Perfil, onboarding, organizaciones |
| `annotations.ts` | Anotaciones 3D en visor |
| `catalogs.ts` | Listas administrables del wizard (vita_shade, restoration_type, dental_material, urgency_level): list públicas + CRUD admin |
| `fauchardHolidays.ts` | CRUD de feriados globales (tabla `fauchard_holiday`, v4.6). Admin UI en `/dashboard/admin/fauchard` → FauchardCalendarPanel |
| `contactGuard.ts` | CRUD de reglas (regex/keyword) para moderar campos libres. Admin UI en `/dashboard/admin/contactguard`. Las reglas las consume `lib/contactGuard/guardOrFail.ts` en server actions de cotización, despacho y notas |

## getCaseEventsAction — pipeline de entrega al cliente
1. Filtra eventos por visibilidad de rol (via `filterCaseEventsForUchViewer`).
2. Enriquece payload de cotizaciones rechazadas con snapshot de `caseInvitation`.
3. Firma URLs de avatares (GCS).
4. Para cada evento: `shouldPresentUchEventAsFauchard` → si true, sustituye `user` por `UCH_FAUCHARD_PUBLIC_USER` y limpia `presentationAuthor` del payload con `sanitizeUchPayloadForViewer`.
5. Admin recibe identidades reales sin enmascarado.

## Idempotencia crítica en Fauchard
- `evaluateQuotesAction` / `buildProposalAction`: guard `status === EN_EVALUACION`; `buildProposal` usa `UPDATE … WHERE status = enEvaluacion` (sin re-fijar `proposalExpiresAt`).
- `expirePendingInvitationsForCase` vs `tryEvaluateQuotesIfReady`: las **lecturas** solo expiran invitaciones; evaluación en `submitQuote`, cron y `checkAndExpireInvitationsAction`.
- Countdown 1: `expires_at` se fija en `sendInvitationsAction` (`tQuoteMinutes`); dedupe por técnico activo.
- Countdown 2: `proposalExpiresAt` se fija una vez en `buildProposalAction` (`tProposalHours`).
- Ver `frontend/lib/db/caseDeadlines.ts`.

## Fauchard selección por tipo de servicio
- `classifyCaseAction`: si el caso tiene `serviceType` poblado (wizard v3) lo respeta como fuente de verdad; si no, lo deriva de `needsFabrication`.
- `runFauchardAction` filtra `technicianSkill` según el tipo:
  - `solo_diseno`, `integral` → `designLevel >= minSkillLevel`
  - `solo_fabricacion` → `fabricationLevel >= minSkillLevel` (design ignorado)
  - `integral` además exige `fabricationLevel >= minSkillLevel`
- `calculateTechnicianScore` (componente E, experiencia):
  - `integral` → `min(designLevel, fabLevel)`
  - `solo_fabricacion` → `fabricationLevel`
  - `solo_diseno` → `designLevel`

## submitQuoteAction
- Firma nueva: `submitQuoteAction(invitationId, input: QuoteInput)` con `kind: 'flat' | 'split'`.
- Firma legacy `(invitationId, price, deliveryDays, notes?)` se mantiene como flat por retrocompatibilidad (tests, integraciones internas); no aplica validación estricta de coherencia con `serviceType`.
- Cuando el caller usa el objeto `QuoteInput`:
  - `integral` → solo acepta `kind: 'split'` (todos los campos > 0 y ≤ 365 días)
  - `solo_diseno` / `solo_fabricacion` → solo acepta `kind: 'flat'`
- Persiste totales en `quotedPrice/Days` y el desglose en `quotedDesignPrice/Days` + `quotedFabricationPrice/Days`. El evento UCH `OFERTA_ENVIADA` lleva el desglose en `payload`, no en `content`.

## Fabricación, despacho y cierre
- `transitionToManufacturingAction(caseId)` — pasa a `enFabricacion`, emite `FABRICACION_INICIADA`.
- `registerDispatchAction(caseId, { courier, trackingId, photos? })` — pasa a `enviado`, emite `CASO_DESPACHADO`.
- `confirmReceptionAction(caseId)` — dentista confirma recepción → `completado`, emite `RECEPCION_CONFIRMADA`.
- Estas tres viven en `cases.ts`. `startWorkAction` en `proposal.ts` bifurca según `serviceType` (ver abajo).

## approveWorkAction — cierre por tipo
- `solo_diseno` → `completado` (con `completedAt`, `currentResponsibility=null`).
- `integral` con CAM → `enFabricacion` (con `currentResponsibility='tecnico'`).
- `integral` sin CAM (legacy) → `disenoAprobado` (con `completedAt`).
- Mensaje UCH ajustado por rama.
- Si el caso queda en terminal (`completado` o `disenoAprobado`), llama `archiveCaseFilesBestEffort(caseId)` tras commit para marcar archivos con `customTime` (lifecycle GCS).

## startWorkAction — bifurcación por tipo
- `solo_fabricacion` → transición directa a `enFabricacion` y evento UCH `FABRICACION_INICIADA`.
- `solo_diseno` / `integral` → mantiene transición a `enEjecucion` con evento `TRABAJO_INICIADO`.

## Nomenclatura
- Funciones: `verbAction` (createCaseAction, updateSkillsAction, etc.)
- Constantes de estado: `CASE_STATUSES` en `lib/constants/dental.ts`
- Constantes de evento: `CASE_EVENTS` en `lib/constants/caseEvents.ts`
