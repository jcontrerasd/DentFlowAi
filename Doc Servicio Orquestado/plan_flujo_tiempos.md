# Plan de implementación — Flujo de tiempos, disponibilidad y sanciones

> Plan técnico derivado del doc funcional [flujo_tiempos.md](flujo_tiempos.md).

## Context

El doc funcional define 43 decisiones que reemplazan el modelo binario de exclusión (`consecutiveNoResponse >= 3`) por un sistema gradual con disponibilidad declarada en 3 niveles, sanción rolling 14 días con curva escalonada, rechazo explícito de invitaciones, reemplazo automático, cola `pendiente_pool` cuando no hay oferta, revisión del dentista con countdown nuevo, y panel admin Fauchard con parámetros configurables y observabilidad. Todo gobernado por un patrón copy-on-write con auditoría obligatoria.

El cambio toca cuatro capas (BD, motor Fauchard, panel admin, UI del técnico) y reemplaza lógica core que hoy funciona en producción. Hacerlo en una rama larga monolítica es alto riesgo. Por eso el plan es **incremental por capas**, con cada fase entregando valor independiente y validable, y con la capacidad de detenerse o revertir en cualquier punto.

## Decisión arquitectural — EmailJS

Se vuelve a la decisión original del doc funcional: usar **EmailJS** en lugar de Resend, motivado por la ausencia de dominio propio verificado (requisito de Resend para enviar a destinatarios distintos del owner de la cuenta).

**Credenciales** (mismas para local, staging y producción según indicación del usuario):

| Variable | Valor |
|---|---|
| `EMAILJS_SERVICE_ID` | `service_dentflowai` |
| `EMAILJS_TEMPLATE_ID` | `te60drn` |
| `EMAILJS_PUBLIC_KEY` | `IWyP-7o2SB3zInN01` |

**Contrato del template** (`te60drn`):
- `{{subject}}` — generado por el sistema.
- `{{to_email}}` — viene del perfil del usuario destinatario (`user.email`).
- `{{body}}` — HTML o texto plano según el tipo de notificación.
- Sender fijo: `DentFlowAi` (configurado en el template).

**Decisión técnica clave**: el SDK oficial `@emailjs/browser` está pensado para ejecución desde navegador, pero invocarlo así expondría la `public_key` al bundle del cliente y mezclaría responsabilidades. **El plan usa la API REST de EmailJS desde server actions** (POST a `https://api.emailjs.com/api/v1.0/email/send`), manteniendo las 3 credenciales como env vars server-only (sin prefijo `NEXT_PUBLIC_*`).

**Migración respecto a Resend existente**: hay que reemplazar el contenido de [frontend/lib/services/notifications.ts](frontend/lib/services/notifications.ts), que hoy usa `import { Resend } from 'resend'`. Los 17 tipos existentes mantienen sus disparadores; cambia solo el transport interno (wrapper EmailJS en lugar del cliente Resend). `RESEND_API_KEY` y `NOTIFICATION_FROM_EMAIL` quedan obsoletas y se retiran de `.env.example` y `deploy.sh`.

## Feature flag maestro

Todo el sistema nuevo vive detrás del flag `AVAILABILITY_MODEL_ENABLED` (default `false`). Patrón: `process.env.AVAILABILITY_MODEL_ENABLED === 'true'`. Permite mergear código a `develop` sin activar comportamiento. Una vez encendido en producción, el rollback es bajarlo a `false`.

Flags secundarios por fase:
- `AVAILABILITY_UI_TECNICO_ENABLED` — oculta panel del técnico (Fase 4).
- `AVAILABILITY_ADMIN_PANEL_ENABLED` — oculta panel admin nuevo (Fase 3).
- `REJECTION_INDIVIDUAL_ENABLED` — oculta acción de rechazo individual (Fase 5).
- `POOL_PENDIENTE_ENABLED` — Fauchard ignora cola y falla directo cuando 0 elegibles (Fase 6).

---

## Política transversal — Actualización de documentación del proyecto

Cada fase del plan incluye un paso final **"Documentación"** que actualiza los archivos canónicos de guía del repo. Esto asegura que `CLAUDE.md`, `AGENTS.md`, skills de Cursor y READMEs queden sincronizados con el avance del código.

Archivos que se tocan según la fase:

| Archivo | Propósito | Fases que tocan |
|---|---|---|
| [CLAUDE.md](../CLAUDE.md) (raíz) | Guía canónica del monorepo: stack, estructura, flujo Fauchard, catálogos, restricciones críticas | 1, 2, 3, 4, 5, 6 |
| [frontend/CLAUDE.md](../frontend/CLAUDE.md) | Convenciones Next.js, autenticación, tema, wizard, scripts | 4 |
| [frontend/lib/db/CLAUDE.md](../frontend/lib/db/CLAUDE.md) | Schema DB, server actions clave, idempotencia Fauchard, catálogos. **Más impactado**. | 1, 2 |
| [frontend/app/CLAUDE.md](../frontend/app/CLAUDE.md) (si existe) | Rutas y layout | 3, 4 |
| [frontend/components/CLAUDE.md](../frontend/components/CLAUDE.md) (si existe) | Convenciones de componentes | 3, 4, 5, 6 |
| [AGENTS.md](../AGENTS.md) (raíz) + [frontend/AGENTS.md](../frontend/AGENTS.md) | Puente corto para Cursor | 2, 5 |
| `.cursor/skills/uch-reglas-diseno-dentflowai` | Skill UCH para Cursor | 5, 6 |
| [README.md](../README.md) (raíz) + [frontend/README.md](../frontend/README.md) | Stack y features visibles | 7 |
| [Doc/Ciclo_Desarrollo.md](../Doc/Ciclo_Desarrollo.md) | Flujo de desarrollo y deploy | 1 (si cambian seeds o env vars), 7 |
| [frontend/.env.example](../frontend/.env.example) | Variables de entorno documentadas | 0, 7 |

Regla práctica: si una fase agrega tablas, columnas, server actions, componentes, rutas, flags o variables de entorno → ese ítem se documenta antes de cerrar la fase. Si la fase modifica una afirmación que ya está en un `CLAUDE.md` (ej. "Reloj de feriado/horario aplica también a expiración de invitaciones y propuestas" en `frontend/lib/db/CLAUDE.md` queda obsoleto en Fase 4 del doc funcional, sección 4.4), se corrige en la fase correspondiente.

---

## Fase 0 — Preparación (1 día)

### Objetivo
Alinear doc funcional con EmailJS (manteniendo decisión original), agregar credenciales, definir feature flags, validar el envío end-to-end con un email de prueba.

### Cambios
1. **Editar [flujo_tiempos.md](flujo_tiempos.md) sección 9** (si quedó algo desalineado):
   - **Importante**: si en una iteración previa la sección 9 fue cambiada a Resend, revertirla a EmailJS (decisión final del usuario por ausencia de dominio propio).
   - Confirmar que las 3 credenciales y el contrato del template estén explícitos.
   - Eliminar la nota intermedia que mencionaba `VITE_*` / Next.js (ya resuelto por el uso de API REST desde server actions).

2. **`.env.local` y `.env.example`**:
   - Agregar `EMAILJS_SERVICE_ID=service_dentflowai`, `EMAILJS_TEMPLATE_ID=te60drn`, `EMAILJS_PUBLIC_KEY=IWyP-7o2SB3zInN01`.
   - Marcar `RESEND_API_KEY` y `NOTIFICATION_FROM_EMAIL` como **obsoletas** (mantener temporalmente con comentario "deprecated — usar EmailJS" hasta que Fase 2 retire el código que las consume).
   - Agregar `AVAILABILITY_MODEL_ENABLED`, `AVAILABILITY_UI_TECNICO_ENABLED`, `AVAILABILITY_ADMIN_PANEL_ENABLED`, `REJECTION_INDIVIDUAL_ENABLED`, `POOL_PENDIENTE_ENABLED` (todos `false` por default).

3. **`deploy.sh`**: agregar las 3 variables EmailJS al bloque `--update-env-vars` y retirar `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL` cuando Fase 2 complete el corte. En esta fase basta con agregarlas — las viejas pueden coexistir.

4. **`frontend/lib/constants/availabilityFlags.ts`** (nuevo): helpers `isAvailabilityEnabled()`, `isAvailabilityUiTecnicoEnabled()`, `isAvailabilityAdminPanelEnabled()`, `isRejectionIndividualEnabled()`, `isPoolPendienteEnabled()`. Cada uno lee `process.env.X === 'true'`.

5. **Prueba sanity de EmailJS** (10 min): script ad-hoc `frontend/scripts/test-emailjs.ts` que envía un email de prueba a `dentflowai.oficial@gmail.com` usando la API REST. Confirma que las credenciales funcionan **antes** de empezar Fase 1. Si falla aquí, todo el plan se bloquea por motivo externo (rate limit, template caído, key revocada).

### Tests
- Smoke: verificar que la app sigue construyendo (`npm run validate:full`).
- Test nuevo (`test/availability-flags.test.ts`): asegurar que cada helper retorna false por default y true cuando la env var es 'true'.
- Ejecutar `npx tsx scripts/test-emailjs.ts` y confirmar email recibido.

### Documentación
- **`.env.example`**: agregar las 3 variables `EMAILJS_*` y los 5 flags de availability con comentario breve. Marcar `RESEND_API_KEY` y `NOTIFICATION_FROM_EMAIL` como deprecadas.

### Tests
- Smoke: verificar que la app sigue construyendo (`npm run validate:full`).
- Test nuevo (`test/availability-flags.test.ts`): asegurar que cada helper retorna false por default y true cuando la env var es 'true'.

### Rollback
N/A — solo doc y flags off.

---

## Fase 1 — BD + migraciones (2–3 días)

### Objetivo
Crear todas las tablas, columnas y seed de catálogos. La DB queda lista para los actions de fases posteriores.

### Patrón
Toda la migración va en [../frontend/lib/db/infrastructure.ts](../frontend/lib/db/infrastructure.ts) siguiendo el patrón existente: SQL inline con `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `INSERT ... ON CONFLICT DO NOTHING`. Bump `INFRA_VERSION` a `'v5.0'`.

### Cambios

1. **Nuevas tablas** (referencia: sección 6.2 del doc funcional):

   - **`technician_availability`** — almacena los 3 niveles por técnico:
     - `id`, `user_id` (FK users), `level_global` (bool), `level_cad` (bool), `level_cam` (bool), 10 columnas booleanas `cat_<categoria>_cad/cam`, `updated_at`.
     - Alternativa más normalizada: tabla padre `technician_availability` (global, cad, cam) + tabla hija `technician_availability_category` (técnico, categoría, capacidad, on). El plan opta por **modelo aplanado** (1 fila por técnico) por simplicidad de queries; si crecen categorías más de 8, migrar a normalizado.
     - Unique index sobre `user_id`.

   - **`technician_no_response_event`** — timestamps individuales por no-respuesta para ventana rolling:
     - `id`, `technician_user_id`, `case_invitation_id`, `occurred_at`, `status` (`active | expired_window | pardoned`), `pardoned_by_user_id` (nullable), `pardoned_at` (nullable), `pardon_reason` (nullable).
     - Índices: `(technician_user_id, occurred_at)` para query de ventana rolling, `(status)` para filtro activos.

   - **`invitation_rejection_reason`** — catálogo motivos rechazo individual:
     - Estructura idéntica a catálogos UI existentes (`vita_shade`, etc.): `id`, `code` UNIQUE, `label`, `description` nullable, `sort_order`, `is_active`, `created_at`, `updated_at`.
     - Code prefix: `rej`. Seed inicial con 7 motivos (`rej_001` a `rej_007`).

   - **`bulk_rejection_reason`** — catálogo motivos rechazo masivo:
     - Misma estructura. Code prefix: `brej`. Seed inicial con 5 motivos (`brej_001` a `brej_005`).

2. **Columnas nuevas en `case_invitation`**:
   - `rejection_reason_id` (FK a `invitation_rejection_reason`, ON DELETE RESTRICT, nullable).
   - `rejection_comment` (text nullable).
   - `rejected_at` (timestamp nullable).
   - `bulk_rejection_reason_id` (FK a `bulk_rejection_reason`, ON DELETE RESTRICT, nullable).
   - `bulk_rejection_comment` (text nullable).
   - `is_replacement` (boolean default false) — marca invitaciones generadas por reemplazo automático para reporting.

3. **Columnas nuevas en `fauchard_config`** (11 columnas — sección 6.1):
   - Plazos: `t_dentist_review_hours`, `t_no_eligible_pool_hours`, `max_pool_cycles`, `replacement_cutoff_minutes`.
   - Sanción: `no_response_window_days`, `no_response_rehabilitation_days`.
   - Umbrales: `level_1_threshold`, `level_2_threshold`, `level_3_threshold`.
   - Heartbeat: `inactivity_auto_off_days`, `inactivity_reminder_days`.
   - Score: `alpha_no_response`.
   - Audit: `change_reason` (text nullable, obligatorio en el formulario UI pero no en BD para permitir filas históricas sin razón).

4. **Columnas nuevas en `clinical_case`**:
   - `pending_pool_cycle_count` (int default 0) — contador de ciclos de espera.
   - `pending_pool_started_at` (timestamp nullable) — inicio del ciclo actual.
   - `pending_pool_checkin_sent_at` (timestamp nullable) — para no enviar 2 check-ins.
   - `last_revision_submitted_at` (timestamp nullable) — para countdown `tDentistReviewHours`.

5. **Backfill / seed inicial**:
   - Insertar 7 motivos en `invitation_rejection_reason` con `ON CONFLICT (code) DO NOTHING`.
   - Insertar 5 motivos en `bulk_rejection_reason` con `ON CONFLICT (code) DO NOTHING`.
   - Actualizar fila activa de `fauchard_config` con los 11 valores default (UPDATE con `WHERE is_active = true`).
   - Backfill `technician_availability`: INSERT desde users WHERE role='tecnico'. Lógica de inferencia CAD/CAM desde `technician_skill` (EXISTS con `design_level > 0` para CAD, idem fab para CAM). Categorías todo ON. Caso degenerado (sin skills): global ON, CAD OFF, CAM OFF. El backfill se ejecuta condicional a `process.env.AVAILABILITY_MODEL_ENABLED === 'true'` para evitar correr en cada deploy si el feature está apagado.

6. **schema.ts**: agregar todas las tablas nuevas, sus tipos, sus relations, y todos los nuevos campos de tablas existentes con tipos correctos drizzle.

7. **Actualización del sistema de purga admin** (crítico — no opcional):

   Modificar [frontend/lib/db/actions/admin.ts](frontend/lib/db/actions/admin.ts) → función `purgeAllBusinessDataAdmin()` y el inventario UI en [frontend/app/dashboard/admin/page.tsx](frontend/app/dashboard/admin/page.tsx) → constante `PURGE_INVENTORY`. Decisiones por tabla nueva:

   | Tabla nueva | Modo en purga | Justificación |
   |---|---|---|
   | `technician_availability` | **never** (preservar) | Es declaración personal del técnico, análoga a `technician_skill` que también se preserva. Si se purgaran, el técnico tendría que re-declarar su disponibilidad. |
   | `technician_no_response_event` | **explicit** (DELETE) | Cada evento referencia un `case_invitation_id` que se borra. Sin DELETE explícito quedarían FKs huérfanas (o requeriríamos CASCADE, pero preferimos control explícito + reporte de filas borradas). |
   | `invitation_rejection_reason` | **never** (preservar) | Catálogo administrable, igual que `vita_shade`, `restoration_type`, etc. |
   | `bulk_rejection_reason` | **never** (preservar) | Idem. |

   Columnas nuevas en tablas ya purgadas:
   - `case_invitation` (`rejection_reason_id`, `bulk_rejection_reason_id`, `rejection_comment`, `bulk_rejection_comment`, `rejected_at`, `is_replacement`) → se borran junto con la fila parent.
   - `clinical_case` (`pending_pool_cycle_count`, `pending_pool_started_at`, `pending_pool_checkin_sent_at`, `last_revision_submitted_at`) → idem.
   - `fauchard_config` (11 columnas) → se preserva (fauchard_config es never).

   Reset parcial de `user (técnicos)`: hoy resetea `consecutiveNoResponse`, `suspendedUntil`, `lastInvitedAt`, `leagueTransitionCount`. Hay que decidir:
   - **`consecutiveNoResponse = 0`**: mantener (el campo sigue existiendo aunque la lógica nueva no lo consulte cuando flag on).
   - **`suspendedUntil = null`**: mantener (campo existente).
   - **NO se agrega reset de `technician_availability`** — sería intrusivo borrar la declaración personal del técnico al purgar casos.

   **Cambios concretos en `purgeAllBusinessDataAdmin()`**:
   ```ts
   // Antes de delContactGuardAudit, agregar:
   const delNoResponseEvents = await db.delete(technicianNoResponseEvent).returning({ id: technicianNoResponseEvent.id });
   log('technicianNoResponseEvent', 'Eventos de no-respuesta (sanción rolling)', delNoResponseEvents.length);
   ```
   El orden importa: debe ir **antes** de `delInvitations` (porque tiene FK a `case_invitation_id`).

   **Cambios en `PURGE_INVENTORY` (UI)**:
   - Agregar `technician_no_response_event` con modo `explicit`.
   - Agregar `technician_availability` con modo `never`.
   - Agregar `invitation_rejection_reason` con modo `never`.
   - Agregar `bulk_rejection_reason` con modo `never`.
   - Actualizar el comentario "(28 filas)" a "(32 filas)".

### Tests
- **Nuevo `test/migration-v50.test.ts`** (integration, `RUN_DB_INTEGRATION_TESTS=true`):
  - Arranca DB limpia, corre `ensureInfrastructure(db)`, verifica que las 4 tablas existen, los catálogos tienen las filas seed, fauchard_config activa tiene los 11 campos nuevos con defaults.
  - Inserta un técnico de prueba con skill design_level=5, corre backfill, verifica que `technician_availability` tiene global=true, level_cad=true, level_cam=false.
  - Inserta técnico sin skills, verifica que queda global=true, level_cad=false, level_cam=false.
  - Re-corre `ensureInfrastructure(db)` (idempotencia) y verifica que no falla ni duplica filas.

- **Nuevo `test/purge-v50.test.ts`** (integration): poblar BD con datos completos (caso + invitación + evento de no-respuesta + disponibilidad + catálogos), ejecutar `purgeAllBusinessDataAdmin()`, verificar:
  - `technician_no_response_event` queda vacío.
  - `technician_availability` mantiene filas (never).
  - `invitation_rejection_reason` y `bulk_rejection_reason` mantienen seed (never).
  - Sin FKs huérfanas (query `SELECT * FROM technician_no_response_event WHERE case_invitation_id NOT IN (SELECT id FROM case_invitation)` debe dar 0).

- **Smoke**: `npm run validate:full` debe seguir pasando.

### Verificación manual
- `docker compose up -d` con `AVAILABILITY_MODEL_ENABLED=true` en .env.local → `npm run dev` → confirmar que arranca sin error.
- Conectar a Postgres local y `SELECT COUNT(*) FROM invitation_rejection_reason;` debe dar 7.

### Documentación
- **[frontend/lib/db/CLAUDE.md](../frontend/lib/db/CLAUDE.md)**:
  - Actualizar sección "Tablas principales" agregando `technician_availability`, `technician_no_response_event`, `invitation_rejection_reason`, `bulk_rejection_reason`.
  - Documentar columnas nuevas en `caseInvitation` (`rejection_reason_id`, `bulk_rejection_reason_id`, `is_replacement`, etc.), `clinicalCase` (`pending_pool_*`, `last_revision_submitted_at`) y `fauchardConfig` (11 columnas nuevas).
  - Actualizar sección "Catálogos UI" para incluir los 2 catálogos nuevos siguiendo el patrón existente.
- **[CLAUDE.md](../CLAUDE.md)** raíz: actualizar sección "Catálogos UI" con los 2 catálogos nuevos. Bump versión en mención "INFRA_VERSION='v4.7'" → 'v5.0'.
- **[Doc/Ciclo_Desarrollo.md](../Doc/Ciclo_Desarrollo.md)**: si se agregaron pasos al seed UAT o nuevas variables, mencionarlos.

### Rollback
- Bajar `INFRA_VERSION` no es opción (los datos persisten).
- Rollback real: DDL inverso en migración v5.1 (que el plan técnico documenta pero no ejecuta automáticamente): `DROP TABLE technician_availability, technician_no_response_event, invitation_rejection_reason, bulk_rejection_reason`; `ALTER TABLE case_invitation DROP COLUMN rejection_reason_id, ...`; `ALTER TABLE fauchard_config DROP COLUMN t_dentist_review_hours, ...`. Solo se aplica si feature flag se decide retirar definitivamente.
- En el día a día, el feature flag off es el rollback efectivo: las tablas existen pero ningún código las consulta.

---

## Fase 2 — Server actions backend sin UI (3–4 días)

### Objetivo
Toda la lógica nueva implementada y testeada al nivel de actions. La UI sigue siendo la vieja; el comportamiento solo cambia para casos que tocan caminos nuevos cuando el flag está on.

### Cambios

1. **Nuevo `frontend/lib/db/actions/availability.ts`**:
   - `getAvailabilityForUserAction(userId)` — retorna el row de `technician_availability` o null. Si no existe y el usuario es técnico, lo crea con la política de migración.
   - `updateAvailabilityLevelAction(userId, level, capacidad?, categoria?, value)` — actualiza el nivel correspondiente. Valida que admin no edita otros técnicos sin permiso explícito.
   - `computeEligibleAction(userId, categoria, capacidad)` — implementa el AND triple. Usado por Fauchard.
   - `getAllEligibleForCategoryCapacityAction(categoria, capacidad)` — retorna técnicos elegibles para una combinación. Usado por reactivación de cola.

2. **Nuevo `frontend/lib/db/actions/noResponseEvents.ts`**:
   - `recordNoResponseEventAction(technicianId, invitationId)` — INSERT en `technician_no_response_event` con `occurred_at = now`, `status = 'active'`.
   - `getActiveEventsInWindowAction(technicianId, windowDays)` — SELECT count where status='active' AND occurred_at > now - windowDays.
   - `expireEventsOutsideWindowAction(windowDays)` — UPDATE set status='expired_window' donde caducaron. Ejecutado por cron.
   - `pardonEventsAction(technicianId, adminId, reason, eventIds[])` — UPDATE status='pardoned'.
   - `computeLevelForTechnicianAction(technicianId)` — retorna {nivel: 1|2|3, count, nextExitDate} según ventana rolling y umbrales de fauchard_config.

3. **Nuevo `frontend/lib/db/actions/rejection.ts`**:
   - `rejectInvitationIndividualAction(invitationId, reasonId, comment?)` — valida que la invitación es del técnico, status=pending, reasonId existe en catálogo activo. UPDATE invitation set status='rejected', rejection_reason_id, rejection_comment, rejected_at. Log UCH. Dispara reemplazo si flag activo.
   - `rejectInvitationsBulkAction(userId, reasonId, comment?, invitationIds[])` — usado por toggle OFF y por auto-OFF.
   - `autoRejectOnAutoOffAction(userId, invitationIds[])` — caso especial sección 3.2.bis: usa `brej_003` y comentario interno fijo.

4. **Nuevo `frontend/lib/db/actions/replacement.ts`**:
   - `tryReplaceAfterRejectAction(invitationId)` — implementa lógica de sección 3.3: re-corre Fauchard scoring pool, identifica siguiente candidato elegible no invitado aún en este caso, valida cutoff temporal (`deadline_caso - now > replacementCutoffMinutes`), envía invitación con `expiresAt = min(now + tQuoteMinutes, deadline_caso)`, marca `is_replacement = true`.

5. **Nuevo `frontend/lib/db/actions/poolQueue.ts`**:
   - `enterPendingPoolAction(caseId)` — marca caso, setea `pending_pool_started_at = now`, incrementa `pending_pool_cycle_count`.
   - `processPendingPoolCheckInAction()` — busca casos al 50% del TTL sin check-in enviado, envía notificación dentista, marca `pending_pool_checkin_sent_at`.
   - `processPendingPoolExpirationAction()` — busca casos que cumplieron TTL, si quedan ciclos los re-encola, si no marca `sin_cotizaciones_fallo`.
   - `triggerPoolReevaluationOnTechnicianOnAction(userId)` — invocada cuando técnico hace switch ON, busca casos en pending_pool donde el técnico es ahora elegible, dispara `runFauchardAction` para esos casos.

6. **Modificar [../frontend/lib/db/actions/fauchard.ts](../frontend/lib/db/actions/fauchard.ts)**:
   - En `runFauchardAction` (línea ~488): **antes** del filtro existente por score, insertar el filtro AND triple (`computeEligibleAction`). Solo si feature flag activo; si no, mantener filtro actual.
   - **Retirar** `consecutiveNoResponse >= 3` como exclusión binaria (línea 586) cuando flag activo. La sanción se absorbe en el nuevo término del score.
   - En `calculateScoreFromBulkData` (línea 213): agregar término `- alphaNoResponse * N` donde `N` viene de `computeLevelForTechnicianAction`. Re-normalizar los α si flag activo (defaults 0.20/0.15/0.15/0.15/0.10/0.25 vs viejos 0.25/0.20/0.20/0.20/0.15).
   - Cuando pool de elegibles es 0 al final del scoring: llamar `enterPendingPoolAction(caseId)` si flag activo (en lugar de fallar inmediato).

7. **Modificar [../frontend/lib/db/actions/cases.ts](../frontend/lib/db/actions/cases.ts)**:
   - `submitRevisionAction` ya existe — agregar lógica para setear `last_revision_submitted_at = now` (campo nuevo de Fase 1) y que cada nueva entrega del técnico reinicie el countdown (sección 4.2).
   - `republicarCaseAction(caseId)` — nuevo: valida que el caso está en `sin_cotizaciones_fallo`, resetea `pending_pool_cycle_count = 0`, mueve a `enEvaluacion`, dispara `runFauchardAction`. Emite evento UCH `CASO_REPUBLICADO`.

8. **Modificar `frontend/lib/db/actions/fauchard.ts` — `penalizeNoResponseAction`**:
   - Cuando flag activo, en lugar de incrementar `consecutiveNoResponse` + suspender en 3: llama a `recordNoResponseEventAction` + recalcula nivel + dispara acciones según nivel (warn / penalizar score / auto-OFF).
   - Auto-OFF Nivel 3: UPDATE `technician_availability.level_global = false` + invocar `autoRejectOnAutoOffAction` para invitaciones pendientes + log UCH + notificar técnico.

9. **Modificar [../frontend/lib/db/actions/catalogs.ts](../frontend/lib/db/actions/catalogs.ts)**:
   - Agregar `'invitation_rejection_reason'` y `'bulk_rejection_reason'` a `CatalogTableKey`.
   - Agregar prefijos opacos `rej` y `brej` al map de prefijos.
   - Las actions genéricas (`list`, `create`, `update`, `setActive`, `reorder`) funcionan sin cambios.

10. **Reemplazo del transport de [../frontend/lib/services/notifications.ts](../frontend/lib/services/notifications.ts) — Resend → EmailJS**:
    - Retirar `import { Resend } from 'resend'` y la instancia global `resendInstance`.
    - Nuevo wrapper interno `sendViaEmailJS({ subject, toEmail, body })` que hace `POST https://api.emailjs.com/api/v1.0/email/send` con headers `Content-Type: application/json` y body:
      ```json
      {
        "service_id": "service_dentflowai",
        "template_id": "te60drn",
        "user_id": "IWyP-7o2SB3zInN01",
        "template_params": { "subject": "...", "to_email": "...", "body": "..." }
      }
      ```
    - Mantener `notifyUser(userId, type, data)` y `notifyOrganizationDentists(...)` con la misma firma pública (los call sites no cambian).
    - Conservar el modo stub local: si las 3 vars EmailJS están vacías o son placeholder (`stub`), loguear sin enviar.
    - Manejo de errores: `try/catch` + log; **no** se reintenta (best-effort, igual que hoy con Resend). El plan original incluía evaluar retry, pero con EmailJS como transport ya hay menos puntos de falla; se mantiene best-effort.
    - Retirar `RESEND_API_KEY` y `NOTIFICATION_FROM_EMAIL` de toda referencia interna.

11. **Agregar 7 nuevos tipos al union `NotificationType`**:
    - `NIVEL_2_ALCANZADO`, `NIVEL_3_AUTO_OFF`, `AUTO_OFF_PREVENTIVO`, `RECORDATORIO_ACTIVIDAD`, `PERDON_ADMIN`, `CHECK_IN_DENTISTA`, `REPUBLICAR_DISPONIBLE`.
    - Templates HTML inline (consistente con los 17 existentes), en español, tono informativo no punitivo (sección 2.6.4 del doc funcional).

### Tests
- `test/availability.test.ts` — unit, mocks DB. Cubre AND triple, persistencia de hijos cuando padre OFF, casos degenerados.
- `test/no-response-events.test.ts` — unit. Cubre ventana rolling 14d, transiciones de nivel, perdón admin, auto-rehabilitación 30d.
- `test/rejection-individual.test.ts` — unit. Cubre validaciones, persistencia, log UCH.
- `test/replacement.test.ts` — unit. Cubre disparo, cutoff temporal, truncación de `expiresAt`, no cascada infinita.
- `test/pool-queue.test.ts` — unit. Cubre entrada a cola, check-in 50%, expiración, re-encolado, fallo terminal.
- `test/fauchard-and-triple.test.ts` — integration (DB real). Verifica que el filtro AND triple excluye correctamente y que el pool resultante respeta las 3 capas.
- `test/score-renormalization.test.ts` — unit. Verifica que el score con flag on usa los nuevos α y mantiene `|Σα|=1`.
- `test/republicar-action.test.ts` — unit. Cubre validación de estado, reset de ciclos, transición a publicado.
- `test/notifications-emailjs-transport.test.ts` — unit con mock de `fetch`. Verifica que el wrapper construye el payload correcto para EmailJS, lo envía al endpoint correcto, y que el modo stub no llama a fetch.

### Verificación manual
- Encender flag, publicar caso de prueba via wizard, verificar en DB que invitaciones se generan respetando AND triple.
- Apagar manualmente un nivel de un técnico en BD, publicar otro caso, verificar que no es invitado.
- Disparar una invitación que envíe email real → confirmar recepción en bandeja del usuario destinatario.

### Documentación
- **[frontend/lib/db/CLAUDE.md](../frontend/lib/db/CLAUDE.md)**:
  - Sección "actions/ clave": agregar 5 archivos nuevos (`availability.ts`, `noResponseEvents.ts`, `rejection.ts`, `replacement.ts`, `poolQueue.ts`) con su responsabilidad.
  - Sección "Idempotencia crítica en Fauchard": agregar nota sobre filtro AND triple ejecutado en cada `runFauchardAction` (sin caché del estado efectivo).
  - Sección "Fauchard selección por tipo de servicio": agregar regla de elegibilidad (3 niveles) antes del filtro por skill.
  - Actualizar regla del score con la nueva fórmula re-normalizada `0.20·Q + 0.15·P + 0.15·E − 0.15·C + 0.10·B − 0.25·N`.
- **[CLAUDE.md](../CLAUDE.md)** raíz: sección "Motor Fauchard": actualizar flujo de vida del caso con cola `pendiente_pool`, retirar mención de `consecutiveNoResponse` como exclusión binaria (ahora es gradual vía rolling window). Agregar mención al feature flag `AVAILABILITY_MODEL_ENABLED` y su efecto.
- **[AGENTS.md](../AGENTS.md)** raíz + **[frontend/AGENTS.md](../frontend/AGENTS.md)**: agregar mención de las 5 categorías canónicas y el modelo de disponibilidad jerárquico.

### Rollback
- Apagar `AVAILABILITY_MODEL_ENABLED`. El código nuevo está pero no se ejecuta; Fauchard vuelve al filtro `consecutiveNoResponse >= 3` y al score viejo.

---

## Fase 3 — Panel admin Fauchard + catálogos admin (2–3 días)

### Objetivo
Admin puede gestionar los nuevos parámetros y catálogos. Sin esto, no se puede operar el sistema nuevo.

### Cambios

1. **CRUD catálogos**:
   - Editar [../frontend/app/dashboard/admin/catalogos/page.tsx](../frontend/app/dashboard/admin/catalogos/page.tsx) — agregar 2 nuevos tabs: "Motivos de rechazo individual" y "Motivos de rechazo masivo". El componente ya soporta cualquier `CatalogTableKey`. Trabajo: agregar entradas al array `TABS`.
   - No requiere nuevos componentes.

2. **Panel Fauchard — nuevo subpanel**:
   - Nuevo archivo `frontend/components/admin/fauchard/PlazosYSancionesPanel.tsx`.
   - Inputs agrupados por bloques funcionales (sección 6.1.bis del doc):
     1. Tiempos de la ronda comercial (3 inputs: cotización, propuesta, revisión).
     2. Espera de técnicos disponibles (2 inputs: TTL, ciclos).
     3. Reemplazo automático (1 input: cutoff).
     4. Disponibilidad e inactividad (2 inputs: recordatorio, pausa).
     5. Sanción por no responder (5 inputs: ventana, rehabilitación, 3 umbrales).
     6. Reglas de score (6 inputs: αQ, αP, αE, αC, αB, αN + indicador de suma absoluta en tiempo real).
   - Cada input con tooltip funcional (texto exacto definido en sección 10.9 del doc).
   - Validaciones cliente: orden estricto, suma α, floors/caps (todos definidos en sección 11.2).
   - Botón "Guardar" → `ConfirmSaveModal` existente → server action.
   - Campo motivo de cambio obligatorio en el modal (sección 11.4 del doc).

3. **Server action**:
   - Nueva `updateFauchardParamsAction(params, reason)` en `fauchard.ts`. Patrón copy-on-write existente: crea nueva fila `is_active=true`, desactiva la previa. Setea `change_reason`, `created_by`. Idempotente vía revisión del estado antes de aplicar.

4. **Botón "Resetear contador de no-respuestas" en panel admin del técnico**:
   - Nuevo componente `frontend/components/admin/technicians/ResetNoResponseModal.tsx`.
   - Lista no-respuestas activas + textarea obligatorio.
   - Server action `pardonNoResponseEventsAction(userId, eventIds[], reason)` — wraps `pardonEventsAction` con audit log + notificación al técnico.

5. **Dashboard observabilidad — 13 métricas**:
   - Nuevo subpanel `frontend/components/admin/fauchard/ObservabilityPanel.tsx`.
   - Cada métrica es una server action que devuelve un número o serie temporal.
   - **Instalar Recharts** (`npm install recharts`) — el proyecto no tiene ninguna librería gráfica hoy (verificado en `package.json`). Recharts es la opción estándar con React, ~150KB, compatible con tree-shaking. Alternativa más liviana: `react-sparklines` (~6KB) si solo se necesitan micrográficos, pero limita la flexibilidad de la sección 11.3 (gráficos de línea + barras). El plan elige Recharts.
   - Componentes a usar: `LineChart` para tendencias temporales (métricas 1, 2, 3, 7), `BarChart` horizontal para distribuciones por categoría/capacidad (métrica 5), tarjetas KPI con `Sparkline` (la usamos via Recharts `LineChart` sin axes para los KPI cards numéricos).
   - Refresh manual con botón + indicador "Última actualización HH:MM".
   - Lazy-load del panel (`next/dynamic`) para no inflar el bundle del dashboard general.

### Tests
- `test/admin-fauchard-params-update.test.ts` — unit. Verifica validaciones de cotas y suma α antes de persistir.
- `test/catalog-new-tabs.test.tsx` — UI test. Renderiza la página, simula cambio a los nuevos tabs, verifica que las server actions correctas se invocan.
- `test/reset-no-response-action.test.ts` — unit. Verifica que pardon marca eventos correctamente y notifica al técnico.
- Smoke: agregar la página `/dashboard/admin/fauchard` al `test:smoke`.

### Verificación manual
- Login como admin → navegar a `/dashboard/admin/fauchard` → cambiar un parámetro → confirmar modal → verificar en BD nueva fila creada.
- Cambiar a tabs nuevas en `/dashboard/admin/catalogos` → crear motivo nuevo → verificar que aparece en BD.

### Documentación
- **[CLAUDE.md](../CLAUDE.md)** raíz: sección "Catálogos UI" agregar referencia a los 2 nuevos tabs administrables.
- **[frontend/app/CLAUDE.md](../frontend/app/CLAUDE.md)** (si existe): agregar nuevas rutas admin (panel Plazos y Sanciones + dashboard observabilidad).
- **[frontend/components/CLAUDE.md](../frontend/components/CLAUDE.md)** (si existe): documentar `PlazosYSancionesPanel`, `ObservabilityPanel`, `ResetNoResponseModal` y el patrón de validación cliente (cotas + suma α).

### Rollback
- Apagar `AVAILABILITY_ADMIN_PANEL_ENABLED` para ocultar nuevos paneles. CRUD catálogos no necesita flag, los tabs nuevos están vacíos sin seed (aunque el seed corre en migración).

---

## Fase 4 — Panel disponibilidad técnico + badge global (3–4 días)

### Objetivo
El técnico puede gestionar su disponibilidad. UX completa según sección 10 del doc.

### Cambios

1. **Badge global en header**:
   - Editar [../frontend/app/dashboard/layout.tsx](../frontend/app/dashboard/layout.tsx) líneas 213–262 — insertar nuevo componente entre Bell y ThemeToggleButton.
   - Nuevo componente `frontend/components/availability/AvailabilityBadge.tsx`.
   - Solo visible si `userProfile.role === 'tecnico'` y `AVAILABILITY_UI_TECNICO_ENABLED`.
   - Estados visuales según sección 10.1: verde / verde+ámbar / verde+azul / gris.
   - Click → menú desplegable con toggle ON/OFF + bloque estado de respuesta + atajos.

2. **Página panel de disponibilidad**:
   - Nueva ruta `/dashboard/profile/availability` o sub-tab en perfil existente.
   - Nuevo componente `frontend/components/availability/AvailabilityPanel.tsx`.
   - Estructura completa según sección 10.2:
     - Bloque "Estado de respuesta" con stepper de 3 nodos.
     - Switch global (clonar pattern de `AvailabilityToggle.tsx`).
     - Dos columnas CAD/CAM con switches por categoría.
     - Reglas de padre/hijo (deshabilitado visual, valores preservados).

3. **Vista "Historial de respuesta"**:
   - Nuevo componente `frontend/components/availability/ResponseHistoryView.tsx`.
   - Server action `getResponseHistoryAction(userId, days?)` — JOIN sobre `technician_no_response_event` + `case_invitation` para mostrar cronología.
   - Filtros: "Solo activas" / "Todo".

4. **Modal de reactivación**:
   - Nuevo componente `frontend/components/availability/ReactivationModal.tsx`.
   - Aparece al click "Reactivar disponibilidad" si técnico está en auto-OFF Nivel 3.
   - Muestra datos en tiempo real: no-respuestas activas, penalización score, fecha próxima salida.
   - Mensaje de advertencia de 4ª no-respuesta = revisión admin.
   - **No bloqueante**: el técnico siempre puede confirmar.

5. **Diálogo de rechazo masivo al apagar**:
   - Nuevo componente `frontend/components/availability/BulkRejectDialog.tsx`.
   - Solo aparece si hay invitaciones `pending`.
   - Dos opciones: Mantener (default) / Rechazar todas con motivo (desde catálogo BD).
   - Server action: `rejectInvitationsBulkAction` (de Fase 2) + UPDATE `technician_availability.level_global = false`.

6. **Popover desde badge global**:
   - Cuando técnico está en Nivel 2 o 3, el badge muestra punto de aviso y el popover incluye bloque condensado de estado.
   - Reusa lógica de `getResponseHistoryAction` con un slice corto.

### Tests
- `test/availability-panel.test.tsx` — UI. Renderiza panel, simula click en switches, verifica que padre OFF deshabilita hijos.
- `test/badge-states.test.tsx` — UI. Snapshots de los 4 estados visuales.
- `test/reactivation-modal.test.tsx` — UI. Verifica que muestra los datos calculados, confirma cierra correctamente.
- `test/bulk-reject-dialog.test.tsx` — UI. Verifica que el sub-form aparece cuando se elige "Rechazar todas" y que requiere motivo.
- Smoke: agregar `/dashboard/profile/availability` al smoke.

### Verificación manual
- Login como técnico → ver badge en header → click → ver menú → ir al panel → cambiar switches → confirmar persistencia en BD.
- Simular Nivel 2 (insertar 2 no_response_events manualmente) → ver que badge cambia color, panel muestra stepper en N2, próxima salida calculada correctamente.

### Documentación
- **[frontend/CLAUDE.md](../frontend/CLAUDE.md)**: agregar sección "Badge global de disponibilidad" describiendo el componente y su posición en el layout. Mencionar que solo se muestra para rol técnico con flag activo.
- **[frontend/components/CLAUDE.md](../frontend/components/CLAUDE.md)** (si existe): documentar `AvailabilityBadge`, `AvailabilityPanel`, `ReactivationModal`, `BulkRejectDialog`, `ResponseHistoryView` + recetas de hover/focus aplicadas.
- **[CLAUDE.md](../CLAUDE.md)** raíz: en sección "Estructura" agregar nueva ruta `/dashboard/profile/availability` y la nueva carpeta `frontend/components/availability/`.

### Rollback
- Apagar `AVAILABILITY_UI_TECNICO_ENABLED` — badge oculto, panel inaccesible.

---

## Fase 5 — Acciones del técnico en UCH (2 días)

### Objetivo
Técnico puede rechazar invitaciones individualmente desde el UCH.

### Cambios

1. **Acción "Rechazar invitación" en UCH**:
   - Editar [../frontend/components/cases/uch/UchFauchardActionsPanel.tsx](../frontend/components/cases/uch/UchFauchardActionsPanel.tsx) — agregar botón "Rechazar invitación" junto al de cotizar (mientras `invitation.status === 'pending'`).
   - Botón abre nuevo componente `frontend/components/cases/uch/UchRejectInvitationDialog.tsx`.

2. **Diálogo de rechazo individual**:
   - Estructura según sección 10.5 del doc.
   - Selector poblado desde `listCatalogOptionsAction('invitation_rejection_reason')`.
   - Comentario obligatorio si motivo es "Otro".
   - Server action: `rejectInvitationIndividualAction` (de Fase 2).
   - Tras rechazo: toast confirmación, refrescar UCH, log evento.

3. **Visibilidad**:
   - Solo si `REJECTION_INDIVIDUAL_ENABLED`.
   - Botón visible solo a técnico invitado, no a dentista ni a otros técnicos del caso.
   - Usar `uchHubActionVisibility.ts` para gating.

4. **Trigger reemplazo automático**:
   - El server action de rechazo dispara `tryReplaceAfterRejectAction` (de Fase 2) si feature flag activo.
   - El dentista nunca ve nada explícito; el reemplazo aparece como nueva invitación en el caso.

### Tests
- `test/reject-invitation-action.test.ts` — unit. Cubre validaciones (técnico correcto, status pending, motivo válido).
- `test/reject-invitation-dialog.test.tsx` — UI. Verifica que selector se pobla, validación de "Otro" → comentario obligatorio.
- `test/replacement-cascade.test.ts` — integration. Simula 3 rechazos seguidos, verifica que el reemplazo se envía al siguiente del pool scoreado, cutoff temporal corta correctamente.

### Verificación manual
- Login como técnico invitado → ir al UCH del caso → click "Rechazar" → seleccionar motivo → confirmar → verificar en BD `case_invitation.status = 'rejected'` + reason_id + comment.
- Verificar que se generó nueva invitación al siguiente técnico del pool (si había alguien) con `is_replacement = true`.

### Documentación
- **`.cursor/skills/uch-reglas-diseno-dentflowai`**: agregar la nueva acción "Rechazar invitación" al catálogo de mensajes estandarizados (sección "Mensajes estandarizados por tipo"). Documentar regla de visibilidad (técnico invitado solamente) y que NO cuenta como no-respuesta.
- **[CLAUDE.md](../CLAUDE.md)** raíz: en la sección "UCH — Reglas de Diseño DentFlowAi" → tabla de mensajes estandarizados → agregar fila `OFERTA_RECHAZADA_POR_TECNICO`.
- **[AGENTS.md](../AGENTS.md)** raíz + **[frontend/AGENTS.md](../frontend/AGENTS.md)**: mencionar la acción de rechazo individual y su diferencia con el rechazo masivo.

### Rollback
- Apagar `REJECTION_INDIVIDUAL_ENABLED` — botón oculto en UCH, server action sigue válida pero no se invoca desde UI.

---

## Fase 6 — Cron + notificaciones nuevas + Republicar (3 días)

### Objetivo
Toda la mecánica automática funciona: expiración de eventos rolling, transiciones de nivel, auto-OFF, heartbeat, check-in al dentista, expiración de pendiente_pool, notificaciones email + in-app.

### Cambios

1. **Nuevo cron `/api/cron/process-availability`** (frecuencia: cada hora):
   - Llama a `expireEventsOutsideWindowAction(windowDays)` — marca eventos fuera de ventana.
   - Para técnicos con cambios: recalcula nivel, dispara transiciones (warn / penalizar / auto-OFF) si corresponde.
   - Detecta rehabilitación (30d sin nuevas no-respuestas).
   - Auto-OFF preventivo: detecta técnicos con switch ON y >30d sin login → UPDATE level_global=false + email.
   - Detecta inactividad 7d → envía recordatorio + marca aviso en badge.

2. **Nuevo cron `/api/cron/process-pool-queue`** (frecuencia: cada 10 min):
   - Llama a `processPendingPoolCheckInAction()` — envía check-in al 50% del TTL.
   - Llama a `processPendingPoolExpirationAction()` — re-encola o falla según ciclos.

3. **Modificación del cron existente `/api/cron/evaluate-quotes`**:
   - Sin cambios estructurales. Cuando una invitación expira, ya invoca `penalizeNoResponseAction` que (con flag on) usa el nuevo sistema.

4. **Configuración del scheduler — Cloud Scheduler (decidido)**:

   El proyecto despliega a **Cloud Run** vía `deploy.sh` (no a Vercel), y el cron existente `/api/cron/evaluate-quotes` ya está cableado para ser invocado por GCP Cloud Scheduler con header `Authorization: Bearer ${CRON_SECRET}`. Es coherente y simple reutilizar ese pattern para los dos nuevos.

   Comandos `gcloud` documentados en el plan (a ejecutarse una sola vez por el admin GCP en Fase 6):

   ```bash
   # process-availability: cada hora
   gcloud scheduler jobs create http process-availability \
     --location=southamerica-west1 \
     --schedule="0 * * * *" \
     --uri="https://dentflowai-frontend-prod-XXXX.run.app/api/cron/process-availability" \
     --http-method=POST \
     --headers="Authorization=Bearer ${CRON_SECRET}" \
     --attempt-deadline=120s

   # process-pool-queue: cada 10 minutos
   gcloud scheduler jobs create http process-pool-queue \
     --location=southamerica-west1 \
     --schedule="*/10 * * * *" \
     --uri="https://dentflowai-frontend-prod-XXXX.run.app/api/cron/process-pool-queue" \
     --http-method=POST \
     --headers="Authorization=Bearer ${CRON_SECRET}" \
     --attempt-deadline=60s
   ```

   Ambos endpoints validan el header `Authorization` igual que el cron existente.

   **Para staging**: crear los mismos 2 jobs apuntando a `dentflowai-frontend-dev-XXXX.run.app` con `CRON_SECRET` específico de dev.

   **Para local**: los crons no corren automáticamente. Para probar manualmente: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/process-availability`.

5. **Notificaciones nuevas** (en `notifications.ts`):
   - Templates para los 7 tipos nuevos definidos en Fase 2.
   - Reglas de canal según sección 9.5: Nivel 1 solo in-app; Nivel 2 y 3 + auto-OFF + perdón + check-in dentista → email + in-app.

6. **Banner espera + check-in dentista en ficha del caso**:
   - Editar [../frontend/components/cases/CaseDetailManagementBar.tsx](../frontend/components/cases/CaseDetailManagementBar.tsx) — agregar banner "Buscando técnicos disponibles..." cuando estado = `enEvaluacion` con marca pending_pool.
   - Botón "Cancelar publicación" siempre visible durante pending_pool.
   - Modal de check-in dispara cuando dentista entra al caso y está al 50% del TTL.

7. **Botón "Republicar" en caso terminal**:
   - Editar `CaseDetailManagementBar.tsx` para mostrar "Republicar" cuando `status === 'sin_cotizaciones_fallo'`.
   - Modal de doble confirmación según mockup 10.4.
   - Invoca `republicarCaseAction` (de Fase 2).

### Tests
- `test/cron-process-availability.test.ts` — integration. Setup técnicos con distintos estados (Nivel 1, 2, 3, inactivos), corre el cron, verifica transiciones esperadas.
- `test/cron-process-pool-queue.test.ts` — integration. Setup casos en pending_pool con distintos TTL, corre el cron, verifica check-ins y expiraciones.
- `test/notifications-new-types.test.ts` — unit. Verifica que cada nuevo tipo genera el subject y body esperados según las reglas de canal.
- `test/check-in-dentista.test.tsx` — UI. Verifica que el modal aparece, los botones funcionan.
- `test/republicar-modal.test.tsx` — UI. Verifica doble confirmación, transición directa a publicación.

### Verificación manual
- Setup caso de prueba en pending_pool con TTL artificial corto → esperar tiempo + correr cron manualmente → verificar email enviado, banner aparece, expiración correcta.
- Setup técnico con 3 no_response_events activos → correr cron → verificar auto-OFF + email.

### Documentación
- **[CLAUDE.md](../CLAUDE.md)** raíz: en sección "Sistema" agregar mención de los 2 cron jobs nuevos (`process-availability` cada hora, `process-pool-queue` cada 10 min) junto al ya existente `evaluate-quotes`. Corregir la frase obsoleta "Reloj de feriado/horario aplica también a expiración de invitaciones y propuestas" — ahora aplica solo a `workDeadline` (sección 4.4 del doc funcional).
- **[frontend/lib/db/CLAUDE.md](../frontend/lib/db/CLAUDE.md)**: misma corrección de la frase de feriado/horario. Agregar `tDentistReviewHours` al catálogo de countdowns existente. Documentar banner pendiente_pool y botón Republicar.
- **`.cursor/skills/uch-reglas-diseno-dentflowai`**: agregar banner "Buscando técnicos disponibles…", check-in al dentista al 50% del TTL, modal Republicar, marca "respuesta vencida" cuando expira `tDentistReviewHours`.
- **[Doc/Ciclo_Desarrollo.md](../Doc/Ciclo_Desarrollo.md)**: agregar paso de configuración del scheduler (Vercel Cron o Cloud Scheduler) con las 2 nuevas entradas.

### Rollback
- Si crons causan problemas: desuscribirlos del scheduler (no requiere deploy). El código permanece pero no se ejecuta.
- Apagar `AVAILABILITY_MODEL_ENABLED` desactiva la lógica de los actions invocados por los crons.

---

## Fase 7 — Migración + rollout + comunicación (1–2 días)

### Objetivo
Activar el sistema en producción para usuarios reales con comunicación previa, monitoreo activo y plan de mitigación.

### Pre-condiciones manuales (a ejecutar por el usuario antes de la fase)

Estas acciones son responsabilidad explícita del usuario y se confirman antes de proceder:

1. **Purga de casos en producción** (decisión del usuario): "Borrare todos los casos". El admin ejecuta la purga desde `/dashboard/admin` usando el botón existente (que en Fase 1 ya está actualizado para borrar también `technician_no_response_event` y preservar `technician_availability` + ambos catálogos de rechazo). Esto elimina la complejidad de la re-normalización del score sobre casos en vuelo: al activar el flag, no hay casos activos que mezclen config vieja con nueva.

2. **Verificación de Cloud Scheduler**: confirmar que los 2 jobs (`process-availability`, `process-pool-queue`) están creados en GCP apuntando al servicio de producción y con `CRON_SECRET` correcto. Comandos `gcloud` documentados en Fase 6.

3. **Backfill manual de `technician_availability`** (instrucción que se solicita expresamente al usuario en el momento):

   El backfill no corre automático en el deploy. Cuando se llegue a este paso, **el implementador detiene y pide al usuario** ejecutar manualmente:

   ```bash
   cd frontend
   # Verificar variables de entorno apuntan a la BD de producción
   npx tsx scripts/backfill-availability.ts
   ```

   El script (creado en esta fase, dentro de `frontend/scripts/`):
   - Lista todos los `user.role = 'tecnico'`.
   - Para cada uno, calcula CAD/CAM desde `technician_skill` (EXISTS con `design_level > 0` y `fabrication_level > 0`).
   - INSERT en `technician_availability` con `ON CONFLICT (user_id) DO NOTHING` (idempotente — re-ejecutable sin daño).
   - Loguea cantidades: total técnicos procesados, cuántos quedaron con CAD ON, cuántos con CAM ON, cuántos en caso degenerado (sin skills).

   El usuario confirma la ejecución al implementador antes de pasar al paso de activación del flag.

### Cambios

1. **Comunicación previa** (3–7 días antes):
   - Email a todos los técnicos vía EmailJS usando un nuevo tipo `ROLLOUT_PROXIMO`.
   - Texto: "Próximamente vas a tener más control sobre cuándo recibes invitaciones. Te avisaremos cuando esté disponible."
   - Los envíos se ejecutan hasta donde alcance la cuota disponible de EmailJS. Lo crítico no es cubrir el 100% por email — el banner in-app y el flujo del badge global aseguran que el técnico se entera al ingresar a la app, aun si su correo no llegó.

2. **Banner in-app** (solo durante las primeras N sesiones post-rollout):
   - Nuevo componente `frontend/components/availability/RolloutBanner.tsx`.
   - Cookie `availability_banner_dismissed` para no mostrar más cuando el técnico ya lo vio.

3. **Activación** (tras confirmación de la pre-condición 3):
   - Encender `AVAILABILITY_MODEL_ENABLED=true` en producción vía `deploy.sh production` con la variable seteada.
   - Encender `AVAILABILITY_ADMIN_PANEL_ENABLED`, `AVAILABILITY_UI_TECNICO_ENABLED`, `REJECTION_INDIVIDUAL_ENABLED`, `POOL_PENDIENTE_ENABLED` en el mismo deploy.

4. **Email post-rollout**:
   - Tipo `ROLLOUT_ACTIVADO` — "Ya puedes gestionar tu disponibilidad desde [link]. Por defecto estás activo en todas las categorías que ya manejas."

5. **Monitoreo 24–48h**:
   - Revisar dashboard de observabilidad cada 4–6h.
   - Métricas clave a vigilar: % técnicos Nivel 2/3, % casos en pending_pool, tasa de no-respuestas.
   - Si alguna métrica catastrófica: alerta admin, intervención manual (apagar flag o revertir cambio puntual).

### Tests
- E2E manual con varios técnicos beta antes del rollout masivo.
- Test de carga del cron de availability: simular 1000 técnicos con eventos variados, medir tiempo de ejecución.

### Verificación manual
- Después del rollout, login con cuentas de técnico de prueba, verificar que el badge aparece, panel funciona, rechazo funciona.

### Documentación
- **Pasada final de consistencia** sobre todos los archivos de doc:
  - **[README.md](../README.md)** raíz + **[frontend/README.md](../frontend/README.md)**: agregar en sección de features una mención breve al sistema de disponibilidad declarada del técnico y el flujo Fauchard con sanción gradual.
  - **[CLAUDE.md](../CLAUDE.md)** raíz: confirmar que la sección "Restricciones críticas" no quedó desactualizada. Bump menciones de versión / feature flags activados.
  - **[frontend/.env.example](../frontend/.env.example)**: cambiar comentarios de los flags de "(no activos aún)" a su estado real post-rollout.
  - **[Doc/Ciclo_Desarrollo.md](../Doc/Ciclo_Desarrollo.md)**: agregar nota de procedimiento de rollback (apagar flag desde Cloud Run + reiniciar instancia).
- **Crear `Doc Servicio Orquestado/post_rollout_calibration.md`** (opcional): notas operativas iniciales — qué métricas vigilar primera semana, parámetros que probablemente se ajusten, contactos para incidentes.

### Rollback
- **Inmediato (sin deploy)**: bajar `AVAILABILITY_MODEL_ENABLED` y todos los flags secundarios a `false` desde Cloud Run → reiniciar instancia. Fauchard vuelve al comportamiento previo.
- **Completo (con deploy)**: revertir el merge a `develop` y `main`, redeploy. Tablas nuevas quedan en BD pero sin uso.

---

## Resumen de archivos críticos a modificar

### Backend
- [../frontend/lib/db/infrastructure.ts](../frontend/lib/db/infrastructure.ts) — DDL + seed + backfill.
- [../frontend/lib/db/schema.ts](../frontend/lib/db/schema.ts) — todas las tablas y campos nuevos en drizzle.
- [../frontend/lib/db/actions/fauchard.ts](../frontend/lib/db/actions/fauchard.ts) — filtro AND triple, score con αN, retiro de exclusión binaria, integración con cola.
- [../frontend/lib/db/actions/cases.ts](../frontend/lib/db/actions/cases.ts) — `submitRevisionAction` con countdown, `republicarCaseAction`.
- [../frontend/lib/db/actions/catalogs.ts](../frontend/lib/db/actions/catalogs.ts) — agregar 2 keys.
- [../frontend/lib/db/actions/admin.ts](../frontend/lib/db/actions/admin.ts) — `purgeAllBusinessDataAdmin` actualizada con nuevas tablas (explicit + never).
- [../frontend/lib/services/notifications.ts](../frontend/lib/services/notifications.ts) — transport reemplazado Resend → EmailJS (wrapper API REST server-side) + 7 tipos nuevos.

### Backend nuevos
- `frontend/lib/db/actions/availability.ts`
- `frontend/lib/db/actions/noResponseEvents.ts`
- `frontend/lib/db/actions/rejection.ts`
- `frontend/lib/db/actions/replacement.ts`
- `frontend/lib/db/actions/poolQueue.ts`
- `frontend/lib/constants/availabilityFlags.ts`

### Frontend
- [../frontend/app/dashboard/layout.tsx](../frontend/app/dashboard/layout.tsx) — insertar badge.
- [../frontend/app/dashboard/admin/catalogos/page.tsx](../frontend/app/dashboard/admin/catalogos/page.tsx) — 2 tabs nuevos.
- [../frontend/app/dashboard/admin/page.tsx](../frontend/app/dashboard/admin/page.tsx) — `PURGE_INVENTORY` con 4 entradas nuevas (32 filas en lugar de 28).
- [../frontend/components/cases/uch/UchFauchardActionsPanel.tsx](../frontend/components/cases/uch/UchFauchardActionsPanel.tsx) — botón rechazar.
- [../frontend/components/cases/uch/uchHubActionVisibility.ts](../frontend/components/cases/uch/uchHubActionVisibility.ts) — visibilidad de rechazar.
- [../frontend/components/cases/CaseDetailManagementBar.tsx](../frontend/components/cases/CaseDetailManagementBar.tsx) — banner espera + botón Republicar.

### Frontend nuevos
- `frontend/components/availability/AvailabilityBadge.tsx`
- `frontend/components/availability/AvailabilityPanel.tsx`
- `frontend/components/availability/ResponseHistoryView.tsx`
- `frontend/components/availability/ReactivationModal.tsx`
- `frontend/components/availability/BulkRejectDialog.tsx`
- `frontend/components/availability/RolloutBanner.tsx`
- `frontend/components/admin/fauchard/PlazosYSancionesPanel.tsx`
- `frontend/components/admin/fauchard/ObservabilityPanel.tsx`
- `frontend/components/admin/technicians/ResetNoResponseModal.tsx`
- `frontend/components/cases/uch/UchRejectInvitationDialog.tsx`
- `frontend/app/dashboard/profile/availability/page.tsx`
- `frontend/app/api/cron/process-availability/route.ts`
- `frontend/app/api/cron/process-pool-queue/route.ts`

### Scripts nuevos
- `frontend/scripts/test-emailjs.ts` — sanity check del envío (Fase 0).
- `frontend/scripts/backfill-availability.ts` — backfill manual de `technician_availability` (Fase 7, ejecución one-time bajo pedido explícito).

### Doc
- [flujo_tiempos.md](flujo_tiempos.md) — sección 9 mantiene EmailJS (decisión final tras descartar Resend por ausencia de dominio propio).

---

## Verificación end-to-end (post-fases)

1. **Migración**: `docker compose up -d` + `npm run dev` con flag ON. Confirmar tablas, seeds, fauchard_config actualizada.
2. **Disponibilidad**: login técnico → cambiar switch en panel → publicar caso desde dentista → verificar que técnicos OFF no son invitados.
3. **Sanción**: simular 3 no_response_events para un técnico → correr cron → verificar auto-OFF + email + badge en rojo.
4. **Rechazo individual**: técnico recibe invitación → click rechazar → seleccionar motivo → verificar BD + nuevo invitado generado (reemplazo).
5. **Pool pendiente**: publicar caso sin técnicos elegibles → verificar banner "Buscando..." → esperar TTL artificial → verificar check-in → expirar → verificar `sin_cotizaciones_fallo`.
6. **Republicar**: caso fallido → click Republicar → confirmar modal → verificar nueva ronda Fauchard.
7. **Panel admin**: cambiar parámetros Fauchard → confirmar modal con motivo → verificar nueva fila en `fauchard_config`.
8. **Reset admin**: técnico con eventos activos → admin abre modal → completa motivo → confirma → verificar pardon + email al técnico.
9. **Smoke test global**: `npm run test:smoke` + `npm run test:run` deben pasar al 100%.

## Cronograma estimado

| Fase | Días | Bloqueante para |
|---|---|---|
| 0 — Preparación | 1 | Todas |
| 1 — BD + migraciones | 2–3 | 2, 3, 4 |
| 2 — Server actions backend | 3–4 | 3, 4, 5, 6 |
| 3 — Panel admin | 2–3 | 7 |
| 4 — UI técnico | 3–4 | 7 |
| 5 — Acciones UCH | 2 | 7 |
| 6 — Cron + notificaciones + Republicar | 3 | 7 |
| 7 — Migración + rollout | 1–2 | — |
| **Total** | **17–22 días** | |

Las fases 3, 4, 5 pueden ejecutarse en paralelo entre desarrolladores distintos (no se bloquean entre sí, solo dependen de 1 y 2).

## Riesgos identificados

- **EmailJS no responde / template caído**: si la sanity check de Fase 0 falla, todo el plan se detiene hasta confirmar credenciales y disponibilidad del servicio. Esa validación es el punto de control único y obligatorio del transport email; pasada esa prueba, el sistema asume que el envío funciona y opera best-effort sin reintentos.
- **EmailJS template único `te60drn`** acepta 3 variables (`subject`, `to_email`, `body`). Si en el futuro se necesitan templates separados por tipo de notificación (con HTML estilizado distinto), el cambio implica crear varios template IDs en EmailJS y mapearlos en `notifications.ts`. Por ahora el body genérico HTML cubre todos los casos.
- **Backfill `technician_availability`** puede ser lento con muchos técnicos. Mitigación: el script `backfill-availability.ts` procesa en batch con `ON CONFLICT (user_id) DO NOTHING` (idempotente), permitiendo re-ejecución si se interrumpe.
- **Cron `process-availability` cada hora** puede saturarse con muchos técnicos. Mitigación: monitorear primera semana, si el run dura más de 30s pasarlo a cada 30 min con scope reducido.
- **Apagar feature flag en caliente** requiere reiniciar Cloud Run (no es hot reload). Tiempo de switching: ~30s downtime para usuarios activos. Aceptable para un rollback de emergencia.
- **Purga olvida nuevas tablas** si Fase 1 no se ejecuta correctamente. Mitigación: test `test/purge-v50.test.ts` específico que valida que `technician_no_response_event` queda vacía tras purga y que ambos catálogos + `technician_availability` se preservan. Si el test falla, la purga producción no se ejecuta hasta arreglarlo.
