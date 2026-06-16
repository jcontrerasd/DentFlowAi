# Auditoría de eliminables — DentFlowAi

## Context

El repo arrastra residuo de la migración v1 → v2 (producto activo: `solo_diseno` + asignación
directa). Hay código legacy de cotización múltiple, helpers inertes, scripts one-time ya
aplicados, docs de sprints cerrados y respaldos pesados. El objetivo de esta tarea es **entregar
un listado auditado** de todo lo eliminable, priorizado por riesgo. **No se ejecuta ninguna
eliminación** (decisión del usuario: "solo entregar auditoría"). Política de docs: borrar
obsoletos del repo, **pero conservar el directorio `Backup/`**.

Verificado con grep durante la auditoría. Correcciones a hallazgos preliminares de los agentes:
- `jszip` **SÍ se usa** (`components/cases/UnifiedCaseHub.tsx`) → NO eliminar.
- `bcryptjs` **SÍ se usa** en runtime (`auth.config.ts`, `lib/db/actions/admin.ts`, `user.ts`) → NO eliminar.
- `pg` sin imports → único dep realmente sin uso (`postgres` es el driver real).
- `Backup/` (1.3 GB) está en disco pero **no trackeado en git** → se conserva por decisión del usuario.
- `gcp-key.json` no está trackeado; `*-adminsdk-*.json` ignorado. `cors.json` sí trackeado (no es secreto).

Existe herramienta ya configurada: **knip** → `cd frontend && npm run audit:unused`. Útil para
re-verificar antes de cualquier borrado real.

---

## Categoría 1 — Código muerto SEGURO (cero referencias vivas)

Sin referencias fuera de su propia definición/tests. Eliminación de bajo riesgo.

**Archivos completos:**
- `frontend/lib/businessTime.ts` — `@deprecated` calendario laboral v4.6; 0 refs no-test. Borrar también sus tests.
- `frontend/lib/db/actions/fauchardHolidays.ts` — CRUD feriados v4.6; solo lo referencian schema/infra (definición de tabla), nunca se invoca.
- `frontend/components/cases/AcceptedProposalSummary.tsx` — solo auto-referencia (ya en `knip.json → ignore`).
- `frontend/components/admin/fauchard/QuotationMetricsPanel.tsx` — solo auto-referencia.
- `frontend/components/admin/fauchard/InvitationDistributionChart.tsx` — solo auto-referencia.

**Símbolos/aliases deprecados (editar archivo, no borrarlo):**
- `frontend/lib/db/actions/assignments.ts`: aliases `getMyInvitationsAction`, `getMyInvitationForCaseAction`, `getInvitationDetailsAction`; tipos `InvitationItem`, `InvitationStatus`.
- `frontend/lib/db/actions/invitations.ts` — archivo que solo re-exporta los aliases anteriores (borrar tras migrar imports a `assignments.ts`).
- `frontend/lib/db/actions/fauchard.ts`: `buildProposalAction` (privada, no exportada, sin uso).

**Dependencia:**
- `pg` en `frontend/package.json` — 0 imports. Quitar de `dependencies` (mantener `postgres`).

**Verificación previa al borrado real:**
```bash
cd frontend && npm run audit:unused          # knip confirma huérfanos
grep -rn "<símbolo>" --include="*.ts" --include="*.tsx" . | grep -v node_modules
npm run type-check                            # tras cada bloque de borrado
```

---

## Categoría 2 — Legacy cotización/integral (REVISAR contra BD antes de tocar)

Aún ejecutado para **casos históricos** (`serviceType` `integral`/`solo_fabricacion`, asignaciones
`status='quoted'`). No eliminar sin confirmar que no quedan datos vivos que lo necesiten.

- Wrappers en `frontend/lib/db/actions/fauchard.ts`: `runFauchardAction`, `sendInvitationsAction`, `submitQuoteAction`, `evaluateQuotesAction`, `checkAndExpireProposalsAction`. (Hoy delegan a la ruta v2 o retornan `skipped`.)
- `frontend/lib/db/actions/proposal.ts`: `acceptProposalAction`, `expireDentistComparativeWindowAction`, `withdrawQuoteAction`, `rejectProposalAction` (solo tests/crons legacy).
- Cron legacy `frontend/app/api/cron/evaluate-quotes/route.ts`.
- Ramas legacy en `frontend/components/cases/CaseWorkflowStepper.tsx` y UCH (`UchQuoteBreakdown.tsx`, `uchQuoteDisplay.ts` **siguen en uso** para histórico → mantener).
- Campos `quoted*` y tabla/alias `case_invitation`, columnas `business_*` en `fauchard_config`, tabla `fauchard_holiday` → **mantener en schema** (compat BD); requieren migración de datos para eliminar.

**Gate obligatorio antes de remover:**
```sql
SELECT count(*) FROM clinical_case WHERE service_type IN ('integral','solo_fabricacion');
SELECT count(*) FROM case_assignment WHERE status = 'quoted';
```
Si ambos son 0 en prod → la Categoría 2 pasa a "seguro". Mientras no, dejar como está.

---

## Categoría 3 — Scripts one-time ya aplicados (borrar del repo)

- `frontend/scripts/migrate-catalogs-fk.ts` (deprecated)
- `frontend/scripts/migrate-catalogs-opaque-codes.ts` (deprecated)
- `frontend/scripts/migrate-recovery-v39.ts` (ya aplicado)
- `frontend/scripts/migrate-tokens.ts` (codemod completado)
- `frontend/scripts/migrate-worktype-taxonomy-v513.ts` (la migración real corre en infrastructure.ts)

**Scripts Python de diagnóstico one-shot (borrar):**
- `frontend/check_jsx.py`, `frontend/check_full_jsx.py`, `frontend/trace_divs.py`

**Toolkit legacy Firebase (borrar; reemplazado por NextAuth+Drizzle):**
- `scripts/toolkit.py`, `scripts/toolkit_gui.py`, `scripts/run_toolkit.sh`

**Mantener** (recurrentes/idempotentes): todos los `seed-*.ts`, `backfill-*.ts`,
`reseed-contact-guard-regex.ts`, `diag-contact-guard.ts`, `test-emailjs.ts`, `frontend/deploy_gui.py`.

---

## Categoría 4 — Documentación obsoleta (borrar del repo; git conserva historial)

**`Backlog/` — sprints cerrados (carpeta completa):**
`00_analisis_refactoring.md`, `Sprint_0`…`Sprint_8`, `Estandard de desarrollo.md`,
`202605022_Plan Ajuste Login.md`.

**`Doc/` legacy:**
`DentFlowAi_Backlog_Migracion_v2.md`, `DentFlowAi_Especificaciones.md`,
`dentflowai-design-system.md`, `dentflowai-design-system-migracion.md`,
`workflow-dentista-tecnico.md`, `paleta.md`, `Pitch_Slide_Estado_Actual.md`.

**`Doc Servicio Orquestado/` — puntos en el tiempo:**
`ESTADO_DEL_ARTE.md`, `post_rollout_calibration.md`, `plan_configurador_fauchard.md`.
(Mantener `plan_flujo_tiempos.md` — referenciado desde CLAUDE.md.)

**Conservar siempre:** los `CLAUDE.md`/`AGENTS.md`, `README.md`, y los referenciados desde
CLAUDE.md: `Doc/Ciclo_Desarrollo.md`, `Doc/Estrategia_Versionado.md`,
`Doc/DentFlowAI_Diseño_Funcional_Liga.md`, `Doc/Servicio Orquestado/plan_flujo_tiempos.md`.

**`Backup/` (1.3 GB) → CONSERVAR** (decisión del usuario). No está en git; queda en disco.

---

## Categoría 5 — Flags placeholder sin código (informativo)

Definidos pero sin ninguna implementación detrás (no son código muerto, son futuros):
`AUTH_DB_SESSIONS_ENABLED`, `GOOGLE_OAUTH_ENABLED`, `EMAIL_VERIFICATION_ENABLED`,
`SINGLE_SESSION_ENABLED`, `TAB_CLOSE_LOGOUT_ENABLED`. No requieren acción; solo documentarlos
como "reservados".

---

## Resumen de prioridad

| Prioridad | Qué | Riesgo | Acción |
|---|---|---|---|
| **P1** | Categoría 1 (muerto) + Categoría 3 (scripts) + Categoría 4 (docs) | Bajo | Eliminar (cuando se autorice ejecución) |
| **P2** | Categoría 2 (legacy cotización) | Medio | Eliminar **solo** si el gate SQL da 0 filas |
| **Info** | Categoría 5 (flags) | — | Documentar, no borrar |

Estimado P1: ~5 archivos de código muerto + 5 componentes/aliases, ~8 scripts, ~22 .md.
`Backup/` (1.3 GB) se conserva.

---

## Estrategia de ejecución (rama aislada + commits por categoría)

Toda la limpieza se hace en una **rama desechable** partida de `v2`, nunca directo sobre `v2`.
Así `v2` (lo que se despliega a staging) queda intacta hasta validar todo. Cada categoría va en
su **propio commit** para poder revertir o recuperar de forma granular (archivo por archivo o
commit por commit), sin restaurar ningún `.zip` de `Backup/`.

### Paso 0 — Crear la rama de trabajo
```bash
git checkout v2
git checkout -b cleanup/dead-code      # copia paralela; v2 no se toca
```
Cambiar de rama (`git checkout <rama>`) solo te mueve y reescribe los archivos del árbol; **no
prueba nada** — las pruebas son los `npm run ...` de abajo.

### Paso 1 — P1 código muerto (commit 1)
Borrar Categoría 1: `lib/businessTime.ts` (+ sus tests), `lib/db/actions/fauchardHolidays.ts`,
`AcceptedProposalSummary.tsx`, `QuotationMetricsPanel.tsx`, `InvitationDistributionChart.tsx`,
aliases en `assignments.ts` (migrar imports → `assignments.ts` y borrar `invitations.ts`),
`buildProposalAction`, dep `pg` en `package.json`.
```bash
npm run type-check && npm run test:run && npm run audit:unused
git commit -am "chore(cleanup): elimina código muerto (businessTime, fauchardHolidays, componentes huérfanos, aliases, dep pg)"
```

### Paso 2 — P1 scripts one-time (commit 2)
Borrar Categoría 3: 5 `migrate-*.ts` aplicados, 3 `.py` de diagnóstico en `frontend/`, toolkit
Firebase (`scripts/toolkit.py`, `toolkit_gui.py`, `run_toolkit.sh`).
```bash
npm run type-check
git commit -am "chore(cleanup): elimina scripts one-time ya aplicados y toolkit Firebase legacy"
```

### Paso 3 — P1 docs obsoletos (commit 3)
Borrar Categoría 4: `Backlog/` completo, docs legacy de `Doc/` y `Doc Servicio Orquestado/`
listados arriba. **Conservar `Backup/`** y los `.md` referenciados desde CLAUDE.md.
```bash
git commit -am "chore(cleanup): elimina documentación obsoleta (Backlog/, docs legacy)"
```

### Paso 4 — Gate SQL antes de P2
Correr el gate de Categoría 2 contra prod:
```sql
SELECT count(*) FROM clinical_case WHERE service_type IN ('integral','solo_fabricacion');
SELECT count(*) FROM case_assignment WHERE status = 'quoted';
```
- Si **ambos = 0** → ejecutar P2 (legacy cotización) en un commit 4 aparte, con el mismo ciclo de validación.
- Si **> 0** → **no** tocar Categoría 2; queda documentada como pendiente.

### Paso 5 — Validación final y merge
```bash
npm run validate:full                  # lint + type-check + build
# Si todo pasa:
git checkout v2 && git merge cleanup/dead-code
# Si algo no convence, descartar TODO sin afectar v2:
git checkout v2 && git branch -D cleanup/dead-code
```

### Recuperación granular (si se borró algo de más)
- Antes de commit: `git restore <archivo>`.
- Después de commit: `git checkout <commit>^ -- <archivo>` (lo trae del estado previo a su borrado).
- Localizar un borrado: `git log --diff-filter=D --name-only --oneline`.
- Único caso NO recuperable por git: `Backup/` y archivos en `.gitignore` (no están en el listado de borrado).

## Entregable de esta tarea

Este archivo **es** la auditoría + la estrategia de ejecución. **No se ejecuta ninguna eliminación
en esta sesión.** Cuando se autorice, ejecutar Pasos 0→5 en la rama `cleanup/dead-code`,
validando con knip + type-check + tests entre commits.

> Copia en repo: `Doc/Auditoria_Eliminables.md` (sincronizar tras aprobar este plan).
