# lib/db/ — Capa de datos (Drizzle ORM)

## Archivos clave
- `schema.ts` — Definición de todas las tablas. Fuente de verdad del modelo.
- `infrastructure.ts` — Conexión DB + runtime migrations (NO usar drizzle-kit push en producción). `INFRA_VERSION` actual: **v5.7**.
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

`getUserProfileDirect` (`actions/user.ts`) selecciona todos los campos de dirección para el perfil del usuario autenticado. `getCaseDetails` (`actions/cases.ts`) incluye los 6 campos del doctor en el join `doctor` para el badge de dirección y aplica el gate `getDoctorAddressDisclosure` (`caseListVisibility.ts`, v5.8), que devuelve `full | coarse | none`: **full** (técnico ganador asignado, admin, dentista dueño) recibe los 6 campos; **coarse** (cualquier otro técnico invitado al caso cuando `needsFabrication`) recibe solo país/región/comuna para cotizar el traslado y se anulan calle/número/oficina; **none** (resto) recibe los 6 en `null`. Para `coarse` el server consulta si el viewer tiene invitación al caso. Gate autoritativo en servidor; el cliente solo refuerza el render.

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
- Consumidos junto con la tabla `fauchard_holiday` por `addBusinessTime(from, days, hours, cfg, holidays)` para calcular `workDeadline` en `startWorkAction` y `buildProposalAction`. El reloj de feriado/horario aplica **solo** a `workDeadline` (no a la expiración de invitaciones ni de propuestas, que usan tiempo absoluto).

### `fauchardHoliday` (v4.6)
Lista global de feriados (no por config). Columnas: `holiday_date` (UNIQUE), `label`, `created_by`. Admin CRUD en `/dashboard/admin/fauchard` → panel Calendario. Actions en `lib/db/actions/fauchardHolidays.ts`.

### `caseUserArchive`
Archivo por usuario y caso (`case_user_archive`). Usado por `archiveCaseForUserAction` / `unarchiveCaseForUserAction` en terminal.

### Modelo de disponibilidad y sanción (v5.0)
Tablas y columnas detrás del flag `AVAILABILITY_MODEL_ENABLED` (inertes con el flag off). Ver `Doc Servicio Orquestado/`.

- **`technicianAvailability`** (`technician_availability`) — disponibilidad declarada, **modelo aplanado** (1 fila por técnico, unique en `user_id`). Columna `inactivity_reminder_sent_at` (v5.1) da idempotencia al recordatorio de inactividad del cron `process-availability`. Regla de elegibilidad **AND triple**: `levelGlobal ∧ level<Cad|Cam> ∧ cat<Categoria><Cad|Cam>`. 10 columnas hijas `cat_<categoria>_<cap>` para las 5 categorías canónicas (`coronas`, `inlays`, `puentes`, `protesis`, `guias` — ver `WORK_CATEGORIES` / `WORK_TYPE_TO_CATEGORY` en `lib/constants/dental.ts`). Los hijos se preservan aunque el padre esté OFF. Backfill condicional al flag: infiere CAD/CAM desde `technicianSkill` (design/fab level > 0).
- **`technicianNoResponseEvent`** (`technician_no_response_event`) — timestamps individuales de no-respuesta para la ventana rolling. `status`: `active | expired_window | pardoned`. FK `caseInvitationId` ON DELETE SET NULL. Sustituye al modelo binario `user.consecutiveNoResponse` cuando el flag está on.
- **`clinicalCase`** nuevas columnas: `pendingPoolCycleCount`, `pendingPoolStartedAt`, `pendingPoolCheckinSentAt` (cola `pendiente_pool` cuando Fauchard no halla elegibles) + `lastRevisionSubmittedAt` (reinicia el countdown `tDentistReviewHours` en cada entrega) + `reviewReminderSentAt`/`reviewOverdueNotifiedAt` (v5.2, idempotencia de la escalación de revisión; se reinician en cada entrega).
- **`caseInvitation`** nuevas columnas: `rejectionReasonId`/`rejectionComment`/`rejectedAt` (rechazo individual), `bulkRejectionReasonId`/`bulkRejectionComment` (rechazo masivo / auto-OFF), `isReplacement` (invitación de reemplazo automático). FKs a catálogos con ON DELETE RESTRICT.
- **`fauchardConfig`** nuevas columnas (defaults entre paréntesis): `tDentistReviewHours` (48), `tNoEligiblePoolHours` (24), `maxPoolCycles` (2), `replacementCutoffMinutes` (10), `noResponseWindowDays` (14), `noResponseRehabilitationDays` (30), `level1Threshold`/`level2Threshold`/`level3Threshold` (1/2/3), `inactivityAutoOffDays` (30), `inactivityReminderDays` (7), `alphaNoResponse` (0.250), `changeReason` (auditoría).

### `clinicalCaseEvent`
Log de todos los eventos UCH. Campos: `userId`, `type`, `action`, `content`, `payload` (jsonb), `stateChange` (jsonb), `createdAt`.

Convención de `payload`:
- `visibleTo`: `'dentista'` | `'tecnico'` | `'ambos'` | `'sistema'` — filtra visibilidad
- `presentationAuthor: 'fauchard'` — el receptor ve a Fauchard como emisor
- `invitationId` — acota el evento al hilo de esa invitación (aislamiento técnico)

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
- App code referencia **label** (`urgency === 'Alta'`, `RESTORATION_TO_WORK_TYPE[label]`). Nunca el code opaco.
- Reads (JOIN) aplanan: `material/restorationType/shade/urgency` = label. Los `*Code` opacos solo se exponen para selects que necesitan persistir code.

**Admin CRUD**: admin solo edita `label`. `code` se genera automáticamente como `${prefix}_${NNN}` (siguiente disponible).

**Catálogos de rechazo (v5.0)** — `invitationRejectionReason` (code `rej_NNN`, seed de 7) y `bulkRejectionReason` (code `brej_NNN`, seed de 5). Mismo patrón uniforme (code opaco + label editable + description nullable + sortOrder + isActive). Referenciados por FK desde `caseInvitation` (`rejection_reason_id` / `bulk_rejection_reason_id`, ON DELETE RESTRICT). El CRUD admin se cablea en Fase 3 (los `CatalogTableKey` se amplían en `catalogs.ts` en Fase 2).

Scripts one-time (ya aplicados): `migrate-catalogs-fk.ts`, `migrate-catalogs-opaque-codes.ts`, `migrate-recovery-v39.ts` (dedup catálogos + backfill FK + drop columnas text + retira `business_key`).

## Patrón Server Actions
<important>Todas las funciones retornan `{ success: boolean; data?: T; error?: string }`</important>
<important>Usar `getServerIdentity()` para userId/role — nunca leer JWT directamente</important>
<important>Validar role antes de cualquier mutación</important>

## actions/ clave

| Archivo | Responsabilidad |
|---------|----------------|
| `fauchard.ts` | Motor Fauchard: classifyCase, runFauchard, sendInvitations, submitQuote, evaluateQuotes, buildProposal |
| `cases.ts` | CRUD casos, publicar, archivar, clonar, fabricación/despacho/recepción, `logCaseEvent()`, `getCaseEventsAction`, `submitUserRatingAction` (calificación del dentista al técnico: `dimension: 'design' \| 'fabrication'`, escala 1–5, una reseña por caso+reviewer+dimension; actualiza `avgRating` del técnico; emite `CALIFICACION_ENVIADA`) |
| `proposal.ts` | acceptProposal, rejectInvitationOffer, startWork, withdrawQuote, expireDentistComparativeWindow |
| `invitations.ts` | Listado de invitaciones; archivos visibles solo si `invitation.status === confirmed` |
| `skills.ts` | Matriz habilidades; lee rol desde DB (no JWT). `toggleAvailabilityAction` (toggle legacy del perfil) escribe `user.is_available` y **espeja** a `technician_availability.level_global` (best-effort, solo si la fila existe) para mantener sincronizado el switch v5.0 |
| `files.ts` | Upload/download vía GCS signed URLs |
| `impersonation.ts` | `getServerIdentity()` — resolver canónico de identidad |
| `hubRead.ts` | Cursores de lectura del UCH (`markCaseAsReadAction`) + contadores no leídos. Actualiza `clinical_case_hub_read` (`lastReadTechHubAt` / `lastReadNegHubAt`); consumido por `lib/uchUnread.ts` |
| `dashboard.ts` | Métricas y agregados del dashboard |
| `admin.ts` | Operaciones admin (usuarios, orgs) |
| `user.ts` / `organization.ts` | Perfil, onboarding, organizaciones |
| `annotations.ts` | Anotaciones 3D en visor |
| `catalogs.ts` | Listas administrables del wizard (vita_shade, restoration_type, dental_material, urgency_level): list públicas + CRUD admin |
| `fauchardHolidays.ts` | CRUD de feriados globales (tabla `fauchard_holiday`, v4.6). Admin UI en `/dashboard/admin/fauchard` → FauchardCalendarPanel |
| `contactGuard.ts` | CRUD de reglas (regex/keyword) para moderar campos libres. Admin UI en `/dashboard/admin/contactguard`. Las reglas las consume `lib/contactGuard/guardOrFail.ts` en server actions de cotización, despacho y notas |
| `availability.ts` (v5.0) | Disponibilidad declarada del técnico. `computeEligibleAction` = regla **AND triple** (`levelGlobal ∧ level<cap> ∧ cat<cat><cap>`), en tiempo real. `getAvailabilityForUserAction` crea fila default (infiere CAD/CAM de skills). `updateAvailabilityLevelAction` (al cambiar el nivel `global` **espeja** a `user.is_available` para no divergir del toggle legacy), `getAllEligibleForCategoryCapacityAction`. Gated por `AVAILABILITY_MODEL_ENABLED` (lo consulta Fauchard) |
| `noResponseEvents.ts` (v5.0) | Sanción rolling: `recordNoResponseEventAction`, `getActiveEventsInWindowAction`, `expireEventsOutsideWindowAction` (cron), `pardonEventsAction` (admin), `computeLevelForTechnicianAction` (nivel 0–3 + nextExitDate). Reemplaza `user.consecutiveNoResponse` cuando el flag está on |
| `rejection.ts` (v5.0) | Rechazo explícito: `rejectInvitationIndividualAction` (§3.2), `rejectInvitationsBulkAction` (§3.1), `autoRejectOnAutoOffAction` (§3.2.bis). No cuenta como no-respuesta; dispara reemplazo si el flag está on |
| `replacement.ts` (v5.0) | `tryReplaceAfterRejectAction` — invita al siguiente elegible del pool scoreado tras un rechazo, respetando cutoff temporal (`replacementCutoffMinutes`) y truncando `expiresAt` al deadline del caso. NO se dispara por no-respuesta |
| `poolQueue.ts` (v5.0) | Cola `pendiente_pool`: `enterPendingPoolAction`, `processPendingPoolCheckInAction` (50% TTL, cron), `processPendingPoolExpirationAction` (re-encola o falla a `sin_cotizaciones_fallo`, cron), `cancelPendingPoolAction` (dentista/admin cierra el caso durante la espera), `triggerPoolReevaluationOnTechnicianOnAction` (event-driven). Importa Fauchard dinámicamente (evita ciclo) |
| `availabilityCron.ts` (v5.0/v5.1) | `processAvailabilityMaintenanceAction` — invocado por `/api/cron/process-availability` (cada hora). Expira no-respuestas fuera de ventana, auto-OFF preventivo (inactivo > `inactivityAutoOffDays`) y recordatorio (> `inactivityReminderDays`, idempotente vía `inactivity_reminder_sent_at`). Inerte con el flag off |
| `dentistReviewCron.ts` (v5.0/v5.2) | `processDentistReviewDeadlinesAction` — invocado por el mismo cron horario. Escala el countdown de revisión del dentista: recordatorio cuando queda ≤25% del plazo + aviso al vencer, **sin auto-acción**. Idempotente por entrega (`review_reminder_sent_at`/`review_overdue_notified_at`). Inerte con el flag off |
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

## Idempotencia crítica en Fauchard
- `evaluateQuotesAction` / `buildProposalAction`: guard `status === EN_EVALUACION`; `buildProposal` usa `UPDATE … WHERE status = enEvaluacion` (sin re-fijar `proposalExpiresAt`).
- `expirePendingInvitationsForCase` vs `tryEvaluateQuotesIfReady`: las **lecturas** solo expiran invitaciones; evaluación en `submitQuote`, cron y `checkAndExpireInvitationsAction`.
- Countdown 1: `expires_at` se fija en `sendInvitationsAction` (`tQuoteMinutes`); dedupe por técnico activo.
- Countdown 2: `proposalExpiresAt` se fija una vez en `buildProposalAction` (`tProposalHours`).
- Countdown 3 (v5.0): revisión del dentista — `tDentistReviewHours` (default 48); `clinical_case.last_revision_submitted_at` reinicia la ventana en cada entrega del técnico. Deadline wall-clock vía `getCaseReviewDeadlineAt(caseId)` (`caseDeadlines.ts`, gated), expuesto como `reviewDeadlineAt` en `getCaseDetails` y mostrado como HMS en la cabecera del UCH (dentista + técnico). **Sin auto-acción** al vencer: solo marca "Respuesta vencida" + escalación de notificaciones por cron (`processDentistReviewDeadlinesAction`, idempotente vía `review_reminder_sent_at`/`review_overdue_notified_at`, columnas v5.2 que `submitRevisionAction` reinicia).
- Ver `frontend/lib/db/caseDeadlines.ts`.

## Modelo de disponibilidad (v5.0) en Fauchard — gated por `AVAILABILITY_MODEL_ENABLED`
- **Elegibilidad**: antes del scoring, `runFauchardAction` aplica el AND triple (`computeEligibleAction(tech, categoría, capacidad)`) en cada `runFauchard` (sin caché del estado efectivo). La categoría se deriva del `workType` (`WORK_TYPE_TO_CATEGORY`); las capacidades del `serviceType` (solo_diseno→CAD, solo_fabricacion→CAM, integral→CAD∧CAM). Con el flag **off**, se mantiene el filtro legacy `consecutiveNoResponse >= 3`.
- **Score**: con el flag on, los α se re-normalizan (`lib/availabilityScore.ts → RENORMALIZED_ALPHAS`, `0.20·Q + 0.15·P + 0.15·E − 0.15·C + 0.10·B − 0.25·N`) manteniendo `|Σα|=1`. `N ∈ {0, 0.5, 1}` viene de `computeLevelForTechnicianAction`. αN sale de `fauchard_config.alpha_no_response`.
- **0 elegibles**: con el modelo on **y `POOL_PENDIENTE_ENABLED` on**, el caso entra a la cola `pendiente_pool` (`enterPendingPoolAction`) en vez de fallar; `runFauchardAction` retorna `{ pooled: true }` y el caller (publish/republish) deja el caso en `enEvaluacion`. `POOL_PENDIENTE_ENABLED` es el kill-switch secundario: apagado, Fauchard ignora la cola y falla directo a `sin_cotizaciones_fallo` aunque el modelo esté on.
- **Sanción**: `penalizeNoResponseAction(techId, invitationId)` — con el flag on registra un evento rolling, recalcula nivel y aplica Nivel 2 (email) / Nivel 3 (auto-OFF de `level_global` + `autoRejectOnAutoOffAction` + email). Con el flag off, mantiene `consecutiveNoResponse` + suspensión a las 3.
- Helpers expuestos para reemplazo/cola: `selectReplacementCandidateAction`, `isTechnicianEligibleForCaseAction`, `reevaluatePendingPoolCaseAction`.

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
