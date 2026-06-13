# app/ — Rutas Next.js App Router

## Rutas principales
- `auth/login`, `auth/register`, `auth/verify`, `auth/forgot-password` — autenticación y onboarding
- `onboarding/page.tsx` — redirección auxiliar de onboarding
- `dashboard/` — Área protegida; `dashboard/layout.tsx` redirige si no hay sesión o `onboardingStep < 100`
- `dashboard/page.tsx` — Home dashboard (KPIs por rol)
- `dashboard/cases/` — Listado de casos (dentista)
- `dashboard/cases/[id]/page.tsx` — Detalle de caso con `UnifiedCaseHub` (UCH); Client Component con `useParams()`
- `dashboard/cases/new/page.tsx` — Wizard de creación; pasa `serviceType` a `createClinicalCaseAction`
- `dashboard/kanban/` — Vista kanban de casos
- `dashboard/marketplace/` — Marketplace (técnicos)
- `dashboard/invitations/` — Listado y detalle de invitaciones para técnicos
- `dashboard/invitations/[invitationId]/` — Detalle invitación
- `dashboard/profile/` — Perfil y matriz de habilidades
- `dashboard/finance/` — Finanzas (dentista)
- `dashboard/bids/` — Ofertas/pujas (ruta existente, pendiente de documentación detallada)
- `dashboard/admin/` — **Hub admin**: landing puramente navegacional (tarjetas agrupadas por dominio). Ya **no** está en el menú lateral (queda accesible por URL); la navegación admin vive ahora como ítems directos del sidebar. No contiene la tabla de usuarios ni la purga.
- `dashboard/admin/danger/` — **Zona de Alta Peligrosidad** (purga total de datos de negocio + `PurgeScopeTable`). Se movió fuera del hub a su propia ruta; es el destino del ítem **al pie del sidebar admin** (rojo, encima de "Cerrar Sesión").
- `dashboard/admin/users/` — Control de usuarios (tabla, buscar, crear co-admin, bloquear/eliminar/cambiar password, reset de no-respuestas vía `ResetNoResponseModal`).
- `dashboard/admin/observability/` — **Observabilidad** (`ObservabilityPanel`, métricas v5.0). Primer ítem del menú lateral admin.
- **Menú lateral admin** (`dashboard/layout.tsx → menuItems`): para el rol admin el sidebar reemplaza al hub. Orden: **Observabilidad** (reemplaza a "Dashboard") · **Motor Fauchard** · **ContactGuard** · **Control de Usuarios** · **Catálogo UI**; y al pie, separada, la **Zona de Alta Peligrosidad** (`/dashboard/admin/danger`). Otros roles conservan "Dashboard" como primer ítem.
- `dashboard/admin/catalogos/` — CRUD de catálogos UI.
- `dashboard/admin/contactguard/` — Reglas ContactGuard, couriers y auditoría.
- `dashboard/admin/fauchard/` — Config Fauchard. Sub-nav (`FauchardNav`): Configuración · `monitor/` (Monitoreo y Equidad) · `simulate/` (Simulador). **Configurador en 4 espacios** (`TabClient`, nav pill): **Parámetros · Calendario · Categorías · Historial** (Observabilidad se movió a su propia ruta `/dashboard/admin/observability`, accesible desde el menú lateral admin). Solo **Parámetros** es el estudio de tuning con laboratorio: envuelve a Pesos del Score + Selección y Ronda + Plazos y Sanciones (gated) en **vista compacta** sobre un **borrador único** (`FauchardDraftContext`, reducido a los **params del modelo**: score/ventanas/exclusión/selección/ronda/fee/plazos/sanción — **no** incluye `business*` ni liga), con **guardado global** (`GlobalSaveBar`, copy-on-write + diff + motivo + validación cruzada) y un **laboratorio sticky** read-only (`FauchardLabPanel` — radar α + detalle + KPIs + alertas; distribución de técnicos reales vía `simulateFauchardAction` con el borrador como override, en un expander "Ver técnicos"). Los demás espacios son **independientes**: **Calendario** (`FauchardCalendarPanel`, autónomo: horario/días con su propio Guardar + CRUD de feriados), **Categorías** (`LeagueConfigPanel`, autónomo, guarda solo keys `l*`, banner "motor dormido — Fase 2") e **Historial** (`ConfigChangeLog`, read-only). Subconjuntos disjuntos (modelo ∩ `business*` ∩ `l*` = ∅) → los guardados autónomos no se pisan. Diseño: [Doc Servicio Orquestado/plan_configurador_fauchard.md](../../Doc%20Servicio%20Orquestado/plan_configurador_fauchard.md).
- `dashboard/admin/fauchard/guided-demo/` y `.../sandbox-diagram/` — rutas **descolgadas del menú** (no aparecen en `FauchardNav`); siguen existiendo y son accesibles por URL directa. El "Radar de Pesos" del sandbox se adoptó como el tab "Radar y Simulación" (arriba).

## API routes
- `api/auth/[...nextauth]/` — NextAuth 5.
- `api/cron/evaluate-quotes/` — `GET`. Expira invitaciones vencidas y dispara `checkAndExpireInvitationsAction` (que reevalúa cotizaciones del caso). Protegido por header `Authorization: Bearer ${CRON_SECRET}` cuando `CRON_SECRET` está seteada. Pensado para Cloud Scheduler cada 5 min. NO invocar desde UI.
- `api/cron/process-availability/` — `POST` (y `GET` para pruebas). v5.0. Cada hora corre dos tareas: `processAvailabilityMaintenanceAction` (expira no-respuestas fuera de ventana rolling, auto-OFF preventivo por inactividad > `inactivityAutoOffDays`, recordatorio > `inactivityReminderDays`) y `processDentistReviewDeadlinesAction` (escalación del countdown de revisión del dentista: recordatorio ≤25% + aviso al vencer, sin auto-acción). Inerte con `AVAILABILITY_MODEL_ENABLED` off. Mismo header `CRON_SECRET`.
- `api/cron/process-pool-queue/` — `POST` (y `GET`). v5.0. Cada 10 min: `processPendingPoolCheckInAction` (check-in al dentista al 50% del TTL) + `processPendingPoolExpirationAction` (re-encola o falla a `sin_cotizaciones_fallo`). Mismo header `CRON_SECRET`.
- `api/telemetry/` — `POST`. Endpoint interno de logs cliente (errores / warns / info). Aplica: validación de Origin/Referer + `Sec-Fetch-Site` contra `TELEMETRY_ALLOWED_ORIGINS`, rate limit por IP (`TELEMETRY_RATE_LIMIT_PER_MINUTE`), schema strict (`TelemetryPayload`), límite de tamaño (`MAX_BODY_CHARS=16000`), redacción server-side de emails / bearer tokens / claves. Firma HMAC opcional para integraciones S2S (`TELEMETRY_INGEST_TOKEN` + `X-Telemetry-Timestamp` + `X-Telemetry-Signature`). Cliente publica vía `NEXT_PUBLIC_LOG_ENDPOINT` (default `/api/telemetry`).
- `api/local-gcs-proxy/` — `PUT` y `GET`. Solo activo cuando `GCS_API_ENDPOINT` está definido (entorno local con fake-gcs). Intermedia uploads (descomprime gzip antes de persistir porque fake-gcs no hace decompressive transcoding) y firma URLs de descarga apuntando al proxy. En staging/prod no se monta (las URLs firmadas van directo a GCS).
- `api/demo/email-preview/` — `GET ?since=<timestamp>`. Devuelve los emails registrados en `emailPreviewBuffer` con `ts > since` (orden cronológico). Gated por `NEXT_PUBLIC_DEMO_EMAIL_PREVIEW`; si el flag está off responde lista vacía con `{ enabled: false }`. Solo para entorno de demo local — no montar en producción.

## Página del caso (`dashboard/cases/[id]/page.tsx`)
Esta es la página más compleja del sistema. Puntos clave:

- `authUserProfile` viene de `useAuth()` (puede ser perfil simulado en impersonación).
- `actingAsDentista` = `userRole === 'dentista' || userRole === 'admin'`
- `actingAsTecnico` = `userRole === 'tecnico' || userRole === 'admin'`
- `uchPresentationRole` — fuerza tabla A (dentista) o B (técnico) en el UCH cuando el admin es a la vez actor y viewer; se deriva de si el admin es el `doctorId` o `assignedTechnicianId` del caso.
- **UCH montado pero oculto**: `uchPanelMounted` se pone a `true` la primera vez que se abre el hub y **nunca vuelve a false** mientras el id del caso no cambie. Esto evita desmontar el componente y perder el estado del countdown.
- **Animación**: `framer-motion` anima la entrada/salida del panel; el desmontaje real solo ocurre al cambiar de caso.
- **Countdown propuesta**: `proposalDeadlineMs` + `serverClockAnchor` se pasan al UCH. El countdown solo aparece en el header del UCH (no en el header de la página).
- **Ficha**: botones de gestión vía `CaseDetailManagementBar` + reglas en `lib/cases/caseDetailActions.ts`.
- **Badge de dirección del dentista** (v5.8, tres niveles): en casos con `needsFabrication=true`, en el header junto al ID (`DF-XXXX`). Niveles: **dirección completa** (`País · Región · Comuna · Calle Número · Of. X`) para admin, dentista dueño y técnico **ganador** (`assignedTechnicianId === viewer`); **solo ubicación gruesa** (`País · Región · Comuna`) para cualquier otro técnico **invitado** al caso (cotizando/perdedor), para cotizar el traslado sin filtrar la dirección fina. Usa `getCaseDetails.doctor` (join con 6 columnas) y resuelve códigos con `SUPPORTED_COUNTRIES` / `REGIONS_BY_COUNTRY` de `lib/constants/addressData.ts`. **Gate en dos capas**: el servidor (`getCaseDetails` → `getDoctorAddressDisclosure` en `caseListVisibility.ts`) anula calle/número/oficina en `coarse` y los 6 campos en `none`; el cliente solo refuerza el render (el armado filtra campos vacíos, así un no-ganador nunca ve calle/número/oficina). Sin invitación, sin fabricación o sin dirección registrada → no se renderiza.

## Convenciones
- Área dashboard: guard de sesión/onboarding en `dashboard/layout.tsx` (Client Component con `useAuth()`).
- Params dinámicos: en Client Components usar `useParams()`; en Server Components usar `await params`.
- Server Components por defecto; `'use client'` solo cuando necesario.

## onboardingStep — milestones
- Técnico: 0→20(rol)→50(perfil)→65(laboratorio)→80(habilidades)→100(completo)
- Dentista: 0→20(rol)→50(perfil)→75(clínica)→100(completo)
- `onboardingStep < 100` redirige a `/auth/register` para continuar
