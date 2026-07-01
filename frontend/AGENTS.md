<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Reglas de convención DentFlowAi (Next.js 15 / React 19)

### Identidad y autenticación
- **Siempre** usar `getServerIdentity()` de `@/lib/db/actions/impersonation` en Server Actions. Nunca leer el JWT directamente.
- En Client Components: `useAuth()` de `@/context/AuthContext`.
- Para impersonación en el UCH: `uchPresentationRole` se pasa explícitamente desde la página.

### Server Actions
- Viven solo en `frontend/lib/db/actions/*.ts`.
- Retornan `{ success: boolean; data?: T; error?: string }`.
- Validar `identity.role` antes de cualquier mutación.

### Componentes
- Rutas `[id]` son Client Components → `useParams()`, no `await params`.
- Feedback: `useToast()`. Iconos: solo `lucide-react`. Estilos: solo Tailwind.

### UCH — reglas específicas
- No crear overlays `fixed inset-0` dentro del UCH. Las acciones van embebidas en el hilo como filas expandibles (`buildUchTimelineRows`).
- El countdown de aceptación de asignación va **solo** en el header del UCH (técnico).
- No desmontar el UCH al cerrar el panel — usar `uchPanelMounted` + animación `framer-motion`.
- Carril de burbujas: usar `resolveUchThreadLane()` de `lib/uchThreadLane.ts`, no implementar lógica propia.
- Split de `CASO_PUBLICADO` para dentistas: aplicar en `filteredEvents` del UCH (cliente), no en servidor.

### Base de datos
- No escribir queries Drizzle fuera de `frontend/lib/db/actions/`.
- Migraciones: solo vía `infrastructure.ts` en runtime.
- `logCaseEvent()` de `cases.ts` para registrar eventos en el hilo UCH.

### Producto activo: `solo_diseno` con asignación directa CAD/CAM
- Flujo: `publishCaseAction` → `classifyCaseAction` → `runAssignmentAction` (score Q/P/E/B/L/N).
- Técnico **acepta o rechaza** — no cotiza. Precio/plazo vienen de catálogo.
- Rechazo individual (flag `REJECTION_INDIVIDUAL_ENABLED`): `UchRejectInvitationDialog` → `rejectInvitationIndividualAction` → `tryReplaceAfterRejectAction`. No cuenta como no-respuesta.
- `integral`/`solo_fabricacion` y flujo de cotización son **legacy** — no usar en flujos nuevos.

### Notificaciones
- Via **EmailJS** en `lib/services/notifications.ts`. Envío real gated por `NOTIFICATIONS_LIVE`.

### Tests
- Correr `npm run type-check` y `npm run test:run` antes de marcar una tarea como completada.
