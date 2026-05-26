# DentFlowAi — Análisis de Refactoring: Marketplace → Servicio Orquestado

> Fecha: 2026-04-29 | Basado en: ESTADO_DEL_ARTE.md, dentflowai_descripcion_funcional.md, DentFlowAi_CajaNegra_Flujo.md

---

## QUÉ SE REUTILIZA (sin cambios o con ajuste menor)

| Componente / Módulo | Archivo | Ajuste requerido |
|---|---|---|
| Sistema de autenticación (NextAuth + JWT) | `auth.config.ts`, `lib/db/actions/impersonation.ts` | Ninguno |
| `getServerIdentity()` | `lib/db/actions/impersonation.ts` | Ninguno |
| `CaseCreationWizard` | `components/cases/CaseCreationWizard.tsx` | Eliminar referencia a "publicar al marketplace" — el wizard ahora envía a la caja negra |
| `DentalViewer3D` | `components/DentalViewer3D.tsx` | Ninguno |
| `UnifiedCaseHub` (chat/eventos) | `components/cases/UnifiedCaseHub.tsx` | Ajuste mayor: eliminar selector de técnicos, ocultar identidad del técnico al dentista |
| Sistema de eventos `clinical_case_event` + `logCaseEvent()` | `lib/db/actions/cases.ts` | Agregar nuevos tipos de acción del nuevo flujo |
| `clinical_case_delivery` (entregas versionadas) | Schema + acciones | Ninguno — el flujo iterativo de diseño se mantiene igual |
| `file` table + GCS infrastructure | Schema + `getSignedUrlAction` | Agregar lógica: los STL solo se desbloquean al técnico tras aceptación del dentista |
| `annotation` table + Visor 3D anotaciones | Schema + componente | Ninguno |
| `review` table (calificaciones) | Schema | Ninguno |
| `audit_log` table | Schema | Ninguno |
| `CaseWorkflowStepper` | `components/cases/CaseWorkflowStepper.tsx` | Rediseño total de etapas según nuevo flujo |
| `StatusBadge` | `components/ui/StatusBadge.tsx` | Actualizar con nuevos estados |
| `ToastContext` | `context/ToastContext.tsx` | Ninguno |
| `Button`, `FocusTrap` | `components/ui/` | Ninguno |
| Panel de Admin base | `lib/db/actions/admin.ts` + `/dashboard/admin` | Extensión: agregar módulo de parámetros del algoritmo |
| Sistema de impersonación (simulación de usuarios) | `lib/db/actions/impersonation.ts` | Ninguno |
| `ActionResult<T>` pattern | `lib/types/actions.ts` | Ninguno |

---

## QUÉ SE ELIMINA

| Elemento | Archivo/Tabla | Motivo |
|---|---|---|
| Página `/dashboard/marketplace` | `app/dashboard/marketplace/` | El técnico ya no navega casos libremente |
| Página `/dashboard/bids` | `app/dashboard/bids/` | Reemplazada por `/dashboard/invitations` |
| Flujo "Publicar caso" visible para técnicos | `cases.ts: updateClinicalCaseAction` | El dentista envía el caso y lo que sucede después es invisible |
| `createBidAction`, `deleteBidAction`, `rejectBidAction`, `acceptBidAction` | `lib/db/actions/cases.ts` | Eliminadas — la selección de técnico es interna |
| `withdrawCaseAction` | `lib/db/actions/cases.ts` | Reemplazada por nueva acción de cancelación |
| Tabla `bid` | Schema | Reemplazada por `case_invitation` (interna, invisible al dentista) |
| Tabla `commercial_round` | Schema | Su rol de "snapshot de specs" se fusiona con `case_invitation` |
| Selector de técnico en UCH (dentista) | `UnifiedCaseHub.tsx` | El dentista nunca sabe quién ejecuta |
| KPIs de marketplace en Dashboard dentista | `app/dashboard/page.tsx` | Reemplazar por KPIs del nuevo modelo |
| `getAvailableCasesMarketplace()` | `lib/db/actions/cases.ts` | Eliminada |
| `getAllCatalogCasesAction()` | `lib/db/actions/cases.ts` | Eliminada — reemplazada por `getMyInvitationsAction()` |
| Estado `publicado` (como estado visible a técnicos) | Constantes + DB | El caso pasa a `enEvaluacion` internamente |

---

## QUÉ SE AGREGA (nuevo)

### Nuevas tablas DB

| Tabla | Propósito |
|---|---|
| `technician_skill` | Niveles declarados por tipo de trabajo (15 tipos × diseño/fabricación) |
| `algorithm_config` | Parámetros del algoritmo (α1..α5, ventanas temporales, etc.) — fila única versionada |
| `algorithm_config_log` | Historial inmutable de cambios a parámetros (quién, cuándo, valor anterior/nuevo) |
| `case_invitation` | Solicitud de cotización interna enviada a cada técnico seleccionado |
| `technician_metrics` (o vista materializada) | Métricas calculadas: Q, P, carga reciente, días sin invitación, liga actual |

### Nuevos campos en tablas existentes

| Tabla | Campos nuevos |
|---|---|
| `clinical_case` | `proposedPrice`, `proposedDeliveryDays`, `proposalExpiresAt`, `platformFee`, `internalStatus`, `rejectionReason` (dentista), `caseComplexity` |
| `user` | `isAvailable` (boolean), `leagueLevel` (text), `leagueTransitionCount` (integer), `lastInvitedAt` (timestamp), `suspendedUntil` (timestamp) |
| `organization` | Capacidades técnicas ya existen — se migran al nuevo modelo de `technician_skill` |

### Nuevos estados del caso

**Vista dentista (simplificada):**
`enEvaluacion` → `propuestaLista` → `enEjecucion` → `enRevision` → `diseñoAprobado` → `enFabricacion` → `enviado` → `completado` → `cerrado` / `rechazado`

**Vista admin (granular):** ver sección 6 de `DentFlowAi_CajaNegra_Flujo.md` (18 estados internos)

### Nuevas Server Actions

| Acción | Rol | Propósito |
|---|---|---|
| `submitCaseToBlackBoxAction()` | Sistema | Dispara clasificación + selección al crear/enviar el caso |
| `classifyCaseAction()` | Sistema | Determina complejidad y tipo de servicio |
| `runSelectionAlgorithmAction()` | Sistema | Ejecuta fórmula S = α₁Q + α₂P + α₃E - α₄C + α₅B |
| `sendInvitationsAction()` | Sistema | Crea `case_invitation` para N técnicos seleccionados |
| `submitQuoteAction()` | Técnico | Técnico responde a invitación (precio + plazo) |
| `evaluateQuotesAction()` | Sistema | Selecciona mejor oferta al cerrar ventana de cotización |
| `buildProposalAction()` | Sistema | Construye precio final (técnico × fee) y presentar al dentista |
| `acceptProposalAction()` | Dentista | Acepta propuesta → desbloquea archivos + notifica técnico |
| `rejectProposalAction()` | Dentista | Rechaza propuesta → cierra caso + libera técnico |
| `updateAlgorithmParamsAction()` | Admin | Actualiza parámetros con validación suma=1 |
| `getAlgorithmMetricsAction()` | Admin | Datos para panel de monitoreo |
| `simulateAlgorithmAction()` | Admin | Simula distribución de probabilidades sin ejecutar |
| `getMyInvitationsAction()` | Técnico | Lista de invitaciones activas y pasadas |
| `updateSkillsAction()` | Técnico | Actualiza tabla de niveles declarados |

### Nuevas páginas/rutas

| Ruta | Rol | Descripción |
|---|---|---|
| `/dashboard/invitations` | Técnico | Reemplaza `/dashboard/bids` — invitaciones activas y para cotizar |
| `/dashboard/admin/algorithm` | Admin | Panel de tuning de parámetros del algoritmo |
| `/dashboard/admin/algorithm/monitor` | Admin | Equidad, distribución, ranking de técnicos |
| `/dashboard/admin/algorithm/simulate` | Admin | Simulador de selección |

---

## MAPA DE DEPENDENCIAS CRÍTICAS

```
technician_skill (nueva tabla)
    ↓ necesaria para
runSelectionAlgorithmAction()
    ↓ necesaria para
sendInvitationsAction() → case_invitation (nueva tabla)
    ↓ necesaria para
submitQuoteAction() → evaluateQuotesAction() → buildProposalAction()
    ↓ necesaria para
acceptProposalAction() / rejectProposalAction()
    ↓ habilita
Flujo de diseño iterativo (YA EXISTE — reutilizar)
```

---

## SPRINTS PLANIFICADOS

| Sprint | Nombre | Enfoque |
|---|---|---|
| S0 | Fundación y limpieza de BD | Schema, migraciones, eliminar marketplace |
| S1 | Perfil técnico y habilidades | Skill matrix, migrar técnicos existentes |
| S2 | Motor de selección (backend) | Algorithm, invitation, quote tables + actions |
| S3 | Propuesta al dentista (backend + UI) | Build proposal, accept/reject flow |
| S4 | Adaptación UCH y flujo de diseño | Chat sin identidad técnico, nuevo stepper |
| S5 | Dashboard técnico: invitaciones | Nueva UI para técnico — invitations |
| S6 | Panel Admin: algoritmo | Tuning UI, parámetros, validación |
| S7 | Panel Admin: monitoreo y simulador | Métricas, equidad, simulator |
| S8 | Notificaciones reales + polish | Emails, push, edge cases, testing |
