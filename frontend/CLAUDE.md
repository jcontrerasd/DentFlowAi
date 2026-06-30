# Frontend — Next.js 15 + React 19

## Diferencias clave vs Next.js < 15

- **`use client` en páginas con params dinámicos** — rutas `[id]` son Client Components que usan `useParams()`, NO `await params` de Server Components.
- **React 19**: `use()` hook disponible; Suspense nativo en Server Components.
- **Tailwind CSS 4**: config va en CSS (`@theme`). No crear `tailwind.config.js`.
- **Server Actions**: importar directamente en Client Components (`'use server'` en el archivo de la action). No usar API routes para mutaciones internas.
- **`output: 'standalone'`** en next.config.ts — no exportación estática.

## Autenticación (NextAuth 5 beta)

- Session strategy: **JWT** (no database sessions).
- Importar `auth` desde `@/auth` en Server Components; `useSession` de `next-auth/react` en Client Components.
- El JWT contiene: `id`, `role`, `organizationId`, `onboardingStep` — puede estar desactualizado durante onboarding.
- <important>Para datos de identidad frescos usar `getServerIdentity()` — lee de DB, no del JWT</important>

## Impersonación admin

- Admin simula otro usuario vía `AuthContext.startSimulation(userId)`.
- Perfil simulado expuesto como `userProfile` desde `useAuth()`.
- `getServerIdentity()` en el servidor también resuelve el usuario simulado.
- `uchPresentationRole` en la página del caso fuerza tabla A (dentista) o B (técnico) cuando admin tiene ambos flags.

## Convenciones del proyecto

- Alias `@/` apunta a `frontend/` (tsconfig paths).
- Feedback al usuario: `useToast()` de `@/context/ToastContext` — nunca `alert()`.
- Iconos: solo `lucide-react`.
- Estilos: solo Tailwind utility classes — no CSS modules, no styled-components.

## Affordances accionables (hover/focus)

No usar `cursor: pointer` para indicar accionable. Usar hover visible + `focus-visible`.

**Receta A — Tarjeta/píldora accionable** (KPI cards, case cards):
```
transition-colors duration-150
hover:bg-white/5 hover:border-white/20
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40
```

**Receta B — Link de texto** ("Ver todos", anclas):
```
text-teal-300 hover:text-teal-200 hover:underline underline-offset-2
focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-400/40 rounded-sm
```

**Receta C — Fila de lista / item de menú** (timeline UCH, filas tabla):
```
transition-colors duration-150
hover:bg-white/[0.04]
focus-visible:outline-none focus-visible:bg-white/[0.06]
```

Estado deshabilitado: `disabled:opacity-50 disabled:pointer-events-none`.

Elementos accionables sin `<button>`/`<a>` necesitan `tabIndex={0}` + `onKeyDown` Enter/Space + `focus-visible:ring-*`.

## Wizard de creación de casos (`app/dashboard/cases/new`)

- `CaseCreationWizard.tsx` — producto activo: `solo_diseno` fijo. Sin selector de tipos de servicio.
- Tres slots de scans (`superior`, `inferior`, `oclusal`). Campo `replacesMissingTeeth` (pónticos Sí/No).
- Listas de **material**, **color VITA**, **tipo de restauración** y **urgencia** vía server actions (`listVitaShadesAction`, etc.) en `catalogs.ts`. El form envía `code` opaco para material/restoration/shade y `label` para urgency. `resolveCatalogCodesToIds` resuelve a id antes de persistir.

## Badge global de disponibilidad (v5.0)

- `components/availability/AvailabilityBadge.tsx` — pill en el header. Solo para rol `tecnico`; se auto-oculta si `AVAILABILITY_UI_TECNICO_ENABLED` está off.
- Punto ámbar (Nivel 2) / rojo (Nivel 3). Click → popover con switch + stepper + link al panel.
- Panel completo en `/dashboard/profile/availability`: switch global, columnas CAD/CAM con 7 categorías, historial.
- El switch global y el toggle legacy (`user.is_available`) se **espejan en la capa de escritura** para no divergir. `updateAvailabilityLevelAction` (target `global`) también escribe `user.is_available`; `toggleAvailabilityAction` también escribe `technician_availability.level_global`.
- OFF con asignaciones pendientes → `BulkRejectDialog`. ON desde Nivel 3 → `ReactivationModal`.

## Tema (claro/oscuro/sistema)

Provider en `components/theme/ThemeProvider.tsx` + `ThemeContext.ts`. Toggle: `ThemeToggleButton.tsx`. Tokens CSS en `app/theme.css`. No instalar `next-themes`.

## Entorno local (Docker + fake-gcs)

- `docker compose up -d` en la raíz levanta Postgres 16 y `fsouza/fake-gcs-server`.
- `.env.local` apunta `DATABASE_URL` a `localhost:5432` y `GCS_API_ENDPOINT` a `http://localhost:4443`.
- `lib/gcs.ts` firma URLs hacia `/api/local-gcs-proxy` cuando `GCS_API_ENDPOINT` está definido.
- Seed: `npx tsx scripts/seed-uat.ts`.

## Cifrado en tránsito a la base de datos

`DATABASE_URL_DEV`/`_PROD` en `frontend/.env.local` (gitignored). **Deben** incluir `?sslmode=require`. `lib/db/index.ts` loguea warning al boot si en producción no detecta `sslmode`.

## Scripts auxiliares (`frontend/scripts/`)

Ejecutar con `npx tsx scripts/<archivo>.ts` desde `frontend/`.

| Script | Propósito |
|---|---|
| `seed-uat.ts` | Usuarios y casos de prueba para UAT local |
| `seed-demo-tecnicos.ts` | 1 org demo, 1 dentista, 10 técnicos de prueba para demo del funnel Fauchard |
| `backfill-availability.ts` | One-time v5.0: puebla `technician_availability` por técnico. Idempotente |
| `reseed-contact-guard-regex.ts` | Re-poblar reglas regex de ContactGuard (idempotente). Elimina reglas legacy `telefono_*` |
| `diag-contact-guard.ts` | Diagnóstico: verifica reglas activas + testea inputs |
| `seed-courier-allowlist.ts` | Seed/upsert idempotente de allowlist de couriers (`contact_guard_courier_allowlist`) |
| `recheck-contact-guard-audit.ts` | Re-evalúa histórico de `contact_guard_audit` con lógica actual (solo lectura) |
| `seed-price-rules.ts` | Seed de reglas de precio |
| `backfill-tech-rejection-events.ts` | Migración de eventos `OFERTA_RECHAZADA_POR_TECNICO` anteriores al fix de visibilidad |
| `test-emailjs.ts` | Diagnóstico: envía correo de prueba via EmailJS |

Scripts de migración one-time (`migrate-catalogs-fk.ts`, `migrate-catalogs-opaque-codes.ts`, `migrate-recovery-v39.ts`) ya aplicados — conservados como referencia histórica.

## Preview de emails (DEMO local)

Flag `NEXT_PUBLIC_DEMO_EMAIL_PREVIEW=true` (default off). Cuando está activo, `notifyUser` registra el correo en buffer sin enviarlo.
- `lib/services/emailPreviewBuffer.ts` — ring buffer, máx 50 entradas.
- `app/api/demo/email-preview/route.ts` — `GET ?since=<timestamp>`.
- `components/demo/DemoEmailPreviewListener.tsx` — polling 2s, modal informativo en dashboard.

## Tests

- Vitest + Testing Library. Archivos en `frontend/test/`.
- Helper canónico: `test/helpers/test-identity.ts` — stub de `getServerIdentity()` para server actions (no instancia Auth real).
- Mocks de DB: `vi.mock('@/lib/db')` con factory determinista. No tocar DB real en unit tests.
- Smoke tests (`npm run test:smoke`): cubren páginas críticas (auth, onboarding, ficha de caso, dashboard).

## Comandos
```bash
npm run dev          # desarrollo (Turbopack, puerto 3000)
npm run build        # build producción (standalone)
npm run type-check   # tsc --noEmit
npm run test:run     # vitest una pasada
npm run test:smoke   # smoke tests páginas clave
npm run lint         # eslint
npm run validate:full # lint + type-check + build (solo si se pide)
npx tsx scripts/seed-uat.ts  # seed UAT (.env.local)
```
