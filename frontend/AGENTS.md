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
- El countdown de propuesta va **solo** en el header del UCH, no en el header de la página ni dentro de `ComparativeOffersPanel`.
- No desmontar el UCH al cerrar el panel — usar `uchPanelMounted` + animación `framer-motion`.
- Para el carril de burbujas: usar `resolveUchThreadLane()` de `lib/uchThreadLane.ts`, no implementar lógica propia.
- El split de `CASO_PUBLICADO` para dentistas está en `lib/uchCasoPublicadoSplit.ts` — aplicar en `filteredEvents` del UCH, no en el servidor.

### Base de datos
- No escribir SQL ni queries Drizzle fuera de `frontend/lib/db/actions/`.
- Migraciones: solo vía `infrastructure.ts` en runtime. NO usar `drizzle-kit push` en producción.
- `logCaseEvent()` de `cases.ts` para registrar cualquier evento en el hilo UCH.

### Tipos de servicio y cotización
- `SERVICE_TYPES` (`frontend/lib/constants/dental.ts`) define `solo_diseno`, `solo_fabricacion`, `integral`. `needsFabrication` se conserva para retrocompatibilidad y se deriva del tipo (`true` para `integral` y `solo_fabricacion`).
- Wizard de creación (`CaseCreationWizard`): radio de tres opciones. Si el dentista elige `solo_fabricacion`, el paso de archivos pide un único `designFile` (no scans).
- `submitQuoteAction`:
  - `integral` debe enviarse con `{ kind: 'split', designPrice, designDays, fabricationPrice, fabricationDays, notes? }`.
  - `solo_diseno` y `solo_fabricacion` con `{ kind: 'flat', price, deliveryDays, notes? }`.
  - El total (`quotedPrice`, `quotedDays`) sigue siendo la fuente canónica para ordenamiento; el desglose es complementario y nullable.
- Stepper: solo el `serviceType` decide qué pasos se renderizan. Para `solo_fabricacion` se omiten `enEjecucion`, `enRevision`, `disenoAprobado`.
- Fauchard: `runFauchardAction` y `calculateTechnicianScore` filtran y puntúan por `designLevel` o `fabricationLevel` según `serviceType`. NO mezclar lógicas.

### Tests
- Vitest + Testing Library. Archivos en `frontend/test/`.
- Correr `npm run type-check` y, cuando aplique, `npm run test:run` antes de marcar una tarea como completada.

### Fabricación y cierre
- `startWorkAction` (`proposal.ts`): `solo_fabricacion` → `enFabricacion`; resto → `enEjecucion`.
- `transitionToManufacturingAction`, `registerDispatchAction`, `confirmReceptionAction` viven en `cases.ts` (no en `proposal.ts`).
- `solo_diseno` cierra en `approveWorkAction` → `completado`; flujos con despacho cierran con `confirmReceptionAction`.
