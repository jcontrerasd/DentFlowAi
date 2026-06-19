# Auditoría — Mismatch del estado de Calidad por rol (caso DF-1033)

**Rama:** `tmp-qa` · **Fecha:** 2026-06-19 · **Flag:** `QUALITY_GATE_ENABLED`

---

## 1. Resumen ejecutivo

En el caso **DF-1033** un mismo caso muestra distinto estado a cada rol, y el **dentista percibe la etapa de Calidad**, lo que viola el requisito de anonimato (CLAUDE.md → UCH/Anonimato: el dentista nunca debe ver la etapa de Calidad; `enRevisionCalidad` y `certificadoCalidad` deben mostrársele enmascarados como `enEjecucion`).

- **Severidad: Alta** — fuga de anonimato hacia el dentista.
- **Naturaleza: bug de presentación en el cliente**, no de datos. El estado en la base de datos es correcto y las transiciones de `quality.ts` funcionan.
- **Impacto secundario:** clasificación incorrecta de KPIs (el caso cae en el bucket "Otros" para técnico y dentista).

**Causa raíz:** los dos estados nuevos de la etapa de Calidad (`enRevisionCalidad` y, sobre todo, `certificadoCalidad`) solo se propagaron completamente a `CaseWorkflowStepper`. Las demás superficies que muestran/clasifican el estado quedaron sin cubrir: el badge del header de la ficha no enmascara por rol y `STATUS_MAP` no tiene entrada para `certificadoCalidad`; los clasificadores de KPI no contemplan `CERTIFICADO_CALIDAD`.

---

## 2. Caso analizado (DF-1033) — el estado en BD es correcto

Evidencia recogida en la BD local (`docker exec dentflowai-db-1 psql -U dentflow_admin -d dentflowai_local`). Comandos de reproducción en el Apéndice (§7).

**`clinical_case`** (`id=26856a93-add7-4923-b094-03e9276f9839`):

| Campo | Valor |
|---|---|
| `case_number` | DF-1033 |
| `status` | `certificadoCalidad` |
| `internal_status` | `enEjecucionDiseno` |
| `service_type` | `solo_diseno` |
| `quality_reviewer_id` | `ee7250ff…` (QA1) |
| `assigned_technician_id` | `1edd941c…` (Técnico 1) |
| `doctor_id` | `3f73c8f6…` (Dr Dentista 1) |

**`clinical_case_delivery`** (entregas):

| version | status | quality_status |
|---|---|---|
| 1 | `rejected` | `rejected` |
| 2 | `rejected` | `rejected` |
| 3 | `pending` | `certified` |

**`case_quality_assignment`:** 1 fila `active` para QA1 (sin derivaciones).

**Actores:** `dentista1@d1.cl` (Dr Dentista 1), `tecnico1@t1.cl` (Técnico 1), `q1@q1.cl` (QA1).

**Conclusión:** `certificadoCalidad` es el estado **legítimo y esperado**: las versiones 1 y 2 fueron rechazadas por Calidad (el bucle Calidad↔Técnico funcionó), y la v3 quedó certificada y `pending`, esperando que el técnico la envíe al dentista (`sendToDentistAction`). No hay corrupción de datos ni fallo en las transiciones de estado.

---

## 3. Síntomas por rol → causa raíz

| Síntoma observado | Causa raíz (`archivo:línea`) |
|---|---|
| **Dr Dentista 1 ve `certificadoCalidad`** (debería ver "En Ejecución") | [page.tsx:1978](../frontend/app/dashboard/cases/[id]/page.tsx#L1978) renderiza `<StatusBadge status={isEditingStatus} />` con el `status` **crudo** (def. en [page.tsx:1846](../frontend/app/dashboard/cases/[id]/page.tsx#L1846)), **sin enmascarar por rol**. El stepper sí enmascara ([CaseWorkflowStepper.tsx:75-78](../frontend/components/cases/CaseWorkflowStepper.tsx#L75-L78)), pero el badge del header no recibe rol. Además [StatusBadge.tsx](../frontend/components/ui/StatusBadge.tsx) no tiene entrada `certificadoCalidad` en `STATUS_MAP` → cae al fallback que usa el string crudo como label. Nota: incluso `enRevisionCalidad` (mapeado en `STATUS_MAP:35` como "Revisión calidad") se filtraría al dentista por este mismo badge. |
| **QA1 ve `certificadoCalidad`** (debería ver "Certificado / Listo para enviar") | Mismo badge crudo del header ([page.tsx:1978](../frontend/app/dashboard/cases/[id]/page.tsx#L1978)) + falta de entrada `certificadoCalidad` en `STATUS_MAP`. El dashboard de QA1 sí está correcto: [dashboardMetricsConfig.ts:83](../frontend/lib/dashboard/dashboardMetricsConfig.ts#L83) mapea `certificadoCalidad → 'certificadas'` ("Listas para enviar"). |
| **Técnico 1 ve `otro`** | [classifyCaseForDashboardKpi.ts](../frontend/lib/dashboard/classifyCaseForDashboardKpi.ts) → `mapWinnerCaseStatusToTechKpi` mapea `EN_REVISION_CALIDAD → 'enRevisionCalidad'` (líneas 67-68) pero **no tiene case para `CERTIFICADO_CALIDAD`** → `default: 'otros'` (líneas 74-75). Afecta tanto el dashboard del técnico como la franja `CaseViewerStatusStripe` de la ficha (ambos comparten este clasificador). |

---

## 4. Inventario de superficies que consumen `status`

| Superficie | `archivo:línea` | `enRevisionCalidad` | `certificadoCalidad` | Role-aware | Correcto p/ dentista |
|---|---|---|---|---|---|
| Stepper | `CaseWorkflowStepper.tsx:75-78` | ✅ | ✅ (alias) | ✅ | ✅ |
| Badge header ficha | `cases/[id]/page.tsx:1978` + `StatusBadge.tsx:35` | ⚠️ label crudo visible | ❌ falta en `STATUS_MAP` | ❌ | ❌ (fuga) |
| KPI dentista | `classifyCaseForDashboardKpi.ts:92,105` | ✅ → `enEjecucion` | ❌ → `'otros'` | n/a | ⚠️ |
| KPI técnico | `classifyCaseForDashboardKpi.ts:56,67,74` | ✅ → `enRevisionCalidad` | ❌ → `'otros'` | n/a | n/a |
| KPI calidad | `dashboardMetricsConfig.ts:82-83` | ✅ → `porCertificar` | ✅ → `certificadas` | n/a | n/a |
| Tarjeta dentista | `dentistCardPresentation.ts:88-95,140` | ✅ → `enEjecucion` | ❌ → default crudo | parcial | ⚠️ |
| Filtros/KPI listado | `caseListFilters.ts` / `caseListQueryBuilder.ts` | ✅ (vía KPI) | ❌ | n/a | n/a |
| Stripe/Marketplace/Kanban | `CaseViewerStatusStripe.tsx`, `MarketplaceCaseCard.tsx`, `KanbanBoard.tsx` | indirecto (StatusBadge) | ❌ | ❌ | ❌ |

Único lugar correcto y role-aware: el **stepper** ([CaseWorkflowStepper.tsx:75-78](../frontend/components/cases/CaseWorkflowStepper.tsx#L75-L78)), que se toma como patrón de referencia para la corrección.

---

## 5. Causa raíz

La etapa de Calidad introdujo dos estados de caso (`enRevisionCalidad`, `certificadoCalidad`) pero su manejo **solo se completó en el stepper**. El resto del sistema de presentación de estado quedó parcialmente cubierto:

1. **`STATUS_MAP`** (`StatusBadge.tsx`) no tiene entrada para `certificadoCalidad` → cualquier badge que reciba ese estado muestra el string crudo.
2. **El badge del header de la ficha** (`page.tsx:1978`) no enmascara por rol → el dentista (y QA1) ven el estado real de Calidad.
3. **Los clasificadores de KPI** (`classifyDentistCaseKpi`, `mapWinnerCaseStatusToTechKpi`) no contemplan `CERTIFICADO_CALIDAD` → cae en el bucket "Otros".
4. **`getDentistCardZone`** maneja `enRevisionCalidad` pero no `certificadoCalidad`.

---

## 6. Recomendaciones de corrección

> Estado: **implementadas** en este mismo trabajo (ver plan de implementación). Se listan aquí como el qué/por qué.

1. **Helper central role-aware** `maskCaseStatusForViewer(status, viewerRole)` (`lib/cases/qualityStatusMasking.ts`), espejo de `extraAliases` del stepper, como fuente única de la regla "el dentista no percibe la etapa de Calidad".
2. **`StatusBadge` role-aware** + entrada `certificadoCalidad` en `STATUS_MAP` (label "Certificado").
3. **Header de la ficha** pasa `viewerRole` al `StatusBadge`.
4. **KPI dentista:** `CERTIFICADO_CALIDAD → 'enEjecucion'` en `classifyDentistCaseKpi`.
5. **KPI/stripe técnico:** `CERTIFICADO_CALIDAD → 'enRevisionCalidad'` en `mapWinnerCaseStatusToTechKpi` + ampliar `WINNER_CASE_STATUSES_BY_TECH_KPI`.
6. **Tarjeta dentista:** case `certificadoCalidad → enEjecucion` en `getDentistCardZone`.
7. **Defensa en profundidad:** pasar `viewerRole` al `StatusBadge` en las superficies que puedan tener viewer dentista.

**Nota menor (no bloqueante):** `internal_status=enEjecucionDiseno` en casos de Calidad. Es un estado interno (no visible al usuario) heredado del flujo de diseño; conviene confirmar que su valor es el esperado para casos en etapa de Calidad, pero no afecta la presentación pública y queda fuera del alcance de esta corrección.

---

## 7. Apéndice — reproducción (read-only)

```bash
CID=26856a93-add7-4923-b094-03e9276f9839

docker exec dentflowai-db-1 psql -U dentflow_admin -d dentflowai_local -c \
  "SELECT case_number,status,internal_status,quality_reviewer_id,assigned_technician_id,doctor_id FROM clinical_case WHERE id='$CID';"

docker exec dentflowai-db-1 psql -U dentflow_admin -d dentflowai_local -c \
  "SELECT version,status,quality_status FROM clinical_case_delivery WHERE clinical_case_id='$CID' ORDER BY version;"

docker exec dentflowai-db-1 psql -U dentflow_admin -d dentflowai_local -c \
  "SELECT calidad_user_id,status FROM case_quality_assignment WHERE clinical_case_id='$CID';"
```
