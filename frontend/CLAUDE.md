# Frontend — Next.js 15 + React 19

## Diferencias clave vs Next.js < 15

- **`use client` en páginas con params dinámicos** — las rutas `[id]` son Client Components que usan `useParams()` de `next/navigation`, NO el patrón `await params` de Server Components.
- **React 19**: `use()` hook disponible; suspense nativo en Server Components. No usar librerías de fetching antiguas.
- **Tailwind CSS 4**: sintaxis de config diferente — no existe `tailwind.config.js`, la config va en CSS (`@theme`). No crear ese archivo.
- **Server Actions**: se importan directamente en Client Components (`'use server'` en el archivo de la action). No usar API routes para mutaciones internas.
- **`output: 'standalone'`** en next.config.ts — el build genera un servidor Node standalone, no exportación estática.

## Autenticación (NextAuth 5 beta)

- Session strategy: **JWT** (no database sessions) — más rápido en Cloud Run.
- Importar `auth` desde `@/auth` para leer sesión en Server Components.
- Importar `useSession` de `next-auth/react` en Client Components.
- El JWT contiene: `id`, `role`, `organizationId`, `onboardingStep` — puede estar desactualizado durante onboarding.
- <important>Para datos de identidad frescos usar getServerIdentity() — lee de DB, no del JWT</important>

## Impersonación admin
- El admin puede simular ser otro usuario vía `AuthContext.startSimulation(userId)`.
- El perfil simulado se expone como `userProfile` desde `useAuth()` (mismo hook, contexto transparente).
- `getServerIdentity()` en el servidor también resuelve el usuario simulado.
- `uchPresentationRole` en la página del caso fuerza tabla A (dentista) o B (técnico) en el UCH cuando admin tiene ambos flags activos.

## Convenciones del proyecto

- Alias `@/` apunta a `frontend/` (tsconfig paths).
- Feedback al usuario: siempre `useToast()` de `@/context/ToastContext` — nunca `alert()` ni `console` visible.
- Iconos: solo `lucide-react` — no instalar otras librerías de iconos.
- Estilos: Tailwind utility classes únicamente — no CSS modules, no styled-components.
- Tests: Vitest + Testing Library. Archivos de test en `frontend/test/`.

## Affordances accionables (hover/focus)

No nos apoyamos en `cursor: pointer` para indicar que algo es accionable (inconsistente entre `<Link>` y `<div onClick>`, inexistente en touch). Usamos hover visible + `focus-visible` para teclado. Tres recetas reutilizables:

**Receta A — Tarjeta/píldora accionable** (KPI cards, case cards, kanban cards):
```
transition-colors duration-150
hover:bg-white/5 hover:border-white/20
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40
```

**Receta B — Link de texto / inline** ("Ver todos", anclas):
```
text-teal-300 hover:text-teal-200 hover:underline underline-offset-2
focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-400/40 rounded-sm
```

**Receta C — Fila de lista / item de menú** (timeline UCH, items invitación, filas tabla):
```
transition-colors duration-150
hover:bg-white/[0.04]
focus-visible:outline-none focus-visible:bg-white/[0.06]
```

Estado deshabilitado universal: `disabled:opacity-50 disabled:pointer-events-none`.

Reglas:
- No añadir `cursor-pointer`. El cursor nativo del navegador en `<a>`/`<button>` es suficiente; para `<div onClick>` el hover visible es la señal.
- Elementos accionables sin `<button>`/`<a>` deben ser navegables por teclado (`tabIndex={0}` + `onKeyDown` Enter/Space) y exponer `focus-visible:ring-*`.
- Si el fondo del componente ya es claro, usar `hover:bg-white/10` o cambiar el borde en lugar del fondo.

## Wizard de creación de casos (`app/dashboard/cases/new`)
- `CaseCreationWizard.tsx` ofrece 3 tipos de servicio (radio): **Solo diseño**, **Solo fabricación**, **Diseño + Fabricación**.
- El paso 4 (archivos) cambia según `serviceType`:
  - `solo_diseno` / `integral` → tres slots de scans (`scan_superior`, `scan_inferior`, `scan_bite`).
  - `solo_fabricacion` → **un único slot** con el archivo de diseño (STL/PLY/OBJ), persistido con `category: 'design_upload'` y `subType: 'dentist_design'`.
- `app/dashboard/cases/new/page.tsx` envía `serviceType` al `createClinicalCaseAction` y mantiene `needsFabrication` por compatibilidad.
- Las listas de **material**, **color VITA**, **tipo de restauración** y **urgencia** se cargan vía server actions (`listVitaShadesAction`, etc.) en `lib/db/actions/catalogs.ts`. El form envía `code` opaco para material/restoration/shade y **`label`** para urgency (la lógica de negocio se compara contra labels estándar como `'Alta'`). `resolveCatalogCodesToIds` resuelve a id antes de persistir.
- **No hay texto libre "Otro"**: si falta una opción, admin la agrega en `/dashboard/admin/catalogos`.

## Tema (claro/oscuro/sistema)
- Provider en `components/theme/ThemeProvider.tsx` + contexto en `ThemeContext.ts`. Toggle: `ThemeToggleButton.tsx`.
- Tokens CSS en `app/theme.css`; Tailwind 4 los consume. No instalar `next-themes` — la implementación es propia.

## Entorno local (Docker + fake-gcs)
- `docker compose up -d` en la raíz levanta Postgres 16 y `fsouza/fake-gcs-server` ([docker-compose.yml](../docker-compose.yml)).
- `.env.local` apunta `DATABASE_URL` a `localhost:5432` y `GCS_API_ENDPOINT` a `http://localhost:4443`.
- Cuando `GCS_API_ENDPOINT` está definido, `lib/gcs.ts` firma URLs hacia `/api/local-gcs-proxy` (descomprime gzip antes de servir, ya que fake-gcs no hace decompressive transcoding).
- Seed: `npx tsx scripts/seed-uat.ts`.

## Comandos
```bash
npm run dev          # desarrollo (Turbopack, puerto 3000)
npm run build        # build producción (standalone)
npm run type-check   # tsc --noEmit
npm run test         # vitest (watch)
npm run test:run     # vitest una pasada
npm run test:smoke   # smoke tests páginas clave
npm run lint         # eslint
npm run validate:full # lint + type-check + build
npx tsx scripts/seed-uat.ts  # seed UAT (.env.local)
bash deploy.sh develop       # staging en Cloud Run (servicio dentflowai-frontend-dev)
bash deploy.sh production    # producción en Cloud Run (pide confirmación 'SI')
```

Requisitos: Node ≥ 20.19, npm ≥ 10.

Detalle del flujo de desarrollo y deploy: [Doc/Ciclo_Desarrollo.md](../Doc/Ciclo_Desarrollo.md).
