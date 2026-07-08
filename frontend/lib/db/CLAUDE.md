# lib/db/ — Capa de datos (Drizzle ORM)

## Archivos clave
- `schema.ts` — Definición de todas las tablas. Fuente de verdad del modelo.
- `infrastructure.ts` — Conexión DB + runtime migrations (NO usar drizzle-kit push en producción). `INFRA_VERSION` actual: **v5.13**.
- `index.ts` — Exporta instancia `db`
- `catalogResolver.ts` — resuelve `code`/`label` de catálogos UI → `*_id` antes de persistir.

**Helpers de la capa de datos** (viven en `lib/db/`, **no** en `actions/`; no son server actions):
- `caseDeadlines.ts` — deadlines wall-clock de los countdowns (`getCaseQuoteDeadlineAt`, `getCaseReviewDeadlineAt`).
- `archiveCaseFiles.ts` — `archiveCaseFilesBestEffort(caseId)` (marca `customTime` en GCS al cerrar el caso).
- `caseListVisibility.ts` — predicados de visibilidad: `buildActiveCaseVisibilityWhere`, `userCanAccessClinicalCase` y `getDoctorAddressDisclosure` (gate de dirección del dentista en tres niveles `full | coarse | none`, v5.8).
- `caseListQueryBuilder.ts` — armado de queries del listado de casos.
- `caseUserArchiveHelpers.ts` — helpers de archivado por usuario (`case_user_archive`).

## Tablas principales

### `user`
Perfil del usuario. Campos de ubicación (v5.7, todos `TEXT` nullable):
- `country` — código de país (`CL`, `AR`, `CO`, `BR`, `PE`, `BO`, `UY`, `EC`, `MX`)
- `region` — código de región (ej. `CL-RM`)
- `comuna` — código de comuna (ej. `CL-RM-SAN`)
- `address` — nombre de calle
- `address_number` — número de calle
- `address_office` — número de oficina / depto

Otros campos relevantes: `role`, `is_available`, `consecutive_no_response`, `onboarding_step`, `league_level`, `league_transition_started_at`, `league_demotion_watch_since`.

`getUserProfileDirect` (`actions/user.ts`) selecciona todos los campos de dirección para el perfil del usuario autenticado. `getCaseDetails` (`actions/cases.ts`) incluye los 6 campos del doctor en el join `doctor` para el badge de dirección y aplica el gate `getDoctorAddressDisclosure` (`caseListVisibility.ts`, v5.8), que devuelve `full | coarse | none`: **full** (técnico ganador asignado, admin, dentista dueño) recibe los 6 campos; **coarse** (cualquier otro técnico con asignación al caso cuando `needsFabrication`, legacy fabricación) recibe solo país/región/comuna; **none** (resto) recibe los 6 en `null`. Para `coarse` el server consulta si el viewer tiene asignación al caso. Gate autoritativo en servidor; el cliente solo refuerza el render.

### `clinicalCase`
**Flujo v2 activo (`solo_diseno`):** `borrador → enEvaluacion → aceptadaPendienteInicio → enEjecucion → enRevision [→ cambiosEnProceso] → completado`

Durante `enEvaluacion`, `internalStatus` puede ser `asignacionPendiente` (técnico debe aceptar) o `pendiente_pool` (sin elegibles). El caso **no** pasa por `propuestaLista` en flujos nuevos.

**Legacy:** `propuestaLista` (comparativo), `disenoAprobado`, `enFabricacion`, `enviado` — solo casos históricos con `integral`/`solo_fabricacion`.

Campos clave:
- `serviceType`: `solo_diseno` | `solo_fabricacion` | `integral` — fuente de verdad del tipo de servicio
- `needsFabrication`: boolean (`true` para `integral` y `solo_fabricacion`; mantenido por retrocompatibilidad)
- `listPriceCost`, `listPriceSale`, `listPriceFeePercent`, `listPriceRuleId`: precio de catálogo anclado al publicar
- `proposedPrice`, `proposedDeliveryDays`: acuerdo final (v2: desde catálogo en `acceptAssignmentAction`; legacy: cotización)
- `workDeadline`: fecha de entrega comprometida = `desiredDeliveryAt` (fallback: `publishedAt + deadlineDays`). Helper: `lib/cases/workDeadline.ts`
- `fauchardConfigId`: config Fauchard anclada al publicar (copy-on-write admin)
- `internalStatus`: estados internos granulares para el motor (no visible al usuario)
- `derivedWorkType`, `derivedCategory`, `replacesMissingTeeth` (v5.13): clasificación Fauchard

### `case_assignment` (v2 activo — alias Drizzle `caseInvitation`)
Una fila por **asignación** técnico↔caso (top-1, no N invitados). Status: `pending | accepted | rejected | expired`

Campos v2:
- `compensation`: precio al técnico (desde `listPriceCost` + fee)
- `deadlineDays`: plazo derivado de `desiredDeliveryAt`
- `expiresAt`: ventana para aceptar (`tQuoteMinutes`)
- `isReplacement`: asignación de reemplazo tras rechazo
- `rejectionReasonId`/`rejectionComment`/`rejectedAt`: rechazo individual
- `bulkRejectionReasonId`/`bulkRejectionComment`: rechazo masivo / auto-OFF

### `caseInvitation` (legacy — misma tabla física)
La tabla `case_invitation` persiste datos históricos de cotización múltiple. Campos `quoted*` solo relevantes para casos v1:
- `quotedPrice`, `quotedDays`: totales canónicos (legacy comparativo). Desglose `quotedDesign*`/`quotedFabrication*` solo para `integral`.
- `techNotes`, `dentistRejectionFeedback`

### `technicianSkill`
Habilidades del técnico por `workType`: `designLevel` y `fabricationLevel` (0–7 cada uno).
El motor Fauchard usa estos niveles para filtrar y puntuar candidatos a asignación.

### `fauchardConfig`
Parámetros del algoritmo. **Como máximo una fila `is_active`** (índice único parcial). El admin actualiza con copy-on-write: nueva fila + desactivar la anterior. Cada `clinicalCase` puede anclar `fauchardConfigId` al publicar.

Columnas legacy `business_*` (v4.6) permanecen con defaults pero **no se usan en runtime** (calendario retirado del configurador).

### `fauchardHoliday` (v4.6, inerte)
Lista global de feriados. Tabla y actions en `fauchardHolidays.ts` permanecen por datos históricos; sin UI admin ni consumo en runtime.

### `caseUserArchive`
Archivo por usuario y caso (`case_user_archive`). Usado por `archiveCaseForUserAction` / `unarchiveCaseForUserAction` en terminal.

### Modelo de disponibilidad y sanción (v5.0)
Tablas y columnas del modelo de disponibilidad (comportamiento único del motor; el flag `AVAILABILITY_MODEL_ENABLED` fue retirado). Ver `Doc Servicio Orquestado/`.

- **`technicianAvailability`** (`technician_availability`) — disponibilidad declarada, **modelo aplanado** (1 fila por técnico, unique en `user_id`). Columna `inactivity_reminder_sent_at` (v5.1) da idempotencia al recordatorio de inactividad del cron `process-availability`. Regla de elegibilidad **AND triple**: `levelGlobal ∧ level<Cad|Cam> ∧ cat<Categoria><Cad|Cam>`. 14 columnas hijas `cat_<categoria>_<cap>` para las **7 categorías canónicas** v5.13 (`coronas`, `inlays`, `carillas`, `puentes`, `full_arch`, `protesis`, `guias` — ver `WORK_CATEGORIES` / `WORK_TYPE_TO_CATEGORY` en `lib/constants/dental.ts`). Los hijos se preservan aunque el padre esté OFF. Backfill idempotente: infiere CAD/CAM desde `technicianSkill` (design/fab level > 0).
- **`clinical_case` v5.13**: `replaces_missing_teeth` (boolean, NULL legacy), `derived_work_type`, `derived_category` (poblados en `classifyCaseAction` / `reclassifyCaseDraftAction`).
- **`technicianNoResponseEvent`** (`technician_no_response_event`) — timestamps individuales de no-respuesta para la ventana rolling. `status`: `active | expired_window | pardoned`. FK `caseInvitationId` ON DELETE SET NULL. Sustituye al modelo binario `user.consecutiveNoResponse` (columna legacy, sin escritura nueva).
- **`clinicalCase`** nuevas columnas: `pendingPoolCycleCount`, `pendingPoolStartedAt`, `pendingPoolCheckinSentAt` (cola `pendiente_pool` cuando Fauchard no halla elegibles) + `lastRevisionSubmittedAt` (reinicia el countdown `tDentistReviewHours` en cada entrega) + `reviewReminderSentAt`/`reviewOverdueNotifiedAt` (v5.2, idempotencia de la escalación de revisión; se reinician en cada entrega).
- **`case_assignment`** nuevas columnas: `rejectionReasonId`/`rejectionComment`/`rejectedAt` (rechazo individual), `bulkRejectionReasonId`/`bulkRejectionComment` (rechazo masivo / auto-OFF), `isReplacement` (asignación de reemplazo automático). FKs a catálogos con ON DELETE RESTRICT.
- **`fauchardConfig`** nuevas columnas (defaults entre paréntesis): `tDentistReviewHours` (48), `tNoEligiblePoolHours` (24), `maxPoolCycles` (2), `replacementCutoffMinutes` (10), `noResponseWindowDays` (14), `noResponseRehabilitationDays` (30), `level1Threshold`/`level2Threshold`/`level3Threshold` (1/2/3), `inactivityAutoOffDays` (30), `inactivityReminderDays` (7), `alphaNoResponse` (0.250), `changeReason` (auditoría).

### `clinicalCaseEvent`
Log de todos los eventos UCH. Campos: `userId`, `type`, `action`, `content`, `payload` (jsonb), `stateChange` (jsonb), `createdAt`.

Convención de `payload`:
- `visibleTo`: `'dentista'` | `'tecnico'` | `'ambos'` | `'sistema'` — filtra visibilidad
- `presentationAuthor: 'fauchard'` — el receptor ve a Fauchard como emisor
- `invitationId` — acota el evento al hilo de esa asignación (aislamiento técnico; nombre de campo legacy)

### `review` (v5.3)
Calificaciones del dentista al técnico por caso y fase. Columnas clave: `clinicalCaseId`, `reviewerId`, `revieweeId`, `rating` (1–5), `dimension` (`'design'` | `'fabrication'`), `comment` (nullable). Índice único `(clinical_case_id, reviewer_id, dimension)` — una sola reseña por caso por fase. Las calificaciones alimentan el componente Q del score Fauchard y la lógica de ascenso/descenso de ligas (motor usa `avgRating`). Acción: `submitUserRatingAction` en `cases.ts`.

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
- App code referencia **label** (`urgency === 'Alta'`, `resolveWorkType` / `resolveScenario` en `lib/fauchard/caseWorkType.ts`). Nunca el code opaco.
- Reads (JOIN) aplanan: `material/restorationType/shade/urgency` = label. Los `*Code` opacos solo se exponen para selects que necesitan persistir code.

**Admin CRUD**: admin solo edita `label`. `code` se genera automáticamente como `${prefix}_${NNN}` (siguiente disponible).

**Catálogos de rechazo (v5.0)** — `invitationRejectionReason` (code `rej_NNN`, seed de 7) y `bulkRejectionReason` (code `brej_NNN`, seed de 5). Mismo patrón uniforme (code opaco + label editable + description nullable + sortOrder + isActive). Referenciados por FK desde `caseInvitation` (`rejection_reason_id` / `bulk_rejection_reason_id`, ON DELETE RESTRICT). El CRUD admin se cablea en Fase 3 (los `CatalogTableKey` se amplían en `catalogs.ts` en Fase 2).

Scripts one-time (ya aplicados): `migrate-catalogs-fk.ts`, `migrate-catalogs-opaque-codes.ts`, `migrate-recovery-v39.ts` (dedup catálogos + backfill FK + drop columnas text + retira `business_key`).

## Patrón Server Actions
<important>Todas las funciones retornan `{ success: boolean; data?: T; error?: string }`</important>
<important>Usar `getServerIdentity()` para userId/role — nunca leer JWT directamente</important>
<important>Validar role antes de cualquier mutación</important>

## actions/ clave

### Motor activo (v2 — asignación directa)

| Archivo | Responsabilidad |
|---------|----------------|
| `assignment.ts` | **Motor principal:** `classifyCaseAction`, `runAssignmentAction`, `assignCaseAction`, `acceptAssignmentAction`, `rankAssignmentCandidates`, `buildEligiblePoolForScenario`, `rankCandidatesForScenario`, `simulateAssignmentAction` (precio + ranking + `chainPosition`/`retryChainDetails`) |
| `poolQueue.ts` (v5.0) | Cola `pendiente_pool`: `enterPendingPoolAction`, `processPendingPoolReevaluationAction` (cron, asigna si hay elegibles + evento `CASO_EN_COLA`), `processPendingPoolCheckInAction` (50% TTL), `processPendingPoolExpirationAction` (re-encola o falla a `sin_asignacion_fallo`/`sin_cotizaciones_fallo`), `cancelPendingPoolAction`, `triggerPoolReevaluationOnTechnicianOnAction` |
| `replacement.ts` (v5.0) | `tryReplaceAfterRejectAction` — asigna al siguiente del ranking tras rechazo, respetando `replacementCutoffMinutes` y `maxAssignmentAttempts`. NO se dispara por no-respuesta |
| `rejection.ts` (v5.0) | `rejectInvitationIndividualAction` (rechazar asignación), `rejectInvitationsBulkAction`, `autoRejectOnAutoOffAction` |
| `cases.ts` | CRUD casos, `publishCaseAction` (orquesta classify → runAssignment → assign), archivar, clonar, `logCaseEvent()`, `getCaseEventsAction`, `submitUserRatingAction` |
| `availability.ts` (v5.0) | `computeEligibleAction` = regla **AND triple** |
| `noResponseEvents.ts` (v5.0) | Sanción rolling 14d |
| `availabilityCron.ts` (v5.0/v5.1) | Cron horario disponibilidad + revisión dentista |
| `fauchard.ts` | `getFauchardMetricsAction` (métricas `case_assignment`); `simulateFauchardAction` delega a `simulateAssignmentAction`; `runFauchardAction` solo reactivación pool legacy |

### Soporte y admin

| Archivo | Responsabilidad |
|---------|----------------|
| `proposal.ts` | `startWorkAction`, `acceptProposalAction` (legacy), `rejectInvitationOffer`, `withdrawQuote`, `expireDentistComparativeWindow` |
| `invitations.ts` | Listado de asignaciones pendientes para técnicos; archivos visibles si `status === accepted` |
| `skills.ts` | Matriz habilidades; lee rol desde DB (no JWT). `toggleAvailabilityAction` (toggle legacy del perfil) escribe `user.is_available` y **espeja** a `technician_availability.level_global` (best-effort, solo si la fila existe) para mantener sincronizado el switch v5.0 |
| `files.ts` | Upload/download vía GCS signed URLs |
| `impersonation.ts` | `getServerIdentity()` — resolver canónico de identidad |
| `hubRead.ts` | Cursores de lectura del UCH (`markCaseAsReadAction`) + contadores no leídos. Actualiza `clinical_case_hub_read` (`lastReadTechHubAt` / `lastReadNegHubAt`); consumido por `lib/uchUnread.ts` |
| `dashboard.ts` | Métricas y agregados del dashboard |
| `admin.ts` | Operaciones admin (usuarios, orgs) |
| `user.ts` / `organization.ts` | Perfil, onboarding, organizaciones |
| `annotations.ts` | Anotaciones 3D en visor |
| `catalogs.ts` | Listas administrables del wizard (vita_shade, restoration_type, dental_material, urgency_level): list públicas + CRUD admin |
| `fauchardHolidays.ts` | CRUD legacy de feriados (`fauchard_holiday`, v4.6). Deprecated — sin UI ni runtime |
| `contactGuard.ts` | CRUD de reglas (regex/keyword) para moderar campos libres. Admin UI en `/dashboard/admin/contactguard`. Las reglas las consume `lib/contactGuard/guardOrFail.ts` en server actions de cotización, despacho y notas |
| `availability.ts` (v5.0) | Disponibilidad declarada del técnico. `computeEligibleAction` = regla **AND triple** (`levelGlobal ∧ level<cap> ∧ cat<cat><cap>`), en tiempo real. `getAvailabilityForUserAction` crea fila default (infiere CAD/CAM de skills). `updateAvailabilityLevelAction` (al cambiar el nivel `global` **espeja** a `user.is_available` para no divergir del toggle legacy), `getAllEligibleForCategoryCapacityAction`. Fauchard lo consulta en cada corrida |
| `noResponseEvents.ts` (v5.0) | Sanción rolling: `recordNoResponseEventAction`, `getActiveEventsInWindowAction`, `expireEventsOutsideWindowAction` (cron), `pardonEventsAction` (admin), `computeLevelForTechnicianAction` (nivel 0–3 + nextExitDate). Reemplaza al legacy `user.consecutiveNoResponse` |
| `rejection.ts` (v5.0) | *(ver Motor activo arriba)* |
| `replacement.ts` (v5.0) | *(ver Motor activo arriba)* |
| `poolQueue.ts` (v5.0) | *(ver Motor activo arriba)* |
| `availabilityCron.ts` (v5.0/v5.1) | `processAvailabilityMaintenanceAction` — invocado por `/api/cron/process-availability` (cada hora). Expira no-respuestas fuera de ventana, auto-OFF preventivo (inactivo > `inactivityAutoOffDays`) y recordatorio (> `inactivityReminderDays`, idempotente vía `inactivity_reminder_sent_at`) |
| `dentistReviewCron.ts` (v5.0/v5.2) | `processDentistReviewDeadlinesAction` — invocado por el mismo cron horario. Escala el countdown de revisión del dentista: recordatorio cuando queda ≤25% del plazo + aviso al vencer, **sin auto-acción**. Idempotente por entrega (`review_reminder_sent_at`/`review_overdue_notified_at`) |
| `league.ts` (v5.5) | Motor de ligas (Fase 2): ascenso (triple criterio + ventana de transición penalizada), descenso (rating bajo sostenido), consolidación. Escribe estado en `user` + auditoría en `league_change_event`. `getLeagueEngineEnabledAction` expone el flag. Gated por `LEAGUE_ENGINE_ENABLED` |
| `leagueCron.ts` (v5.5) | `processLeagueMaintenanceAction` — invocado por `/api/cron/process-league` (diario) y por el scheduler in-process local (`lib/localCron.ts`). Recorre técnicos y aplica ascenso/descenso/consolidación. Inerte con el flag off |
| `observability.ts` (v5.0) | Métricas del dashboard de observabilidad admin (`/dashboard/admin/observability`, `ObservabilityPanel`, 13 métricas con Recharts). Solo lectura |
| `userPreferences.ts` | Preferencias del usuario (p. ej. tema persistido) |
| `test-identity.ts` | Stub de identidad para tests de server actions (guard que falla fuera de modo test) |

## getCaseEventsAction — pipeline de entrega al cliente
1. Filtra eventos por visibilidad de rol (via `filterCaseEventsForUchViewer`).
2. Enriquece payload de cotizaciones rechazadas con snapshot de `caseInvitation`.
3. Firma URLs de avatares (GCS).
4. Para cada evento: `shouldPresentUchEventAsFauchard` → si true, sustituye `user` por `UCH_FAUCHARD_PUBLIC_USER` y limpia `presentationAuthor` del payload con `sanitizeUchPayloadForViewer`.
5. Admin recibe identidades reales sin enmascarado.

### Regla de visibilidad `CALIFICACION_ENVIADA` en `caseEventsUchFilter.ts`
Los eventos de calificación (`action === 'CALIFICACION_ENVIADA'`) tienen visibilidad especial **dentro del carril técnico**:
- El **técnico calificado** (`payload.revieweeId === identity.id`) sí lo ve.
- Cualquier otro técnico invitado/perdedor **no** lo ve aunque tenga `visibleTo:'ambos'`.
- Fallback para eventos sin `revieweeId` (legacy): usa `targetCase.assignedTechnicianId`.
- El dentista autor y admin siempre lo ven (ramas anteriores en el filtro).
- El campo `ratingComment` se oculta al técnico vía `sanitizeUchPayloadForViewer`.

## Idempotencia y countdowns (v2)
- **Lecturas** (`getCaseDetails`, `listCasesByOrganization`): solo expiran asignaciones vencidas — **no** re-ejecutan motor ni resetean deadlines.
- **Countdown 1 (aceptación):** `expires_at` se fija en `assignCaseAction` (`tQuoteMinutes`).
- **Countdown revisión (v5.0):** `tDentistReviewHours`; `last_revision_submitted_at` reinicia la ventana en cada entrega. Wall-clock vía `getCaseReviewDeadlineAt(caseId)`.
- Ver `frontend/lib/db/caseDeadlines.ts`.

### Legacy — comparativo (solo casos v1 en BD)
- `evaluateQuotesAction` / `buildProposalAction`: guard `status === EN_EVALUACION`; `proposalExpiresAt` en `propuestaLista`.
- Cron `/api/cron/evaluate-quotes` (cada 5 min) para casos históricos con cotizaciones.

## Modelo de disponibilidad (v5.0) en Fauchard
- **Elegibilidad**: antes del scoring, `runAssignmentAction` aplica el AND triple (`computeEligibleAction(tech, categoría, capacidad)`) en cada corrida (sin caché). La categoría se deriva del `workType` (`WORK_TYPE_TO_CATEGORY`); capacidad CAD para `solo_diseno`.
- **Score (activo)**: `computeAssignmentScore` en `lib/fauchard/assignmentScore.ts` — Q/P/E/B/L/N con pesos de `fauchard_config` vía `parseAssignmentWeights`.
- **0 elegibles**: con `POOL_PENDIENTE_ENABLED` on, el caso entra a `pendiente_pool` (`enterPendingPoolAction`); `runAssignmentAction` retorna `{ pooled: true }`. Con pool off → `sin_asignacion_fallo`.
- **Sanción**: `penalizeNoResponseAction` — evento rolling, niveles 1/2/3.
- Helpers: `selectReplacementCandidateAction`, `isTechnicianEligibleForCaseAction`, `reevaluatePendingPoolCaseAction`.

## Legacy (appendix — no usar en flujos nuevos)
- **Cotización múltiple:** `runFauchardAction`, `sendInvitationsAction`, `submitQuoteAction`, `evaluateQuotesAction`, `buildProposalAction`, `acceptProposalAction`, `checkAndExpireInvitationsAction`.
- **Fabricación:** `transitionToManufacturingAction`, `registerDispatchAction`, `confirmReceptionAction` (`integral`/`solo_fabricacion`).
- Status `quoted` en `case_invitation` para datos históricos.

## submitQuoteAction (legacy)
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

## Mantenedor de precios (`price_rule`, v5.8 · auditoría v5.10 · código v5.11 · cascada v5.12)

- Tabla `price_rule`: reglas con dimensiones opcionales (NULL = comodín) y **`code` opaco** (`prc_001`, …). Lookup regresivo en `lib/pricing/resolveListPrice.ts` (sin cambios en runtime).
- **Validación dimensiones (v5.12):** `lib/pricing/priceRuleDimensions.ts` — restauración obligatoria; cascada **Restauración → Urgencia → Material → Color** sin huecos. Patrones válidos: `R·*·*·*`, `R·U·*·*` (seed), `R·U·M·*`, `R·U·M·S`. Validación en `createPriceRuleAction` / `updatePriceRuleAction` / `resolvePendingPriceRequestAction`. Reglas legacy siguen resolviendo hasta editarse (badge «Revisar» en UI).
- Tabla `price_rule_request`: cola de combinaciones sin precio al crear casos.
- Snapshot congelado en `clinical_case`: `list_price_cost`, `list_price_fee_percent`, `list_price_sale`, `desired_delivery_at`.
- **Delete (v5.11):** `deletePriceRuleAction` solo si ningún caso referencia `list_price_rule_id`; si hay vínculos, solo editar/bloquear/historial.
- **Búsqueda UI:** `lib/pricing/priceRuleSearch.ts` — filtro client por código, restauración, material, color, urgencia.
- **Simulador precio:** `resolveListPriceAction` usa `restorationType` como **code** (`rest_001`), no label.
- **Auditoría (v5.10+):** tabla `price_rule_change_event` — acciones incluyen `deleted`. Motivo obligatorio en mutaciones admin. Helpers: `lib/pricing/priceRuleAudit.ts`. Lectura: `listPriceRuleChangeLogAction`.
- Admin UI: `/dashboard/admin/prices` (pestañas Reglas / Historial; búsqueda; ordenación; cascada en formulario; avisos de jerarquía; preview «Probar combinación»; eliminar si sin casos vinculados). Actions: `lib/db/actions/priceRules.ts`.

**Seed one-time** (matriz **R·U·*·*** = restauración × urgencia; material y color = `*`; costo 5000 / fee 15% / venta 5750):

```bash
cd frontend && npx tsx scripts/seed-price-rules.ts          # solo inserta faltantes
cd frontend && npx tsx scripts/seed-price-rules.ts --reset  # borra todas y re-seed
```

Idempotente sin `--reset`: re-ejecutar solo inserta combinaciones nuevas si el admin agregó restauraciones o urgencias al catálogo.
