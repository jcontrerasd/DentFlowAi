# components/ — Componentes React

## Subdirectorios
- `cases/` — UnifiedCaseHub, CaseWorkflowStepper, CaseCreationWizard, KanbanBoard, AcceptedProposalSummary, CaseDetailManagementBar, OfferConditionsBlock, **RepublicarModal** + **PendingPoolBanner** + **CheckInDentistaModal** (v5.0, cola pendiente_pool / republicar; gated por el rollout de disponibilidad)
- `cases/uch/` — Subcomponentes del UCH (ver sección UCH abajo)
- `profile/` — SkillMatrixForm (matriz habilidades 0-7 por tipo de trabajo), AvailabilityToggle (disponibilidad en el perfil: **flag-aware** — con la UI v5.0 habilitada renderiza el `GlobalAvailabilitySwitch` v5.0 con estado en vivo, compartiendo fuente de verdad con el badge del header; con el flag off cae al toggle legacy sobre `user.is_available`)
- `invitations/` — InvitationCard, QuoteFormDrawer
- `admin/` — **Configurador Fauchard en 3 espacios** (nav pill en `TabClient`: Parámetros · Categorías · Historial). **Observabilidad** en `/dashboard/admin/observability`. Solo **Parámetros** usa borrador + laboratorio: **FauchardDraftContext** (6 factores α Q/P/E/B/L/N + asignación + plazos/sanción; sin legacy `nInvited`/`tProposalHours`), **GlobalSaveBar**, **FauchardLabPanel**, **FauchardWeightsPanel**, **FauchardFiltersPanel**, **PlazosYSancionesPanel** (gated). **LeagueConfigPanel** (keys `l*`, motivo obligatorio) e **Historial** (`ConfigChangeLog`, agrupa por versión). **Simulador** (`SimulatorWorkspace` + carpeta `simulator/` en `/simulate`): funnel workspace con stepper (Caso → Clasificación → Filtros → Ranking → Asignación), precio catálogo + escenario virtual; `simulateAssignmentAction` → ranking Q/P/E/B/L/N, `pricePreview`, cadena coloreada. **Monitor** (`/monitor`): `AssignmentDistributionChart`, `AssignmentMetricsPanel`, métricas sobre `case_assignment`. Otros: TechnicianRankingTable, ObservabilityPanel, etc.
- `availability/` (v5.0) — AvailabilityBadge (header), AvailabilityPanel (`/dashboard/profile/availability`), GlobalAvailabilitySwitch (orquesta toggle + diálogos in-flight; al cambiar el nivel global espeja a `user.is_available` vía `updateAvailabilityLevelAction`), BulkRejectDialog, ReactivationModal, ResponseStatusStepper (3 nodos), ResponseHistoryView, **RolloutBanner** (Fase 7: aviso in-app dismissible con cookie `availability_banner_dismissed`, en `dashboard/layout` para técnicos). Gated por `AVAILABILITY_UI_TECNICO_ENABLED` (server-side vía `getMyAvailabilityStatusAction.enabled`)
- `theme/` — ThemeProvider, ThemeContext, ThemeToggleButton (modo claro/oscuro/sistema; tokens en `app/theme.css`)
- `ui/` — Primitivos: Button, Input, StatusBadge, FocusTrap, RatingScale (escala 1–5 para calificaciones), Slider
- `demo/` — **DemoEmailPreviewListener** (solo DEMO local): polling cada 2s al endpoint `/api/demo/email-preview`, muestra modal con asunto/cuerpo/tipo del correo que "se enviaría". Gated por `NEXT_PUBLIC_DEMO_EMAIL_PREVIEW`; si el flag está off no renderiza nada ni hace polling. Montado en `dashboard/layout.tsx`.
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
- Producto activo: **solo diseño** fijo (`SERVICE_TYPES.SOLO_DISENO`); paso de archivos = scans STL/PLY/OBJ (± imágenes de referencia). Sin selector de 3 tipos de servicio (legacy en schema).
- `formData.needsFabrication` permanece `false` para nuevos casos.
- Paso de archivos: tres slots de scans (`superior`, `inferior`, `oclusal`).
- `isStepValid()` exige al menos `files.superior`.
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
| `UchDealSummary.tsx` | Resumen del acuerdo aceptado (precio, desglose, plazo, entrega). La dirección de envío del dentista se muestra en el header de la ficha del caso (badge junto al ID), no aquí. |
| `UchQuoteBreakdown.tsx` | Desglose diseño/fabricación en UI de cotización |
| `UchRatingPanel.tsx` | Calificación anónima del dentista al laboratorio (`dimension: 'design' \| 'fabrication'`, escala `RatingScale`) vía `submitUserRatingAction`. Alimenta el componente Q del score Fauchard. Renderizado desde `UnifiedCaseHub` al cierre del caso |
| `buildUchTimelineRows.ts` | Combina eventos y filas de acción ordenadas por timestamp |
| `uchTimelineTypes.ts` | Tipos: `UchTimelineRow`, `UchCaseEventLite`, `UchActionRowId` |
| `uchHubActionVisibility.ts` | Mostrar/ocultar acciones según estado del caso y rol |

## SkillMatrixForm
- Props: `hideButton`, `onSaveSuccess`, `compact`. CAD se infiere de `technician_skill.designLevel > 0` al cargar (no `organization.technicalCapabilities`).
- `onSaveSuccess` callback para avanzar paso en onboarding
- Agrupa tipos de trabajo en `WORK_TYPE_GROUPS` — **7 categorías** v5.13 (workTypes nuevos + legacy histórico)
- Slider **Diseño (grupo)**: lectura = promedio redondeado de todas las filas del grupo (incluye 0); escritura = iguala todas las filas. Tras un bulk set aparece **Undo2** para restaurar niveles individuales previos (`lib/profile/skillGroupLevel.ts`)

## Dirección geográfica en registro y perfil (v5.7)
- **`auth/register/page.tsx`** — Step 2 "Tu Perfil" incluye un bloque de dirección completo para ambos roles (dentista y técnico): selects en cascada País → Región → Comuna, más inputs de texto Calle, Número y Oficina.
- **`dashboard/profile/page.tsx`** — mismo bloque editable para ambos roles.
- Los selects de País se limitan a `SUPPORTED_COUNTRIES` (9 países); las opciones de Región y Comuna se filtran dinámicamente por `REGIONS_BY_COUNTRY[countryCode]`, ambos de `lib/constants/addressData.ts`.
- Los valores se persisten vía `updateUserAction` (`actions/user.ts`) como códigos (`CL`, `CL-RM`, `CL-RM-SAN`) y texto libre para la calle.
- El badge de dirección en la ficha del caso (`dashboard/cases/[id]`) resuelve los códigos a nombres legibles en el cliente.
