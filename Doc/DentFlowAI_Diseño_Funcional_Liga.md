# DentFlowAi — Diseño Funcional: Sistema de Ligas (Fase 2)

> **Estado:** Fase 2 — diseño funcional aprobado, motor **dormido** (no implementado).
> **Fuente:** decisiones tomadas en chat de desarrollo + estado actual del código.
> Reemplaza la descripción legacy de ligas de [Doc Servicio Orquestado/DentFlowAi_CajaNegra_Flujo.md](../Doc%20Servicio%20Orquestado/DentFlowAi_CajaNegra_Flujo.md) §3.4.
> Última actualización: 2026-06-06.

---

## 1. Propósito y alcance

El sistema de ligas (o "categorías") organiza a los técnicos en niveles de competencia
y restringe qué casos puede recibir cada uno según la complejidad del trabajo. El objetivo es
doble:

1. **Calidad para el dentista** — los casos complejos solo se ofrecen a técnicos que han
   demostrado desempeño suficiente.
2. **Progresión para el técnico** — existe una ruta meritocrática de ascenso basada en
   calificación, puntualidad y volumen de trabajo completado.

Este documento cubre el **diseño funcional** de la Fase 2: el motor automático de
ascenso/descenso de liga. **No** es un plan de implementación detallado (eso se deriva al
retomar el trabajo), pero incluye un boceto técnico en el apéndice.

---

## 2. Estado actual vs. Fase 2

### Ya existe en producción (vivo)

- **Columna de liga del técnico:** `user.league_level` (texto, default `'bronce'`) y
  `user.league_transition_count` (entero, default `0`). Ver [frontend/lib/db/schema.ts:44](../frontend/lib/db/schema.ts#L44).
- **Liga del caso:** `clinical_case.case_league` — la complejidad del caso ya se traduce a
  una liga objetivo al publicar.
- **Gating por liga en la selección:** `runFauchardAction` ya filtra candidatos por liga con
  **expansión en 3 intentos** (ver §5). Código en
  [frontend/lib/db/actions/fauchard.ts:627-640](../frontend/lib/db/actions/fauchard.ts#L627-L640).
- **Parámetros configurables:** las 8 claves `l*` viven en `fauchard_config` con defaults y
  son editables en el panel admin `LeagueConfigPanel` (tab "Sistema de Categorías"), hoy con
  banner **"sin efecto hasta Fase 2"**.

### Implementado (Fase 2, detrás de `LEAGUE_ENGINE_ENABLED`)

El motor de promoción/descenso **ya está construido** e inerte hasta encender el flag:
- **Estado del motor** en `user`: `league_transition_started_at`, `league_demotion_watch_since`,
  `league_last_evaluated_at`; auditoría en `league_change_event` (DDL `INFRA_VERSION=v5.5`).
- **Motor** en [frontend/lib/db/actions/league.ts](../frontend/lib/db/actions/league.ts):
  `computeLeagueMetricsAction` (métricas), `evaluateTechnicianAscentAction` (ascenso +
  consolidación), `evaluateTechnicianDescentAction` (descenso). Helpers puros en
  [frontend/lib/league.ts](../frontend/lib/league.ts).
- **Penalización de transición** al score en ambas rutas de `calculateTechnicianScore` vía
  [frontend/lib/leagueScore.ts](../frontend/lib/leagueScore.ts).
- **Cron diario** `processLeagueMaintenanceAction` → endpoint `/api/cron/process-league`
  (Cloud Scheduler en dev/prod) y scheduler in-process local
  ([frontend/instrumentation.ts](../frontend/instrumentation.ts)).
- **UI admin**: badge de categoría + indicador de transición en `TechnicianRankingTable`;
  `LeagueConfigPanel` con banner según el flag e invariante `lDescentRating < lMinRating`.

---

## 3. Modelo de categorías

**Cuatro categorías fijas** (no configurables — decisión tomada):

| Orden | Categoría | Identificador (`league_level`) |
|-------|-----------|-------------------------------|
| 1 | **Bronce** | `bronce` |
| 2 | **Plata** | `plata` |
| 3 | **Oro** | `oro` |
| 4 | **Élite** | `elite` |

- El conjunto de niveles es cerrado; el admin **no** puede crear, renombrar ni eliminar
  categorías. Lo que el admin configura son los **umbrales** de movimiento entre ellas (§9).
- Todo técnico nuevo arranca en **Bronce**.

### 3.1 Representación en el perfil del técnico

- La liga es un atributo del **técnico** y se muestra como **badge/ícono junto a su avatar**
  (decisión tomada) en las vistas internas (ranking admin, identidad de técnico). El dentista
  **nunca** ve la liga del técnico (se mantiene el anonimato del marketplace).
- **Nota de implementación:** hoy `league_level` vive en la tabla `user`. Al retomar Fase 2 se
  decidió conceptualmente alojarlo en el "perfil del técnico"; como el repo no tiene una tabla
  de perfil separada (los campos de perfil están sobre `user`), la decisión se materializa
  manteniendo la columna en `user` salvo que se introduzca una tabla `technician_profile`. El
  badge se renderiza junto al avatar a partir de ese valor.

---

## 4. Liga del caso (complejidad → categoría)

Al publicar, el caso recibe una liga objetivo (`clinical_case.case_league`) derivada de su
complejidad clínica. Esa liga determina qué técnicos son convocables. La derivación
complejidad → liga ya existe en el flujo de publicación; la Fase 2 **no** la modifica, solo
consume su resultado.

---

## 5. Gating: qué casos recibe cada técnico

La selección Fauchard convoca **solo técnicos de la liga compatible** con la complejidad del
caso, con un mecanismo de **expansión progresiva** si no hay suficientes elegibles (ya vivo en
código):

1. **Intento 1 — misma liga:** `tech.league_level === case_league`.
2. **Intento 2 — expandir una hacia abajo:** se admite la liga del caso y la inmediatamente
   inferior (`elite → oro`, `oro → plata`, etc.).
3. **Intento 3 — todas las ligas:** sin filtro de liga (último recurso para no dejar el caso
   sin oferta).

> Esto resuelve una de las preguntas que estaban abiertas: **la liga sí restringe por
> complejidad, no es solo un modificador de score.** El gating ya opera; lo que la Fase 2
> agrega es el movimiento **automático** de técnicos entre ligas.

La interacción con el modelo de disponibilidad v5.0 (elegibilidad AND triple, cola
`pendiente_pool`) se mantiene: el filtro de liga se aplica **dentro** del conjunto de técnicos
ya elegibles por disponibilidad. Ver [project_availability_model_v5] / `flujo_tiempos.md`.

---

## 6. Mecanismo de ascenso

Un técnico asciende a la categoría inmediatamente superior cuando cumple **los tres criterios
de forma simultánea**, evaluados sobre su liga actual:

1. **Calificación:** promedio ≥ `lMinRating` en los últimos `lCasesEvaluated` casos evaluados
   de su liga actual.
2. **Puntualidad:** porcentaje de entregas a tiempo ≥ `lMinPunctuality`.
3. **Volumen:** total de casos completados con éxito ≥ `lCasesCompleted` (condición absoluta,
   no por ventana).

Al cumplir los tres, el técnico **no** salta de inmediato: entra en **período de transición**
(§7).

---

## 7. Período de transición (prueba con red de seguridad)

Tras gatillar un ascenso, el técnico compite en la **liga superior** durante los próximos
`lCasesTransition` casos, con una **penalización temporal de su score Fauchard** de
`lPenaltyTransition` (fracción 0–1).

- Propósito: exponerlo a trabajos de mayor nivel **sin** desplazar de golpe a técnicos
  consolidados, dando una red de seguridad al dentista.
- El contador `user.league_transition_count` lleva el avance del período.
- Si completa el período satisfactoriamente, el ascenso **se consolida** (la penalización se
  retira). Si su desempeño cae por debajo de los umbrales de descenso durante la transición,
  vuelve a su liga previa (§8).

---

## 8. Mecanismo de descenso

Un técnico **desciende** una categoría si su calificación promedio cae por debajo de
`lDescentRating` de forma sostenida durante `lDescentDays` días consecutivos.

- El descenso protege la calidad ofrecida en cada liga.
- **Invariante de configuración:** `lDescentRating < lMinRating` — el umbral de descenso debe
  ser estrictamente menor que el de ascenso (evita el flip-flop ascenso/descenso inmediato).
  El panel admin valida esta invariante.

---

## 9. Parámetros configurables (`fauchard_config`)

Las 8 claves `l*` ya existen en el esquema, con defaults productivos y editables en
`LeagueConfigPanel`. Se rigen por el patrón **copy-on-write con motivo obligatorio** del resto
de Fauchard (cada cambio crea una nueva fila activa de `fauchard_config`).

| Parámetro | Significado | Default | Rango UI |
|-----------|-------------|---------|----------|
| `lMinRating` | Calificación mínima para ascender | `4.20` ⭐ | 3.5 – 5.0 |
| `lCasesEvaluated` | Ventana de evaluación (nº de casos recientes) | `10` | 5 – 20 |
| `lMinPunctuality` | Puntualidad mínima para ascender | `0.85` (85%) | 70 – 100 % |
| `lCasesCompleted` | Casos completados totales requeridos | `15` | 5 – 50 |
| `lCasesTransition` | Casos del período de transición | `3` | 1 – 10 |
| `lPenaltyTransition` | Penalización de score en transición | `0.20` (20%) | 5 – 50 % |
| `lDescentRating` | Calificación que dispara descenso | `3.00` ⭐ | 2.0 – 3.5 |
| `lDescentDays` | Días consecutivos bajo umbral para descender | `60` | 15 – 120 |

Referencias: defaults en [frontend/lib/db/schema.ts:328-336](../frontend/lib/db/schema.ts#L328-L336);
UI en [frontend/components/admin/fauchard/LeagueConfigPanel.tsx](../frontend/components/admin/fauchard/LeagueConfigPanel.tsx).

Al activar Fase 2, el banner **"sin efecto hasta Fase 2"** del panel se retira.

---

## 10. Integración con el score Fauchard

- La **penalización de transición** (`lPenaltyTransition`) se integra como un factor más en el
  cálculo de score del técnico (`calculateTechnicianScore` / `calculateScoreFromBulkData`),
  análogo a cómo el modelo de disponibilidad aplica `−αN·N`.
- Los datos de calificación se leen de la tabla `review` (la dimensión CAD/CAM ya está
  cableada). La puntualidad se deriva del cumplimiento de `workDeadline` por caso.

---

## 11. Decisiones tomadas y preguntas abiertas

### Decisiones cerradas

- **4 categorías fijas** (Bronce/Plata/Oro/Élite), no configurables.
- **La liga restringe por complejidad** (gating), con expansión progresiva — ya vivo.
- **Badge junto al avatar** del técnico en vistas internas; invisible para el dentista.
- **Ascenso por triple criterio simultáneo** + período de transición con penalización de score.
- **Descenso por calificación baja sostenida**, con invariante `lDescentRating < lMinRating`.
- Configuración por copy-on-write con motivo obligatorio (igual que el resto de Fauchard).

### Decididas durante la implementación (cerradas)

- **Cadencia:** cron **diario** (`/api/cron/process-league`, 04:00). El descenso requiere
  evaluación temporal sostenida (`lDescentDays`), así que un cron es obligatorio; uniforme y
  simple. En **local** corre vía scheduler in-process (instrumentation), no solo dev/prod.
- **Ubicación de `league_level`:** se **mantiene en `user`** (cero migración; el gating ya lo
  lee). El badge se renderiza desde ahí.
- **Penalización de transición:** **factor al score final** `score · (1 - lPenaltyTransition)`
  mientras el técnico está en transición (simple y predecible).
- **Badge en ranking admin:** medalla coloreada por categoría junto al avatar + chip
  "Transición" cuando aplica.

---

## 12. Implementación (Fase 2, entregada)

Construida en 6 sprints, todo detrás de `LEAGUE_ENGINE_ENABLED` (inerte hasta encender):

- **Esquema (`v5.5`):** columnas de estado en `user` + tabla `league_change_event`
  ([infrastructure.ts](../frontend/lib/db/infrastructure.ts), [schema.ts](../frontend/lib/db/schema.ts)).
- **Métricas:** `computeLeagueMetricsAction` — rating/puntualidad/total sobre los últimos
  `lCasesEvaluated` casos de la liga actual.
- **Ascenso/transición:** `evaluateTechnicianAscentAction` — triple criterio, transición con
  consolidación a los `lCasesTransition` casos.
- **Descenso:** `evaluateTechnicianDescentAction` — watch `lDescentDays`, tope en bronce.
- **Score:** factor de penalización en `calculateTechnicianScore`/`calculateScoreFromBulkData`
  ([leagueScore.ts](../frontend/lib/leagueScore.ts)).
- **Cron:** `processLeagueMaintenanceAction` + endpoint + scheduler local
  ([leagueCron.ts](../frontend/lib/db/actions/leagueCron.ts), [instrumentation.ts](../frontend/instrumentation.ts)).
- **UI admin:** badge en `TechnicianRankingTable`; `LeagueConfigPanel` live con invariante.
- **Tests:** `test/league-*` (métricas, ascenso, descenso, cron) + `league-score`.

### Activación controlada
1. **Staging primero:** `LEAGUE_ENGINE_ENABLED_DEV=true` en `.env.local`, `bash deploy.sh develop`,
   crear el job `process-league-dev` en Cloud Scheduler. Observar `league_change_event`.
2. **Producción:** `LEAGUE_ENGINE_ENABLED_PROD=true`, deploy, crear `process-league-prod`.
3. **Rollback:** apagar el flag (reinicia el proceso) o `gcloud scheduler jobs pause`.

Comandos de scheduler en [Doc/Ciclo_Desarrollo.md](Ciclo_Desarrollo.md) §12.

---

*Relacionado:* modelo de disponibilidad v5.0 (`Doc Servicio Orquestado/flujo_tiempos.md`,
`plan_flujo_tiempos.md`); configurador Fauchard (`plan_configurador_fauchard.md`).
