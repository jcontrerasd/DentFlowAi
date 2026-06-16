---
name: uch-reglas-diseno-dentflowai
description: DentFlowAi UCH (UnifiedCaseHub) design rules—single activity timeline, primary Fauchard action, standardized event types, anonymity, frontend/ and components/cases/uch/ paths. Same markdown as the UCH section in CLAUDE.md; use @uch-reglas-diseno-dentflowai when editing case hub / visibility.
disable-model-invocation: true
---

## UCH — Reglas de Diseño DentFlowAi

> Fuente canónica: sección **UCH — Reglas de Diseño DentFlowAi** en [CLAUDE.md](../../../CLAUDE.md) (raíz del repo).

### Qué ES el UCH
El UCH (UnifiedCaseHub) NO es un chat libre. Es una pantalla de flujo guiado con tres capas:
1. **CaseWorkflowStepper** → línea de tiempo del estado (`frontend/components/cases/CaseWorkflowStepper.tsx`).
2. **EventStream** → historial por rol en `UnifiedCaseHub.tsx` (vista Actividad; sin pestaña Resumen; filtros de fase: Todos / Propuesta / Diseño / Produc.).
3. **ActionPanel** → acciones embebidas en el **mismo hilo** (`buildUchTimelineRows`, filas expandibles en `frontend/components/cases/uch/`). Sin overlays `fixed inset-0` por defecto.

### Principio fundamental
Fauchard prioriza **una acción primaria** expandida en el hilo (aceptar asignación, revisión dentista, entrega de diseño, etc.); el resto puede quedar colapsado. **No** hay chat libre al pie del UCH. Fauchard **sí** aparece como voz del sistema en burbujas del carril `thread` cuando `presentationAuthor: 'fauchard'` o reglas de `uchThreadLane.ts` lo indican.

### Configuración Fauchard (motor v2)
- Una sola fila `fauchard_config` activa; casos publicados anclan `clinical_case.fauchard_config_id`.
- Publicar: `classifyCaseAction` → `runAssignmentAction` → `assignCaseAction`.
- `getConfigForCase(caseId)` para deadlines y pesos; `getActiveConfig()` para vistas admin globales.

### Mensajes estandarizados por tipo
| Tipo | Quién lo ve | Componente / ubicación |
|------|-------------|------------------------|
| ASIGNACION_RECIBIDA / INVITACION_RECIBIDA | Técnico asignado | `UchFauchardActionsPanel.tsx` + `acceptAssignmentAction` |
| ASIGNACION_REASIGNADA | Técnico (nuevo asignado) | Evento Fauchard tras `tryReplaceAfterRejectAction` |
| CASO_EN_COLA | Dentista | `PendingPoolBanner` + evento en hilo |
| PROPUESTA_ACEPTADA / ASIGNACION_ACEPTADA | Ambos | `AcceptedProposalSummary.tsx`, `UchDealSummary.tsx` |
| OFERTA_RECHAZADA_POR_TECNICO | Sistema (voz Fauchard) | `UchRejectInvitationDialog.tsx` + `rejectInvitationIndividualAction`. Rechazo de asignación pending (gated por `REJECTION_INDIVIDUAL_ENABLED`). **No** cuenta como no-respuesta; dispara reemplazo automático. |
| TRABAJO_INICIADO | Ambos | `UchFauchardActionsPanel.tsx` + `startWorkAction` |
| REVISION_ENVIADA | Ambos | `UchDeliveryPanel.tsx` + entrega en `cases.ts` |
| TRABAJO_APROBADO / REVISION_SOLICITADA | Ambos | `UchDentistReviewPanel.tsx` + `approveWorkAction` / `requestRevisionAction` |
| CASO_PUBLICADO | Dentista (split) | `splitCasoPublicadoForDentista()` en `lib/uchCasoPublicadoSplit.ts` |
| CALIFICACION_ENVIADA | Dentista + técnico calificado | `UchRatingPanel.tsx` |

**Legacy (solo casos v1):** `OFERTAS_COMPARATIVAS_LISTAS`, `OFERTA_ENVIADA` (cotización), `UchQuoteBreakdown.tsx`.

### Split de CASO_PUBLICADO
- Mitad dentista (`::dentist`): `__uchPresentationSelfHalf: true` → carril **self** ("Yo", derecha).
- Mitad Fauchard (`::fauchard`): `presentationAuthor: 'fauchard'` → carril **thread** ("Fauchard", izquierda).

### Carril de burbujas
Usar `resolveUchThreadLane()` de `lib/uchThreadLane.ts`. `ASIGNACION_RECIBIDA` / `INVITACION_RECIBIDA` siempre thread+Fauchard. `uchPresentationRole` fuerza tabla A (dentista) o B (técnico) cuando admin tiene ambos flags.

### Countdowns
- **Etapa 1 (aceptar asignación):** `case_assignment.expires_at` — HMS en cabecera UCH (técnico); banner ficha dentista en `enEvaluacion`.
- **Etapa revisión (v5.0):** `tDentistReviewHours`; `last_revision_submitted_at` reinicia la ventana en cada entrega. Al vencer, marca "respuesta vencida".
- **Legacy:** `proposalExpiresAt` en `propuestaLista` (comparativo) — solo casos históricos.
- `serverClockAnchor` + `uchPanelMounted` para sincronía y persistencia del timer.

### Espera y republicación (v5.0)
- **Banner "Buscando técnicos disponibles…"**: dentista, caso en `pendiente_pool` (`PendingPoolBanner`). Incluye "Cancelar publicación" (`cancelPendingPoolAction`).
- **Check-in al dentista** al 50% del TTL: `CheckInDentistaModal` (cron `process-pool-queue`).
- **Republicar**: `sin_asignacion_fallo` o `sin_cotizaciones_fallo` (legacy) → `RepublicarModal` → `republicarCaseAction`.

### Anonimato
- Dentista NUNCA ve nombre del técnico ni cantidad de candidatos evaluados.
- Técnico NUNCA ve eventos de otros técnicos del mismo caso.
- `sanitizeUchPayloadForViewer()` en `uchPresentation.ts`.
- Admin ve identidades reales.

### Stack y rutas
- Server Actions **solo** en `frontend/lib/db/actions/`.
- Identidad: **solo** `getServerIdentity()`.
- Componentes UCH: `frontend/components/cases/` y `frontend/components/cases/uch/`.
