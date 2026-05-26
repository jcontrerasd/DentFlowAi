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
3. **ActionPanel** → acciones embebidas en el **mismo hilo** (`buildUchTimelineRows`, filas expandibles en `frontend/components/cases/uch/`). Sin overlays `fixed inset-0` por defecto. Confirmación legal de cotización: **sheet inferior** en el hub.

### Principio fundamental
Fauchard prioriza **una acción primaria** expandida en el hilo; el resto puede quedar colapsado. **No** hay chat libre al pie del UCH. Fauchard **sí** aparece como voz del sistema en burbujas del carril `thread` cuando `presentationAuthor: 'fauchard'` o reglas de `uchThreadLane.ts` lo indican.

### Configuración Fauchard (motor)
- Una sola fila `fauchard_config` activa; casos publicados anclan `clinical_case.fauchard_config_id`.
- `getConfigForCase(caseId)` para totales comparativos; `getActiveConfig()` para vistas admin globales.

### Mensajes estandarizados por tipo
| Tipo | Quién lo ve | Componente / ubicación |
|------|-------------|------------------------|
| OFERTA_ENVIADA | Técnico (carril propio) | `UchFauchardActionsPanel.tsx` + `submitQuoteAction` |
| OFERTAS_COMPARATIVAS_LISTAS | Dentista | `ComparativeOffersPanel.tsx` (embebido en hilo) |
| PROPUESTA_ACEPTADA | Ambos | `AcceptedProposalSummary.tsx`, `UchDealSummary.tsx` |
| OFERTA_RECHAZADA / OFERTA_NO_SELECCIONADA | Técnico (perdedor) | `UchEventBubble.tsx` + snapshot en payload |
| TRABAJO_INICIADO | Ambos | `UchFauchardActionsPanel.tsx` + `startWorkAction` |
| REVISION_ENVIADA | Ambos | `UchDeliveryPanel.tsx` + entrega en `cases.ts` |
| TRABAJO_APROBADO / REVISION_SOLICITADA | Ambos | `UchDentistReviewPanel.tsx` + `approveWorkAction` / `requestRevisionAction` |
| FABRICACION_INICIADA / CASO_DESPACHADO | Ambos | `transitionToManufacturingAction`, `registerDispatchAction` en `cases.ts` |
| RECEPCION_CONFIRMADA | Ambos | `confirmReceptionAction` en `cases.ts` |
| CASO_PUBLICADO | Dentista (split) | `splitCasoPublicadoForDentista()` en `lib/uchCasoPublicadoSplit.ts` |

### Split de CASO_PUBLICADO
- Mitad dentista (`::dentist`): `__uchPresentationSelfHalf: true` → carril **self** ("Yo", derecha).
- Mitad Fauchard (`::fauchard`): `presentationAuthor: 'fauchard'` → carril **thread** ("Fauchard", izquierda).

### Carril de burbujas
Usar `resolveUchThreadLane()` de `lib/uchThreadLane.ts`. No reimplementar lógica propia. `uchPresentationRole` fuerza tabla A (dentista) o B (técnico) cuando admin tiene ambos flags.

### Countdowns
- **Etapa 1 (cotizar):** `case_invitation.expires_at` — banner ficha + HMS en tarjetas/UCH.
- **Etapa 2 (elegir oferta):** `proposalExpiresAt` — HMS **solo en cabecera UCH** (dentista, `propuestaLista`). No duplicar en `ComparativeOffersPanel`.
- `serverClockAnchor` + `uchPanelMounted` para sincronía y persistencia del timer.

### Anonimato
- Dentista NUNCA ve nombre del técnico, precio cotizado ni cantidad de invitados.
- Técnico NUNCA ve eventos de otros técnicos del mismo caso.
- `sanitizeUchPayloadForViewer()` en `uchPresentation.ts`.
- Admin ve identidades reales.

### Stack y rutas
- Server Actions **solo** en `frontend/lib/db/actions/`.
- Identidad: **solo** `getServerIdentity()`.
- Componentes UCH: `frontend/components/cases/` y `frontend/components/cases/uch/`.
