# Frontend — Next.js 15 + React 19

## Diferencias clave vs Next.js < 15

- **`use client` en páginas con params dinámicos** — rutas `[id]` son Client Components que usan `useParams()`, NO `await params` de Server Components.
- **Tailwind CSS 4**: config va en CSS (`@theme`). No crear `tailwind.config.js`.
- **Server Actions**: importar directamente en Client Components (`'use server'` en el archivo de la action). No usar API routes para mutaciones internas.

## Autenticación (NextAuth 5 beta)

- Session strategy: **JWT** (no database sessions).
- Importar `auth` desde `@/auth` en Server Components; `useSession` de `next-auth/react` en Client Components.
- <important>Para datos de identidad frescos usar `getServerIdentity()` — lee de DB, no del JWT</important>

## Impersonación admin

- Admin simula otro usuario vía `AuthContext.startSimulation(userId)`.
- `getServerIdentity()` en el servidor también resuelve el usuario simulado.
- `uchPresentationRole` en la página del caso fuerza tabla A (dentista) o B (técnico) cuando admin tiene ambos flags.

## Convenciones del proyecto

- Alias `@/` apunta a `frontend/` (tsconfig paths).
- Feedback al usuario: `useToast()` de `@/context/ToastContext` — nunca `alert()`.
- Iconos: solo `lucide-react`. Estilos: solo Tailwind utility classes.

## Affordances accionables (hover/focus)

No usar `cursor: pointer`. Usar hover visible + `focus-visible`.

**Receta A — Tarjeta/píldora accionable:**
```
transition-colors duration-150
hover:bg-white/5 hover:border-white/20
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40
```

**Receta B — Link de texto:**
```
text-teal-300 hover:text-teal-200 hover:underline underline-offset-2
focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-400/40 rounded-sm
```

**Receta C — Fila de lista / item de menú:**
```
transition-colors duration-150
hover:bg-white/[0.04]
focus-visible:outline-none focus-visible:bg-white/[0.06]
```

Estado deshabilitado: `disabled:opacity-50 disabled:pointer-events-none`.

## Badge global de disponibilidad

- `AvailabilityBadge.tsx` — pill en el header. Solo rol `tecnico`; oculto si `AVAILABILITY_UI_TECNICO_ENABLED` está off.
- El switch global y `user.is_available` se **espejan en la capa de escritura**: `updateAvailabilityLevelAction` también escribe `user.is_available`; `toggleAvailabilityAction` también escribe `technician_availability.level_global`.
- OFF con asignaciones pendientes → `BulkRejectDialog`. ON desde Nivel 3 → `ReactivationModal`.

## Cifrado en tránsito a la base de datos

`DATABASE_URL_DEV`/`_PROD` en `frontend/.env.local` (gitignored). Deben incluir `?sslmode=require`.

## Scripts auxiliares (`frontend/scripts/`)

Ejecutar con `npx tsx scripts/<archivo>.ts` desde `frontend/`.

| Script | Propósito |
|---|---|
| `seed-uat.ts` | Usuarios y casos de prueba para UAT local |
| `seed-demo-tecnicos.ts` | 1 org demo, 1 dentista, 10 técnicos para demo del funnel Fauchard |
| `backfill-availability.ts` | One-time v5.0: puebla `technician_availability` por técnico. Idempotente |
| `reseed-contact-guard-regex.ts` | Re-poblar reglas regex de ContactGuard (idempotente) |
| `diag-contact-guard.ts` | Diagnóstico: verifica reglas activas + testea inputs |
| `seed-courier-allowlist.ts` | Seed/upsert idempotente de allowlist de couriers |
| `seed-price-rules.ts` | Seed de reglas de precio |

## Tests

- Vitest + Testing Library. Archivos en `frontend/test/`.
- Helper canónico: `test/helpers/test-identity.ts` — stub de `getServerIdentity()`.
- Mocks de DB: `vi.mock('@/lib/db')`. No tocar DB real en unit tests.
