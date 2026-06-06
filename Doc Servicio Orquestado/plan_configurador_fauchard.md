# Plan funcional — Configurador Fauchard unificado (borrador único + laboratorio de simulación)

> Estado: **propuesta de diseño** (no implementado). Objetivo: eliminar la edición
> duplicada de parámetros entre tabs, garantizar que **todos** los parámetros estén
> vinculados al motor Fauchard, y ofrecer simulación + KPIs que ayuden a decidir los
> valores, respetando las dependencias entre parámetros.

## 1. Objetivo

1. **Fuente única de verdad**: cada parámetro de `fauchard_config` se edita en **un solo lugar**.
2. **Sin lost-update**: un solo guardado atómico (copy-on-write) en vez de guardados por tab.
3. **Decisión informada**: un **laboratorio** fijo (radar + KPIs + distribución real + alertas de dependencias) que refleja en vivo el borrador completo.
4. **Cobertura total**: garantizar que no haya parámetros huérfanos (editables sin consumidor, o consumidos sin editor).

Layout elegido: **tabs de edición + laboratorio fijo**. Arquitectura elegida: **borrador único + guardado global**.

---

## 2. Auditoría de parámetros (vinculación con el motor)

Matriz `parámetro → columna BD → editor UI actual → consumidor en el motor → estado`.

### 2.1 Parámetros correctamente vinculados (editable ↔ consumido)

| Parámetro | Columna BD | Editor UI (tab) | Consumido por | 
|---|---|---|---|
| `alphaQuality/Punctuality/Experience/Load/Bonus` | `alpha_*` | Pesos del Score | `calculateTechnicianScore` (`fauchard.ts`) — `score = αQ·Q+αP·P+αE·E−αC·C+αB·B−αN·N` |
| `alphaNoResponse` (αN) | `alpha_no_response` | Pesos del Score | idem; término `−αN·N` activo solo con `AVAILABILITY_MODEL_ENABLED` (N=0 si off) |
| `wQualityDays` | `w_quality_days` | Selección y Ronda | ventana del componente Q (`fauchard.ts`) |
| `wLoadDays` | `w_load_days` | Selección y Ronda | ventana del componente C/carga (`fauchard.ts`) |
| `cMax` | `c_max` | Selección y Ronda | normalización de carga (`fauchard.ts`) |
| `dBonusMaxDays` | `d_bonus_max_days` | Selección y Ronda | componente B/infrautilización (`fauchard.ts`) |
| `tCooldownMinutes` | `t_cooldown_minutes` | Selección y Ronda | filtro de exclusión (`fauchard.ts`, `simulate`) |
| `dInactivityDays` | `d_inactivity_days` | Selección y Ronda | filtro de inactividad (`fauchard.ts`, `simulate`) |
| `nInvited` | `n_invited` | Selección y Ronda | nº de invitaciones (`fauchard.ts`, `replacement.ts`, `observability.ts`) |
| `qMinSelection` | `q_min_selection` | Selección y Ronda | umbral mínimo de score para selección (`fauchard.ts`) |
| `tQuoteMinutes` | `t_quote_minutes` | Selección y Ronda | `expires_at` de invitación (`fauchard.ts`, `caseDeadlines.ts`, `replacement.ts`) |
| `tProposalHours` | `t_proposal_hours` | Selección y Ronda | `proposalExpiresAt` (`fauchard.ts buildProposal`, `caseDeadlines.ts`) |
| `platformFee` | `platform_fee` | Selección y Ronda | precio final (`proposal.ts`, `cases.ts`, `fauchard.ts`) |
| `businessHoursStart/End`, `businessDaysMask` | `business_*` | Calendario laboral | `businessTime.ts` → `workDeadline` (`proposal.ts startWork`, `fauchard.ts buildProposal`) |
| `tDentistReviewHours` | `t_dentist_review_hours` | Plazos y Sanciones | `getCaseReviewDeadlineAt` (`caseDeadlines.ts`), `dentistReviewCron.ts`, `cases.ts`, `observability.ts` |
| `tNoEligiblePoolHours` | `t_no_eligible_pool_hours` | Plazos y Sanciones | TTL cola pool (`poolQueue.ts`) |
| `maxPoolCycles` | `max_pool_cycles` | Plazos y Sanciones | ciclos de re-encole (`poolQueue.ts`) |
| `replacementCutoffMinutes` | `replacement_cutoff_minutes` | Plazos y Sanciones | corte de reemplazo (`replacement.ts`, `observability.ts`) |
| `noResponseWindowDays` | `no_response_window_days` | Plazos y Sanciones | ventana rolling (`noResponseEvents.ts`, `availabilityCron.ts`) |
| `noResponseRehabilitationDays` | `no_response_rehabilitation_days` | Plazos y Sanciones | rehabilitación (`noResponseEvents.ts`) |
| `level1/2/3Threshold` | `level_*_threshold` | Plazos y Sanciones | cálculo de nivel de sanción (`noResponseEvents.ts`) |
| `inactivityAutoOffDays` | `inactivity_auto_off_days` | Plazos y Sanciones | auto-OFF preventivo (`availabilityCron.ts`) |
| `inactivityReminderDays` | `inactivity_reminder_days` | Plazos y Sanciones | recordatorio (`availabilityCron.ts`) |

> Verificación clave: el score de producción lee los α **desde la config** (no del
> `RENORMALIZED_ALPHAS` hardcodeado, que hoy solo persiste como comentario histórico en
> `infrastructure.ts`). Los pesos editados sí orquestan.

### 2.2 Brechas detectadas (a cerrar en el plan)

| # | Parámetro/área | Problema | Acción propuesta |
|---|---|---|---|
| B1 | `nFloor` (`n_floor`, default 3) | **Huérfano**: columna en BD **sin editor y sin ningún consumidor** en el código. | **DECIDIDO: dejar reservado** — sin editor, sin cablear. Se documenta como columna reservada; queda excluido del test de cobertura (§7). |
| B2 | Parámetros de **liga** (`lMinRating`, `lCasesEvaluated`, `lMinPunctuality`, `lCasesCompleted`, `lCasesTransition`, `lPenaltyTransition`, `lDescentRating`, `lDescentDays`) | Cargados en el tipo de config y la selección por liga corre con `tech.leagueLevel`, pero el **motor de promoción/descenso que consumiría estos umbrales está dormido (Fase 2)** y su tab UI está oculto. | **DECIDIDO: exponerlos igual** — se des-oculta el tab "Sistema de Categorías" (`LeagueConfigPanel`) y se integra al borrador, con **banner de aviso**: "los umbrales se guardan pero no tienen efecto hasta cablear el motor de ligas (Fase 2)". |
| B3 | Edición duplicada (tab "Radar y Simulación" actual) | Edita y guarda 6 α (dup. con Pesos) + `dInactivity/tCooldown/platformFee/tQuote/tProposal` (dup. con Selección y Ronda) → riesgo de lost-update. | El tab deja de editar; se vuelve laboratorio read-only sobre el borrador. |
| B4 | `alphaNoResponse` gating | Editable siempre, pero su efecto (`−αN·N`) depende de `AVAILABILITY_MODEL_ENABLED`. | No es brecha; documentar en el laboratorio (badge "efecto activo solo con modelo on"). |

---

## 3. Problemas actuales (resumen)

1. **Edición duplicada** entre "Pesos del Score" / "Selección y Ronda" y el tab "Radar y Simulación".
2. **Lost-update por snapshot viejo**: cada tab carga `config` al abrir y guarda su subconjunto; si dos tabs tocan el mismo param desde su snapshot, el segundo guardado revierte al primero.
3. **Simulación aislada**: solo el tab Radar simula; los tabs que poseen los params de mayor impacto (`nInvited`, `qMinSelection`, umbrales, plazos) no dan retroalimentación.

---

## 4. Arquitectura objetivo

### 4.1 Borrador único (single source of truth)
- `FauchardDraftProvider` (context) inicializa **un** `draft` desde la config activa al montar la página de Config Fauchard.
- Expone `{ draft, setParam(key,value), dirtyKeys, reset, isValid, validationErrors }`.
- **Todos** los editores leen/escriben este draft. Se elimina el `useState({...initialConfig})` por panel.

### 4.2 Layout final: 5 espacios (nav pill), solo "Parámetros" con laboratorio
Tras descartar la "sábana" de secciones apiladas, el configurador se divide en **5 espacios independientes** (nav pill), cada uno ocupa la pantalla por sí solo:
- **Parámetros** — único con borrador + laboratorio. Vista **compacta** de los params del modelo: Pesos del Score + Selección y Ronda + Plazos y Sanciones, apilados a la izquierda; **laboratorio sticky** a la derecha; **guardado global** (`GlobalSaveBar`). El `FauchardDraftContext` se reduce a los params del modelo (no incluye `business*` ni liga).
- **Calendario** — espacio autónomo (`FauchardCalendarPanel`): horario/días con su propio Guardar + CRUD de feriados.
- **Categorías** — espacio autónomo (`LeagueConfigPanel`): guarda solo keys `l*`, banner "sin efecto hasta Fase 2" (B2).
- **Observabilidad** (gated) e **Historial** — read-only, cada uno su espacio.

Los subconjuntos de parámetros son **disjuntos** (modelo ∩ `business*` ∩ `l*` = ∅), así que los guardados autónomos no se pisan. Sin scrollspy ni secciones apiladas.

### 4.3 Laboratorio fijo (read-only)
Panel **fijo en el rail derecho** (en pantallas angostas colapsa a drawer) que refleja el draft completo en vivo:
- **Selector de escenario** (trabajo · complejidad · tipo de servicio) — pertenece al laboratorio, no a la config.
- **Radar de pesos α**.
- **Panel de detalle del parámetro** seleccionado.
- **KPIs de decisión** (ver §5).
- **Distribución de técnicos reales** vía `simulateFauchardAction({ ...escenario, configOverride: draft })` — **el override es el draft completo**, así reacciona a cualquier cambio de cualquier tab.
- **Alertas de dependencias** (ver §6).
- Reutiliza/evoluciona el actual `RadarSimulationPanel` (se le quitan los sliders/escenario-de-edición y el guardado; pasa a leer el draft).

### 4.4 Guardado global (copy-on-write) + validación + diff + motivo
- **Una** barra sticky "Guardar cambios (N)" reemplaza los guardados por tab.
- Persiste el draft completo con `updateFauchardParamsAction(draft, reason)` (copy-on-write, una nueva fila activa) → elimina el lost-update por construcción.
- Antes de confirmar: **diff** de los `dirtyKeys` ("vas a cambiar: nInvited 5→6, αQ 0.25→0.30, …") + **motivo obligatorio** (`ConfirmSaveModal requireReason`).
- **Validación cruzada centralizada** (ver §6) — botón Guardar deshabilitado si hay invariantes rotas, con el detalle del error.

---

## 5. Modelo de KPIs (decisión informada)

### 5.1 Derivados de parámetros (cálculo puro, instantáneo)
- **Foco en Calidad** = f(αQ, αE).
- **Equidad / Rotación** = f(αC, αB).
- **Agilidad / Velocidad** = f(tQuoteMinutes, tProposalHours).
- **Riesgo Pool Vacío** = f(tCooldownMinutes, dInactivityDays, αN).

### 5.2 Derivados del pool real (vía `simulateFauchardAction`)
- **Elegibles** para el escenario (`eligiblePool / total`).
- **Concentración / equidad**: cuota del cuartil superior de probabilidad (índice tipo Gini) — informa `nInvited`, αC, αB.
- **Probabilidad del top-1** (riesgo de monopolio).
- **Cobertura por categoría/capacidad** (cuántas categorías quedan con ≥1 elegible) — informa filtros e inactividad.
- **nInvited vs elegibles**: aviso si `nInvited > eligiblePool`.

---

## 6. Modelo de dependencias y validaciones cruzadas

### 6.1 Invariantes duras (bloquean Guardar)
- `|Σα| = 1.0` (incluyendo αN, re-normalizado).
- `level1Threshold < level2Threshold < level3Threshold`.
- `inactivityReminderDays < inactivityAutoOffDays`.
- `businessHoursStart < businessHoursEnd`; `businessDaysMask ∈ [1,127]`.
- Liga: `lDescentRating < lMinRating` (se desciende a un rating menor que el de ascenso). Invariante editable pero **inerte** hasta Fase 2.
- Rangos por parámetro (ya validados en `updateFauchardParamsAction`).

### 6.2 Alertas blandas (advertencia, no bloquean)
- `tCooldownMinutes` alto vs `tQuoteMinutes`/TTL → inanición de la ronda.
- `dInactivityDays` vs `inactivityAutoOffDays` → contradicción (auto-OFF más corto que el filtro de inactividad).
- `nInvited > eligiblePool` del escenario → la ronda no se puede llenar.
- αN alto con `AVAILABILITY_MODEL_ENABLED` off → cambio sin efecto real.

---

## 7. Garantía de vinculación con el motor

- **Un solo punto de persistencia**: `updateFauchardParamsAction` (copy-on-write) escribe `fauchard_config`; el motor lee siempre la config activa (`getActiveConfig` / `getConfigForCase`). Todo lo editable termina en esa tabla → orquestado.
- **El laboratorio simula con el draft completo** (`configOverride: draft`), no con subconjuntos → el preview refleja exactamente lo que el motor haría tras guardar.
- **Test de cobertura**: un test que recorra las claves de `fauchard_config` y verifique que cada una (salvo metadatos y `nFloor`/liga si quedan reservados) tiene editor y consumidor. Previene futuros huérfanos.

---

## 8. Cierre de brechas

- **B1 `nFloor`**: **reservado** — sin editor ni cableado; documentado como columna reservada y excluido del test de cobertura.
- **B2 liga**: **expuesta** — se des-oculta el tab `LeagueConfigPanel` y se integra al borrador, con banner "sin efecto hasta Fase 2".
- **B3 duplicación**: se resuelve al convertir el tab Radar en laboratorio read-only.

---

## 9. Plan por fases

- **Fase 0 — Frenar el sangrado (inmediato):** quitar del tab "Radar y Simulación" actual los sliders y el guardado (queda como vista de solo lectura sobre la config guardada) para eliminar el lost-update ya mismo. *Reversible y de bajo riesgo.*
- **Fase 1 — Borrador único + guardado global:** `FauchardDraftProvider`; refactor de los 4 tabs editores para leer/escribir el draft; barra sticky de guardado con diff + motivo; validación cruzada centralizada; quitar guardados por tab.
- **Fase 2 — Laboratorio fijo:** montar el panel laboratorio (radar + detalle + KPIs §5.1 + distribución real) leyendo el draft; selector de escenario en el laboratorio.
- **Fase 3 — KPIs de pool real + alertas de dependencias:** §5.2 y §6.2.
- **Fase 4 — Cierre de brechas y guardas:** decisión `nFloor`; test de cobertura param↔editor↔consumidor; documentación.

Cada fase es entregable e independientemente validable.

---

## 10. Decisiones tomadas

1. **`nFloor`**: ✅ **reservado** (sin UI, sin cablear).
2. **Liga**: ✅ **expuesta** (tab visible + banner "sin efecto hasta Fase 2").
3. **Ubicación del laboratorio**: ✅ **rail derecho sticky** (apilado en angostas). La distribución de técnicos va en un **expander** dentro del laboratorio (foco en radar + KPIs).
4. **Arquitectura**: ✅ borrador único + guardado global. **Layout final**: ✅ **pantalla única ("tuning studio") con chips scrollspy** (evolución desde la idea inicial de tabs; los parámetros que afectan el modelo quedan todos en una sola pantalla con el impacto siempre visible).

---

## 11. Archivos afectados (estimado)

- `frontend/components/admin/fauchard/` — nuevo `FauchardDraftContext.tsx` / provider; `GlobalSaveBar.tsx`; refactor de `FauchardWeightsPanel`, `FauchardFiltersPanel`, `PlazosYSancionesPanel`, `FauchardCalendarPanel`, `LeagueConfigPanel` (leer/escribir draft, sin guardado propio; Liga con banner "sin efecto hasta Fase 2"); evolución de `RadarSimulationPanel` → `FauchardLabPanel` (read-only, rail derecho).
- `frontend/app/dashboard/admin/fauchard/page.tsx` y `TabClient.tsx` — envolver en el provider; layout tabs + laboratorio fijo (rail derecho); barra de guardado global; des-ocultar el tab Liga.
- `frontend/lib/db/actions/fauchard.ts` — validación cruzada server-side ya existe en `updateFauchardParamsAction` (centralizar/extender). `nFloor` queda reservado (sin cambios).
- Docs: `frontend/app/CLAUDE.md`, `frontend/components/CLAUDE.md`, `frontend/lib/db/CLAUDE.md`.
