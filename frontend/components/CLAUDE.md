# components/ — Componentes React

## Subdirectorios
- `cases/` — UnifiedCaseHub, CaseWorkflowStepper, CaseCreationWizard, KanbanBoard, ComparativeOffersPanel, AcceptedProposalSummary, CaseDetailManagementBar, OfferConditionsBlock, **RepublicarModal** + **PendingPoolBanner** + **CheckInDentistaModal** (v5.0, cola pendiente_pool / republicar; gated por el rollout de disponibilidad)
- `cases/uch/` — Subcomponentes del UCH (ver sección UCH abajo)
- `profile/` — SkillMatrixForm (matriz habilidades 0-7 por tipo de trabajo), AvailabilityToggle (disponibilidad en el perfil: **flag-aware** — con la UI v5.0 habilitada renderiza el `GlobalAvailabilitySwitch` v5.0 con estado en vivo, compartiendo fuente de verdad con el badge del header; con el flag off cae al toggle legacy sobre `user.is_available`)
- `invitations/` — InvitationCard, QuoteFormDrawer
- `admin/` — **Configurador Fauchard en 4 espacios** (nav pill en `TabClient`: Parámetros · Calendario · Categorías · Historial; ver [plan_configurador_fauchard.md](../../Doc%20Servicio%20Orquestado/plan_configurador_fauchard.md)). **Observabilidad** se movió a su propia ruta `/dashboard/admin/observability` (ítem del menú lateral admin que reemplaza a "Dashboard"). Solo **Parámetros** usa el borrador + laboratorio: **FauchardDraftContext** (`FauchardDraftProvider` + `useFauchardDraft` — single source of truth de los **params del modelo**; `EDITABLE_KEYS` excluye `business*`, liga y `nFloor`), **GlobalSaveBar** (barra sticky con diff + motivo + copy-on-write; bloquea si hay invariantes rotas), **FauchardLabPanel** (laboratorio read-only sticky: radar α + detalle + KPIs + alertas; distribución de técnicos reales vía `simulateFauchardAction` en un **expander** "Ver técnicos"), con los editores **FauchardWeightsPanel**, **FauchardFiltersPanel** y **PlazosYSancionesPanel** (gated) mutando el borrador (sin guardado propio). Espacios independientes con guardado autónomo (keys disjuntas, sin lost-update): **FauchardCalendarPanel** (horario/días + CRUD feriados), **LeagueConfigPanel** (solo keys `l*`, banner "Fase 2"). Otros: QuotationMetricsPanel, SimulatorPanel, TechnicianRankingTable, ImpersonationSelector, **ObservabilityPanel** (v5.0, dashboard de 13 métricas con Recharts; lazy-loaded vía `next/dynamic`; refresh manual; métricas 3/4/12 marcadas "no disponible" hasta Fase 6), **technicians/ResetNoResponseModal** (v5.0, perdón admin de no-respuestas con motivo obligatorio; cableado en `/dashboard/admin/users` para usuarios técnicos)
- `availability/` (v5.0) — AvailabilityBadge (header), AvailabilityPanel (`/dashboard/profile/availability`), GlobalAvailabilitySwitch (orquesta toggle + diálogos in-flight; al cambiar el nivel global espeja a `user.is_available` vía `updateAvailabilityLevelAction`), BulkRejectDialog, ReactivationModal, ResponseStatusStepper (3 nodos), ResponseHistoryView, **RolloutBanner** (Fase 7: aviso in-app dismissible con cookie `availability_banner_dismissed`, en `dashboard/layout` para técnicos). Gated por `AVAILABILITY_UI_TECNICO_ENABLED` (server-side vía `getMyAvailabilityStatusAction.enabled`)
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
- Renderiza iconos Grabar / Publicar / Editar / Eliminar / **Republicar** / Archivar / Restaurar / Crear copia.
- Estados visibles/habilitados vienen de `getCaseDetailActionState()` en `lib/cases/caseDetailActions.ts`.
- **Republicar** (v5.0): visible solo cuando `status === 'sin_cotizaciones_fallo'` (dentista/admin). El icono abre `RepublicarModal`; la espera en `pendiente_pool` se muestra aparte con `PendingPoolBanner` + `CheckInDentistaModal` en la página del caso.

## UchFauchardActionsPanel
- `serviceType === 'integral'`: formulario split (Diseño + Fabricación) + total read-only.
- `solo_diseno` / `solo_fabricacion`: un precio + un plazo (`kind: 'flat'`).
- Sheet inferior de confirmación legal muestra desglose si la cotización es split.
- En `aceptadaPendienteInicio`, botón "Iniciar fabricación" cuando es `solo_fabricacion`.
- **Rechazar invitación** (v5.0): mientras `myInvitation.status === 'pending'` && `enEvaluacion`, si `REJECTION_INDIVIDUAL_ENABLED` está on (consultado vía `getRejectionUiEnabledAction`), muestra botón que abre `UchRejectInvitationDialog`. Solo el técnico invitado lo ve.

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
| `UchRejectInvitationDialog.tsx` | Rechazo individual de una invitación pending por el técnico (v5.0). Selector poblado de `invitation_rejection_reason`; "Otro" exige comentario. Lanzado desde `UchFauchardActionsPanel` solo si `getRejectionUiEnabledAction().enabled` (flag `REJECTION_INDIVIDUAL_ENABLED`, server-only surfaced al cliente). No cuenta como no-respuesta; dispara reemplazo si el modelo está on |
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
