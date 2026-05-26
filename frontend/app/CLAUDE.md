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
- `dashboard/admin/` — Panel admin (usuarios, impersonación)
- `dashboard/admin/fauchard/` — Config Fauchard, simulación (`simulate/`), monitor (`monitor/`)

## API routes
- `api/auth/[...nextauth]/` — NextAuth 5
- `api/cron/evaluate-quotes/` — Cron externo (expira invitaciones / evalúa cotizaciones); no invocar desde UI
- `api/telemetry/` — Telemetría cliente

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

## Convenciones
- Área dashboard: guard de sesión/onboarding en `dashboard/layout.tsx` (Client Component con `useAuth()`).
- Params dinámicos: en Client Components usar `useParams()`; en Server Components usar `await params`.
- Server Components por defecto; `'use client'` solo cuando necesario.

## onboardingStep — milestones
- Técnico: 0→20(rol)→50(perfil)→65(laboratorio)→80(habilidades)→100(completo)
- Dentista: 0→20(rol)→50(perfil)→75(clínica)→100(completo)
- `onboardingStep < 100` redirige a `/auth/register` para continuar
