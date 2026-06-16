<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Reglas de convención DentFlowAi (Next.js 15 / React 19)

### Identidad y autenticación
- **Siempre** usar `getServerIdentity()` de `@/lib/db/actions/impersonation` para obtener `userId` y `role` en Server Actions. Nunca leer el JWT directamente.
- En Client Components: `useAuth()` de `@/context/AuthContext`. El perfil puede ser simulado (impersonación admin).
- Para impersonación en el UCH: `uchPresentationRole` se pasa explícitamente al componente desde la página.

### Server Actions
- Viven solo en `frontend/lib/db/actions/*.ts`.
- Retornan `{ success: boolean; data?: T; error?: string }`.
- Validar `identity.role` antes de cualquier mutación.
- No crear API routes para mutaciones internas.

### Componentes
- Client Components solo con `'use client'`; Server Components por defecto.
- Rutas `[id]` son Client Components → `useParams()`, no `await params`.
- Feedback: `useToast()` de `@/context/ToastContext`. Nunca `alert()`.
- Iconos: solo `lucide-react`.
- Estilos: solo Tailwind utility classes.

### UCH — reglas específicas
- No crear overlays `fixed inset-0` dentro del UCH para acciones del caso.
- Las acciones van embebidas en el hilo como filas expandibles (`buildUchTimelineRows`).
- El countdown de **aceptación de asignación** va **solo** en el header del UCH (técnico), no duplicado en la ficha.
- No desmontar el UCH al cerrar el panel — usar `uchPanelMounted` + animación `framer-motion`.
- Para el carril de burbujas: usar `resolveUchThreadLane()` de `lib/uchThreadLane.ts`, no implementar lógica propia.
- El split de `CASO_PUBLICADO` para dentistas está en `lib/uchCasoPublicadoSplit.ts` — aplicar en `filteredEvents` del UCH, no en el servidor.

### Base de datos
- No escribir SQL ni queries Drizzle fuera de `frontend/lib/db/actions/`.
- Migraciones: solo vía `infrastructure.ts` en runtime. NO usar `drizzle-kit push` en producción.
- `logCaseEvent()` de `cases.ts` para registrar cualquier evento en el hilo UCH.

### Tipos de servicio y asignación (producto activo)
- `SERVICE_TYPES` en `dental.ts` expone solo `solo_diseno`. Asignación directa: `publishCaseAction` → `classifyCaseAction` → `runAssignmentAction` → `assignCaseAction` con score **Q/P/E/B/L/N** (`assignmentScore.ts`).
- Wizard (`CaseCreationWizard`): solo diseño + scans; sin radio de 3 tipos. Publicar requiere regla de precio (`listPriceSale`).
- Técnico **acepta o rechaza** la asignación — no cotiza. Precio/plazo vienen de catálogo + `desiredDeliveryAt`.
- Legacy en schema/UCH: `integral`/`solo_fabricacion`, `submitQuoteAction`, comparativo — no usar en flujos nuevos.

### Tests
- Vitest + Testing Library. Archivos en `frontend/test/`.
- Correr `npm run type-check` y, cuando aplique, `npm run test:run` antes de marcar una tarea como completada.

### Fabricación y cierre
- `startWorkAction` (`proposal.ts`): `solo_fabricacion` → `enFabricacion`; resto → `enEjecucion`.
- `transitionToManufacturingAction`, `registerDispatchAction`, `confirmReceptionAction` viven en `cases.ts` (no en `proposal.ts`).
- `solo_diseno` cierra en `approveWorkAction` → `completado`; flujos con despacho cierran con `confirmReceptionAction`.

### Dirección geográfica del usuario (v5.7)
- Columnas en tabla `user`: `country`, `region`, `comuna`, `address`, `address_number` (`addressNumber`), `address_office` (`addressOffice`). Todas TEXT nullable.
- Datos geográficos en `lib/constants/addressData.ts`: `REGIONS_BY_COUNTRY` (9 países; Chile completo) y `SUPPORTED_COUNTRIES`. Importar desde `@/lib/constants/addressData`.
- Selects en cascada País → Región → Comuna en registro (`auth/register`) y perfil (`dashboard/profile`) para ambos roles.
- Badge de dirección en `dashboard/cases/[id]` para técnico/admin en casos con fabricación. Los códigos se resuelven a nombres legibles en cliente.

### Disponibilidad del técnico (v5.0, flag `AVAILABILITY_MODEL_ENABLED`)
- 3 niveles jerárquicos (global · CAD/CAM · 7 categorías) → regla AND triple en `availability.ts`. Rechazo individual ≠ rechazo masivo (catálogos `invitation_rejection_reason` / `bulk_rejection_reason`).
- **Rechazo individual en UCH** (flag `REJECTION_INDIVIDUAL_ENABLED`): botón "Rechazar asignación" en `UchFauchardActionsPanel` → `UchRejectInvitationDialog` → `rejectInvitationIndividualAction`. Solo el técnico asignado, mientras la asignación esté `pending`. **No** cuenta como no-respuesta y dispara reemplazo automático (`tryReplaceAfterRejectAction`).
- Sanción rolling 14d (`noResponseEvents.ts`) reemplaza `consecutiveNoResponse` con el flag on; nivel 3 = auto-OFF. Cola `pendiente_pool` (`poolQueue.ts`) cuando no hay elegibles.
- **Crons (v5.0)**: `/api/cron/process-availability` (hora) y `/api/cron/process-pool-queue` (cada **2 min**, incluye `processPendingPoolReevaluationAction`), header `Authorization: Bearer ${CRON_SECRET}`, inertes con el flag off. Dentista: banner `pendiente_pool` + check-in 50% TTL (`cancelPendingPoolAction`) y Republicar (`republicarCaseAction`) en `sin_asignacion_fallo` o `sin_cotizaciones_fallo` (legacy).
- Notificaciones por **EmailJS** (no Resend) vía `lib/services/notifications.ts` (API REST server-side).
