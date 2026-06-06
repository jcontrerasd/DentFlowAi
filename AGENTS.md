# DentFlowAi — AGENTS

Puente rápido para **Cursor** y otros agentes de código. La guía canónica del dominio, Fauchard y UCH está en [CLAUDE.md](CLAUDE.md).

> **Disponibilidad del técnico (v5.0, flag `AVAILABILITY_MODEL_ENABLED`)**: el técnico declara disponibilidad jerárquica en 3 niveles (global · CAD/CAM · **5 categorías canónicas**: Coronas, Inlays/Onlays/Carillas, Puentes/Full Arch, Prótesis Removible, Guías Quirúrgicas). Fauchard filtra por regla AND triple + sanción rolling 14d. El técnico puede **rechazar una invitación individualmente** desde el UCH (flag `REJECTION_INDIVIDUAL_ENABLED`; no cuenta como no-respuesta, dispara reemplazo automático) — distinto del **rechazo masivo** al pausar su switch global. Detalle en [CLAUDE.md](CLAUDE.md) → Motor Fauchard.

## Orden de lectura

1. [CLAUDE.md](CLAUDE.md) — stack, roles, flujos, motor Fauchard, UCH, restricciones críticas
2. Este archivo — atajos y reglas mínimas
3. [frontend/AGENTS.md](frontend/AGENTS.md) — convenciones Next.js 15 / React 19
4. [frontend/CLAUDE.md](frontend/CLAUDE.md) — auth, impersonación, wizard de casos
5. El `CLAUDE.md` del subdirectorio donde edites (`app/`, `components/`, `lib/db/`)

## Trabajo en el UCH

Usar la skill del proyecto `@uch-reglas-diseno-dentflowai` (cuerpo alineado con la sección **UCH — Reglas de Diseño DentFlowAi** de `CLAUDE.md`).

## Reglas mínimas (no negociables)

- **Server Actions** solo en `frontend/lib/db/actions/` — nunca acceder a la DB desde componentes.
- **Identidad servidor:** `getServerIdentity()` de `@/lib/db/actions/impersonation`.
- **Identidad cliente:** `useAuth()` de `@/context/AuthContext` (soporta impersonación admin).
- **Migraciones:** runtime vía `frontend/lib/db/infrastructure.ts` — no `drizzle-kit push` en producción.
- **Feedback UI:** `useToast()` — no `alert()`.
- **UCH:** acciones embebidas en el hilo; sin chat libre; Fauchard sí aparece como voz del sistema cuando corresponde (`uchPresentation.ts`, `uchThreadLane.ts`).

## Comandos habituales

```bash
cd frontend && npm run dev          # desarrollo (Turbopack)
cd frontend && npm run type-check   # TypeScript
cd frontend && npm run test:run     # Vitest (una pasada)
cd frontend && npm run validate:full # lint + type-check + build
```

Requisitos: Node ≥ 20.19, npm ≥ 10 (`frontend/package.json` → `engines`).
