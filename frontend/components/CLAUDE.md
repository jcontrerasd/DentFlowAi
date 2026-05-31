# components/ — Componentes React

## Subdirectorios
- `cases/` — UnifiedCaseHub, CaseWorkflowStepper, CaseCreationWizard, KanbanBoard, ComparativeOffersPanel, AcceptedProposalSummary, CaseDetailManagementBar, OfferConditionsBlock
- `cases/uch/` — Subcomponentes del UCH (ver sección UCH abajo)
- `profile/` — SkillMatrixForm (matriz habilidades 0-7 por tipo de trabajo), AvailabilityToggle
- `invitations/` — InvitationCard, QuoteFormDrawer
- `admin/` — FauchardWeightsPanel, FauchardFiltersPanel, FauchardCalendarPanel (feriados + horario laboral v4.6), LeagueConfigPanel, QuotationMetricsPanel, SimulatorPanel, TechnicianRankingTable, ImpersonationSelector
- `theme/` — ThemeProvider, ThemeContext, ThemeToggleButton (modo claro/oscuro/sistema; tokens en `app/theme.css`)
- `ui/` — Primitivos: Button, Input, StatusBadge, FocusTrap
- `DentalViewer3D.tsx` — Visor Three.js para STL (lazy-loaded)

## Patrones
- `useToast()` de ToastContext para feedback — NO usar `alert()`
- FocusTrap obligatorio en modales que bloquean flujo crítico
- Animaciones con `framer-motion`; transiciones de estado con `layoutId`

## CaseWorkflowStepper
Renderiza la línea de tiempo de estados del caso:
- `BASE_STEPS`: borrador → enEvaluacion → propuestaLista → aceptadaPendienteInicio → enEjecucion → enRevision → disenoAprobado
- `FABRICATION_STEPS` (solo `isIntegral || isSoloFab`): enFabricacion → enviado
- `FINAL_STEP`: completado
- Terminal: rechazado | cerrado (aparece appended al final si `isTerminal`)
- `variant='techRejected'`: banda rosa de Propuesta lista → Diseño aprobado; paso final cambia a "Rechazado" rojo con XCircle.
- **`serviceType='solo_fabricacion'`**: el stepper omite `enEjecucion`, `enRevision`, `disenoAprobado` y va directo a `enFabricacion`.
- **Integral o `solo_fabricacion` con terminal `rechazado`/`cerrado`**: los pasos posteriores no cumplidos se pintan en rosa (`integralTerminalReject`), no en gris.
- La fecha de entrega aparece debajo del step "En ejecución" si `workDeadline` está disponible.

## CaseCreationWizard
- `formData.serviceType: 'solo_diseno' | 'solo_fabricacion' | 'integral'` (radio selector en paso 2).
- `formData.needsFabrication` se sincroniza automáticamente (`true` para `integral` y `solo_fabricacion`).
- Paso 4 condicional:
  - `solo_diseno` / `integral`: tres slots de scans.
  - `solo_fabricacion`: un solo slot **Archivo de diseño** (STL/PLY/OBJ) → `files.designFile`.
- `isStepValid()` exige `files.designFile` en `solo_fabricacion` y `files.superior` en los demás.
- **Catálogos UI**: prioridad, restauración, material y color VITA se cargan vía `listUrgencyLevelsAction`, `listRestorationTypesAction`, `listDentalMaterialsAction`, `listVitaShadesAction` (de `@/lib/db/actions/catalogs`). El wizard renderiza vacío hasta que llega la respuesta. Mismo patrón en la edición inline de la ficha y en el filtro de urgencia.
- **El form persiste codes (slugs)**, no labels. `formData.material === 'zirconio_multicapa_premium'`. La server action resuelve a id antes de insertar.
- **Eliminado**: opción "Otro libre" con input de texto. Si falta una opción, admin la agrega en `/dashboard/admin/catalogos`.

## CaseDetailManagementBar
- Renderiza iconos Grabar / Publicar / Editar / Eliminar / Archivar / Restaurar / Crear copia.
- Estados visibles/habilitados vienen de `getCaseDetailActionState()` en `lib/cases/caseDetailActions.ts`.

## UchFauchardActionsPanel
- `serviceType === 'integral'`: formulario split (Diseño + Fabricación) + total read-only.
- `solo_diseno` / `solo_fabricacion`: un precio + un plazo (`kind: 'flat'`).
- Sheet inferior de confirmación legal muestra desglose si la cotización es split.
- En `aceptadaPendienteInicio`, botón "Iniciar fabricación" cuando es `solo_fabricacion`.

## UnifiedCaseHub (UCH) — componente más complejo
Props clave:
- `actingAsDentista` / `actingAsTecnico` — controlan qué UI/tablas se muestran.
- `uchPresentationRole` — fuerza tabla A/B cuando admin tiene ambos flags.
- `currentUser` — usuario real o simulado (para `resolveUchThreadLane`).
- `proposalDeadlineMs` + `serverClockAnchor` — countdown del header.
- `clinicalCase` — estado, fechas, laboratorio asignado, etc.
- `myInvitation` — invitación del técnico viewer (filtra eventos por invitationId).

Lógica interna:
- `roleScopedEvents`: filtra eventos por rol y estado de invitación.
- `presentingAsDentista`: activa `splitCasoPublicadoForDentista()` para `CASO_PUBLICADO`.
- `filteredEvents`: aplica filtro de fase (`todos` / `propuesta` / `diseno` / `produccion`) + split + orden.
- `timelineRows`: mezcla eventos con filas de acción (`buildUchTimelineRows`).
- Countdown del header: `useRemainingMsUntil(headerCountdownDeadlineMs, serverClockAnchor)`.

### Subcomponentes en `cases/uch/`
| Archivo | Responsabilidad |
|---------|----------------|
| `UchEventBubble.tsx` | Burbuja individual; llama `resolveUchThreadLane` para carril y voz |
| `UchFauchardActionsPanel.tsx` | Cotizar, iniciar trabajo, acciones Fauchard |
| `UchDeliveryPanel.tsx` | Entrega de diseño/revisión (técnico) |
| `UchDentistReviewPanel.tsx` | Revisión/aprobación del dentista |
| `UchDealSummary.tsx` | Resumen del acuerdo aceptado |
| `UchQuoteBreakdown.tsx` | Desglose diseño/fabricación en UI de cotización |
| `buildUchTimelineRows.ts` | Combina eventos y filas de acción ordenadas por timestamp |
| `uchTimelineTypes.ts` | Tipos: `UchTimelineRow`, `UchCaseEventLite`, `UchActionRowId` |
| `uchHubActionVisibility.ts` | Mostrar/ocultar acciones según estado del caso y rol |

## ComparativeOffersPanel
- Embebido dentro del hilo del UCH (no es overlay).
- Visible solo para dentista con `status === propuestaLista`.
- El countdown de propuesta **no** va aquí — solo en el header del UCH.
- Si `isExpired` pero no `invalidDeadline`, muestra mensaje de vencimiento y bloquea acciones.
- Ofertas `integral`: sub-grid Diseño + Fabricación cuando hay `designPriceCLP` / `fabricationPriceCLP`; fallback al total.

## SkillMatrixForm
- Props: `initialCad`, `initialCam` (precargan toggles desde DB)
- `onSaveSuccess` callback para avanzar paso en onboarding
- Agrupa tipos de trabajo en `WORK_TYPE_GROUPS` definidos en el propio archivo
