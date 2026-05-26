# DentFlowAI — Plan de Migración del Design System

> Complemento operativo de [dentflowai-design-system.md](dentflowai-design-system.md). Cubre infraestructura de tema (light/dark/system), persistencia por usuario, refactor de tokens, inventario completo de archivos, plan de ejecución y checklist de aceptación. Mayo 2026.

> **Modalidad de ejecución**: big-bang en rama dedicada, con feature work congelado. **Sin flag transitorio** — el merge final reemplaza la totalidad de la capa visual de una sola vez.

---

## 1. Alcance

Adoptar el design system propuesto **en su totalidad**, con:

- **Light por defecto** efectivo; valor inicial de la preferencia = `system` (respeta SO en el primer login).
- **Tres modos seleccionables por usuario**: `light` · `dark` · `system` (sincronizado con `prefers-color-scheme`).
- Preferencia **persistida en BD** (por usuario), **sin flash** en SSR (cookie-driven), con `localStorage` como caché optimista.
- **Migración completa**: 72 archivos identificados, 1.428 ocurrencias de clases hard-coded reemplazadas; no quedan pantallas en dark-only forzado.

---

## 2. Decisiones congeladas (validadas con el equipo)

| # | Decisión | Implicación |
|---|---|---|
| 1 | Default de la preferencia = `system` | Respeta OS del usuario en el primer login. Si una clínica prefiere imponer `light`, se cambia el `DEFAULT` de la columna sin tocar código. |
| 2 | Pasos negativos del stepper (`rechazado`, `cerrado`) → `error-hl` + `text-error` | Reemplaza el rosa actual. Alineado con la gramática semántica del sistema. |
| 3 | Teal sobrevive **solo en marca** (logo, splash, login background, vacíos ilustrados) | Muere en el producto funcional. CTA y links pasan a índigo (`primary`). |
| 4 | Glassmorphism se elimina | Reemplazado por `surface` + `shadow-sm` + `border-divider`. Incompatible con paleta clara. |
| 5 | **Sin flag** `data-theme-v2` | Migración big-bang. Feature work congelado durante la ejecución. Rama única que mergea todo al final. |
| 6 | Provider propio (sin `next-themes`) | ~80 LOC, sin dependencia, control fino sobre persistencia BD. |
| 7 | `Instrument Serif` restringido a H1 de página y momentos editoriales (wizard, onboarding, login) | Inter es la fuente de UI. |

---

## 3. Estado actual vs objetivo

| Dimensión | Hoy | Objetivo |
|---|---|---|
| Modo base | `<html class="dark">` hardcoded en [app/layout.tsx:33](../frontend/app/layout.tsx#L33) | Provider que aplica `light` / `dark` según preferencia |
| Tokens CSS | 7 vars en [frontend/app/theme.css](../frontend/app/theme.css) | ~45 vars (surfaces, muted/faint, semánticos, shadows, radius, spacing) |
| Clases hard-coded | **1.428 ocurrencias en 72 archivos** | Reemplazo total por utilidades del `@theme` |
| Preferencia usuario | No existe en BD | Columna `theme_preference` en `user` + UI en `/dashboard/profile` |
| Acento marca | Teal (CTA + links + estado + decorativo) | Índigo (CTA/links) + Jade (salud/éxito); Teal solo en marca |
| Tipografía H1 | Inter 700 / Instrument Serif global | Instrument Serif **solo H1 página + editorial** |
| Glassmorphism | `.glass-effect` activo en cabeceras y paneles | Eliminado; sustituido por `surface + shadow-sm` |
| Gradientes | `gradient-teal`, `gradient-amber` decorativos | Solo `gradient-teal-marketing` en logo/splash |
| Selección de texto | `selection:bg-teal-500/30` | `selection:bg-primary/25` |
| Pasos stepper negativo | Rosa hardcoded | `error-hl` + `text-error` |

---

## 4. Infraestructura de tema

### 4.1 Persistencia (tres capas)

```
┌──────────────────────────────────────────────────────────────┐
│  user.theme_preference  (BD — fuente de verdad cross-device) │
│         ▲                                                    │
│         │  updateThemePreferenceAction (server action)       │
│         │                                                    │
│  Cookie: dfa-theme  (legible en SSR, evita FOUC)             │
│         ▲                                                    │
│         │  set en login + en cada cambio                     │
│                                                              │
│  localStorage: dfa-theme  (caché optimista cliente)          │
└──────────────────────────────────────────────────────────────┘
```

**Por qué tres capas**:
- **BD** sobrevive a borrar cookies y se replica entre dispositivos del mismo usuario.
- **Cookie** la lee `app/layout.tsx` en SSR para emitir `<html class="light|dark">` correcto en el **primer byte** (sin parpadeo).
- **localStorage** permite cambiar tema sin round-trip al servidor mientras el server action se resuelve en background.

### 4.2 Esquema BD

Agregar a `user` en [lib/db/schema.ts](../frontend/lib/db/schema.ts):

```ts
themePreference: text("theme_preference").default('system').notNull(),
// valores válidos: 'light' | 'dark' | 'system'
```

Migración runtime via [lib/db/infrastructure.ts](../frontend/lib/db/infrastructure.ts) (`INFRA_VERSION='v4.1'`):

```sql
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS theme_preference text NOT NULL DEFAULT 'system';
```

### 4.3 Server action

`frontend/lib/db/actions/userPreferences.ts`:

```ts
'use server';
export async function updateThemePreferenceAction(
  value: 'light' | 'dark' | 'system'
) {
  const me = await getServerIdentity();
  await db.update(user).set({ themePreference: value }).where(eq(user.id, me.id));
  cookies().set('dfa-theme', value, {
    path: '/', maxAge: 60*60*24*365, sameSite: 'lax'
  });
}

export async function getThemePreferenceAction() {
  const me = await getServerIdentity();
  const row = await db.select({ p: user.themePreference })
    .from(user).where(eq(user.id, me.id)).limit(1);
  return (row[0]?.p ?? 'system') as 'light' | 'dark' | 'system';
}
```

Reconciliación en login (NextAuth callback `signIn`): leer `themePreference` de BD y escribir cookie `dfa-theme` con ese valor.

### 4.4 Provider cliente

`frontend/components/theme/ThemeProvider.tsx`:

```tsx
'use client';
type ThemeMode = 'light' | 'dark' | 'system';

export function ThemeProvider({ initial, children }: { initial: ThemeMode; children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(initial);

  useEffect(() => {
    const root = document.documentElement;
    const apply = (eff: 'light' | 'dark') => {
      root.classList.toggle('dark', eff === 'dark');
      root.classList.toggle('light', eff === 'light');
    };
    if (mode === 'system') {
      const mql = matchMedia('(prefers-color-scheme: dark)');
      apply(mql.matches ? 'dark' : 'light');
      const onChange = (e: MediaQueryListEvent) => apply(e.matches ? 'dark' : 'light');
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    apply(mode);
  }, [mode]);

  const update = async (next: ThemeMode) => {
    setMode(next);
    localStorage.setItem('dfa-theme', next);
    await updateThemePreferenceAction(next);
  };

  return <ThemeContext.Provider value={{ mode, setMode: update }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider');
  return ctx;
}
```

### 4.5 SSR sin flash

[app/layout.tsx](../frontend/app/layout.tsx) deja de hardcodear `dark`:

```tsx
import { cookies } from 'next/headers';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const themePref = (cookieStore.get('dfa-theme')?.value ?? 'system') as ThemeMode;

  return (
    <html lang="es" className={`${inter.variable} ${instrumentSerif.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: `
            (function() {
              var pref = '${themePref}';
              var dark = pref === 'dark' || (pref === 'system' &&
                window.matchMedia('(prefers-color-scheme: dark)').matches);
              document.documentElement.classList.add(dark ? 'dark' : 'light');
            })();
          `}}
        />
      </head>
      <body className="antialiased selection:bg-primary/25 font-sans">
        <ThemeProvider initial={themePref}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

**Por qué el script inline**: cuando la preferencia es `system`, la cookie no sabe la resolución; el script ejecuta antes del primer paint y aplica la clase correcta. ~150 bytes.

---

## 5. UI de preferencia en el perfil del usuario

Sección "Apariencia" dentro de [app/dashboard/profile/page.tsx](../frontend/app/dashboard/profile/page.tsx).

### 5.1 Ubicación

Bloque nuevo, después de los datos personales y antes de las secciones específicas de rol (matriz de habilidades para técnico, etc.).

### 5.2 Spec visual

```
┌─────────────────────────────────────────────────────────────────┐
│  Apariencia                                                     │
│  ───────────────────────────────────────────────────────────    │
│  Elige cómo se ve DentFlowAi en este y todos tus dispositivos. │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │  ☀  Claro    │  │  🌙 Oscuro   │  │  🖥 Sistema  │           │
│  │              │  │              │  │   (activo)   │           │
│  │  [preview]   │  │  [preview]   │  │  [preview]   │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│                                                                 │
│  La opción "Sistema" sigue automáticamente la preferencia       │
│  de tu sistema operativo.                                       │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Comportamiento

| Aspecto | Comportamiento |
|---|---|
| Tipo de control | 3 tarjetas radio (no dropdown). Cada una con icono lucide (`Sun`, `Moon`, `Monitor`), label y mini-preview (rectángulo con dos franjas mostrando bg + primary del modo). |
| Selección | Click sobre la tarjeta. La activa muestra `border-primary` + chip "activo" + `shadow-focus`. |
| Cambio aplicado | **Inmediato** en cliente (provider re-aplica clase al `<html>` antes de que termine el server action). |
| Persistencia | Server action `updateThemePreferenceAction(value)` se llama en background; ante error se mantiene el cambio en cliente y se muestra toast de error con retry. |
| Feedback | `useToast()` con mensaje "Apariencia actualizada" tras éxito del server action. |
| Accesibilidad | Tarjetas con `role="radio"`, `aria-checked`, navegables con teclado (←/→ entre opciones, Enter/Space para confirmar). |
| Modo `system` | Si el usuario cambia el tema del SO con la app abierta, la UI se actualiza en vivo (listener `matchMedia` en el provider). |
| Impersonación admin | El selector respeta la preferencia del **admin que impersona**, no del usuario impersonado. El selector visible es el del admin. |

### 5.4 Componente

`frontend/components/profile/ThemeSelector.tsx` — Client Component que consume `useTheme()` del provider. Aprox. 80 LOC. Reutilizable si más adelante se quiere agregar en otra parte (modal de settings, dropdown del avatar).

---

## 6. Tokens — `theme.css` completo

Reemplazo total de [frontend/app/theme.css](../frontend/app/theme.css):

```css
@import "tailwindcss";

/* ───── Light (default) ───── */
:root, .light {
  --color-background: #f4f6f9;
  --color-surface:    #ffffff;
  --color-surface-2:  #f8fafc;
  --color-surface-off:#edf0f5;
  --color-divider:    #e2e8f0;
  --color-border:     rgba(15,30,60,.10);

  --color-foreground: #0f1c2e;
  --color-muted:      #4a5568;
  --color-faint:      #8896a7;
  --color-inverse:    #ffffff;

  --color-primary:        #3b5bdb;
  --color-primary-hover:  #2f4ac8;
  --color-primary-active: #2340b5;
  --color-primary-fg:     #ffffff;
  --color-primary-hl:     rgba(59,91,219,.08);

  --color-jade:       #0e9f6e;
  --color-jade-hover: #087a55;
  --color-jade-hl:    rgba(14,159,110,.08);

  --color-warning:    #d97706;
  --color-warning-hl: rgba(217,119,6,.10);
  --color-error:      #dc2626;
  --color-error-hl:   rgba(220,38,38,.08);

  --shadow-sm: 0 1px 3px rgba(15,30,60,.06), 0 1px 2px rgba(15,30,60,.04);
  --shadow-md: 0 4px 12px rgba(15,30,60,.08), 0 2px 4px rgba(15,30,60,.04);
  --shadow-lg: 0 12px 32px rgba(15,30,60,.10), 0 4px 8px rgba(15,30,60,.04);
  --shadow-focus: 0 0 0 3px rgba(59,91,219,.22);

  --radius-sm: 6px; --radius-md: 10px; --radius-lg: 14px; --radius-xl: 20px;

  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px;
  --space-12: 48px; --space-16: 64px;

  --transition: 160ms cubic-bezier(.16,1,.3,1);
}

/* ───── Dark ───── */
.dark {
  --color-background: #0c0f14;
  --color-surface:    #131720;
  --color-surface-2:  #1a2030;
  --color-surface-off:#212840;
  --color-divider:    #2a3348;
  --color-border:     rgba(255,255,255,.08);

  --color-foreground: #dce6f4;
  --color-muted:      #8b9ab4;
  --color-faint:      #566070;
  --color-inverse:    #0c0f14;

  --color-primary:        #6282f0;
  --color-primary-hover:  #7b97ff;
  --color-primary-active: #9aafff;
  --color-primary-fg:     #ffffff;
  --color-primary-hl:     rgba(98,130,240,.12);

  --color-jade:       #34d399;
  --color-jade-hover: #10b981;
  --color-jade-hl:    rgba(52,211,153,.10);

  --color-warning:    #fbbf24;
  --color-warning-hl: rgba(251,191,36,.10);
  --color-error:      #f87171;
  --color-error-hl:   rgba(248,113,113,.10);

  --shadow-sm: 0 1px 3px rgba(0,0,0,.25);
  --shadow-md: 0 4px 16px rgba(0,0,0,.35);
  --shadow-lg: 0 12px 40px rgba(0,0,0,.45);
  --shadow-focus: 0 0 0 3px rgba(98,130,240,.30);
}

/* Exposición a Tailwind */
@theme inline {
  --color-background: var(--color-background);
  --color-surface:    var(--color-surface);
  --color-surface-2:  var(--color-surface-2);
  --color-surface-off:var(--color-surface-off);
  --color-divider:    var(--color-divider);
  --color-border:     var(--color-border);
  --color-foreground: var(--color-foreground);
  --color-muted:      var(--color-muted);
  --color-faint:      var(--color-faint);
  --color-inverse:    var(--color-inverse);
  --color-primary:    var(--color-primary);
  --color-primary-fg: var(--color-primary-fg);
  --color-primary-hl: var(--color-primary-hl);
  --color-jade:       var(--color-jade);
  --color-jade-hl:    var(--color-jade-hl);
  --color-warning:    var(--color-warning);
  --color-warning-hl: var(--color-warning-hl);
  --color-error:      var(--color-error);
  --color-error-hl:   var(--color-error-hl);
  --font-sans:  var(--font-inter), system-ui, sans-serif;
  --font-serif: var(--font-instrument), Georgia, serif;
  --radius-sm:  var(--radius-sm);
  --radius-md:  var(--radius-md);
  --radius-lg:  var(--radius-lg);
  --radius-xl:  var(--radius-xl);
  --shadow-sm:  var(--shadow-sm);
  --shadow-md:  var(--shadow-md);
  --shadow-lg:  var(--shadow-lg);
}

body {
  background: var(--color-background);
  color: var(--color-foreground);
  font-family: var(--font-sans);
  transition: background-color var(--transition), color var(--transition);
  overflow-x: hidden;
}

h1, .h-display { font-family: var(--font-serif); }

/* Solo se conserva para contextos de marca */
.gradient-teal-marketing {
  background: linear-gradient(135deg, #0d9488 0%, #2dd4bf 100%);
}

/* Scrollbar — neutro y theme-aware */
.custom-scrollbar::-webkit-scrollbar { width: 3px; height: 3px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--color-divider);
  border-radius: 10px;
}
.custom-scrollbar:hover::-webkit-scrollbar-thumb { background: var(--color-primary); opacity: .4; }

.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
```

Con esto Tailwind expone utilidades `bg-surface`, `text-muted`, `border-divider`, `ring-primary`, `shadow-md`, `rounded-md`, etc., y resuelven al modo activo automáticamente.

---

## 7. Tabla de reemplazos (mapeo mecánico)

Refactor de las 1.428 ocurrencias. Mapeo dirigido para cubrir el 80% con codemod, y el 20% restante revisión manual.

| Hoy (dark-only) | Reemplazo (theme-aware) | Notas |
|---|---|---|
| `bg-slate-950` | `bg-background` | Fondo página |
| `bg-slate-900` | `bg-surface` | Cards, modales |
| `bg-slate-800` | `bg-surface-2` | Inputs, secciones |
| `bg-slate-700` | `bg-surface-off` | Hover de elementos densos |
| `bg-white/5` | `bg-surface-off` o `hover:bg-surface-off` | Revisar uso (fondo vs hover) |
| `bg-white/10` | `bg-surface-off` | Hover items |
| `bg-white/[0.04]` | `bg-surface-off/60` | Variantes sutiles |
| `border-white/10` | `border-divider` | Separadores |
| `border-white/20` | `border-border` | Bordes activos |
| `text-white` | `text-foreground` | Cuerpo |
| `text-slate-300` / `text-slate-400` | `text-muted` | Secundario |
| `text-slate-500` / `text-slate-600` / `text-slate-700` | `text-faint` | Meta, labels |
| `text-teal-300` / `text-teal-400` / `text-teal-500` | `text-primary` | Links, acentos |
| `ring-teal-400/40` / `ring-teal-500/40` | `ring-primary/30` (o usar `shadow-focus`) | Focus ring |
| `bg-teal-500` / `bg-teal-600` (botón) | `bg-primary` | CTA |
| `bg-teal-500/30` (selection) | `bg-primary/25` | Selección de texto |
| `bg-rose-*` / `text-rose-*` (stepper terminal negativo) | `bg-error-hl` / `text-error` | Pasos rechazado/cerrado |
| `bg-amber-*` / `text-amber-*` decorativo | `bg-warning-hl` / `text-warning` si es semántico; eliminar si decorativo | |
| `glass-effect` | `bg-surface shadow-sm border border-divider` | Cabeceras UCH y paneles |
| `gradient-teal` decorativo | Eliminar | Sobrevive solo como `gradient-teal-marketing` en logo/splash |
| `gradient-amber` | Eliminar | Sin reemplazo |

### Codemod

`frontend/scripts/migrate-tokens.ts` (one-shot, idempotente):
- Recorre `frontend/{app,components}/**/*.{tsx,ts}`.
- Aplica los reemplazos 1:1 listados arriba.
- Marca con comentario `// TODO(theme): revisar` los casos ambiguos (ej. `bg-white/X` cuando aparece en gradiente o como overlay de imagen).
- Imprime reporte de matches por archivo y total reemplazado.
- **No** toca tests; se actualizan a mano para no romper assertions semánticas.

---

## 8. Inventario completo de archivos a migrar

**Total: 72 archivos.** No hay omisiones — esta lista cubre el 100% del producto funcional.

### 8.1 Root y layouts (3)
- [app/layout.tsx](../frontend/app/layout.tsx)
- [app/dashboard/layout.tsx](../frontend/app/dashboard/layout.tsx)
- [app/page.tsx](../frontend/app/page.tsx)

### 8.2 Páginas de error y not-found (2)
- [app/error.tsx](../frontend/app/error.tsx)
- [app/not-found.tsx](../frontend/app/not-found.tsx)

### 8.3 Autenticación y onboarding (5)
- [app/auth/login/page.tsx](../frontend/app/auth/login/page.tsx)
- [app/auth/register/page.tsx](../frontend/app/auth/register/page.tsx)
- [app/auth/verify/page.tsx](../frontend/app/auth/verify/page.tsx)
- [app/auth/forgot-password/page.tsx](../frontend/app/auth/forgot-password/page.tsx)
- [components/auth/AuthNavbar.tsx](../frontend/components/auth/AuthNavbar.tsx)

### 8.4 Dashboard home y perfil (5)
- [app/dashboard/page.tsx](../frontend/app/dashboard/page.tsx)
- [app/dashboard/profile/page.tsx](../frontend/app/dashboard/profile/page.tsx)
- [components/dashboard/DashboardKpiCard.tsx](../frontend/components/dashboard/DashboardKpiCard.tsx)
- [components/dashboard/DashboardKpiStrip.tsx](../frontend/components/dashboard/DashboardKpiStrip.tsx)
- [components/dashboard/DashboardRecentCasesSection.tsx](../frontend/components/dashboard/DashboardRecentCasesSection.tsx)

### 8.5 Listados y vistas de casos (4)
- [app/dashboard/cases/page.tsx](../frontend/app/dashboard/cases/page.tsx)
- [app/dashboard/cases/new/page.tsx](../frontend/app/dashboard/cases/new/page.tsx)
- [app/dashboard/kanban/page.tsx](../frontend/app/dashboard/kanban/page.tsx)
- [app/dashboard/finance/page.tsx](../frontend/app/dashboard/finance/page.tsx)

### 8.6 Ficha de caso y UCH (15 — zona crítica)
- [app/dashboard/cases/[id]/page.tsx](../frontend/app/dashboard/cases/[id]/page.tsx)
- [components/cases/UnifiedCaseHub.tsx](../frontend/components/cases/UnifiedCaseHub.tsx)
- [components/cases/CaseWorkflowStepper.tsx](../frontend/components/cases/CaseWorkflowStepper.tsx) *(incluye remapeo pasos rosa → error-hl)*
- [components/cases/ComparativeOffersPanel.tsx](../frontend/components/cases/ComparativeOffersPanel.tsx)
- [components/cases/AcceptedProposalSummary.tsx](../frontend/components/cases/AcceptedProposalSummary.tsx)
- [components/cases/CaseDetailManagementBar.tsx](../frontend/components/cases/CaseDetailManagementBar.tsx)
- [components/cases/CaseFichaHubAndServiceIcons.tsx](../frontend/components/cases/CaseFichaHubAndServiceIcons.tsx)
- [components/cases/CaseViewerStatusStripe.tsx](../frontend/components/cases/CaseViewerStatusStripe.tsx)
- [components/cases/OfferConditionsBlock.tsx](../frontend/components/cases/OfferConditionsBlock.tsx)
- [components/cases/uch/UchEventBubble.tsx](../frontend/components/cases/uch/UchEventBubble.tsx) *(carriles self/thread: rediseño manual de contraste)*
- [components/cases/uch/UchFauchardActionsPanel.tsx](../frontend/components/cases/uch/UchFauchardActionsPanel.tsx)
- [components/cases/uch/UchDeliveryPanel.tsx](../frontend/components/cases/uch/UchDeliveryPanel.tsx)
- [components/cases/uch/UchDentistReviewPanel.tsx](../frontend/components/cases/uch/UchDentistReviewPanel.tsx)
- [components/cases/uch/UchDealSummary.tsx](../frontend/components/cases/uch/UchDealSummary.tsx)
- [components/cases/uch/UchQuoteBreakdown.tsx](../frontend/components/cases/uch/UchQuoteBreakdown.tsx)

### 8.7 Componentes de listado, filtros y wizard (11)
- [components/cases/CaseCreationWizard.tsx](../frontend/components/cases/CaseCreationWizard.tsx)
- [components/cases/CaseListToolbar.tsx](../frontend/components/cases/CaseListToolbar.tsx)
- [components/cases/CaseListFiltersModal.tsx](../frontend/components/cases/CaseListFiltersModal.tsx)
- [components/cases/CaseListTimelineFilter.tsx](../frontend/components/cases/CaseListTimelineFilter.tsx)
- [components/cases/AdvancedFiltersRow.tsx](../frontend/components/cases/AdvancedFiltersRow.tsx)
- [components/cases/CaseCardSkeleton.tsx](../frontend/components/cases/CaseCardSkeleton.tsx)
- [components/cases/CreateCaseLinkButton.tsx](../frontend/components/cases/CreateCaseLinkButton.tsx)
- [components/cases/KanbanBoard.tsx](../frontend/components/cases/KanbanBoard.tsx)
- [components/cases/MarketplaceCaseCard.tsx](../frontend/components/cases/MarketplaceCaseCard.tsx)
- [components/cases/STLThumbnail.tsx](../frontend/components/cases/STLThumbnail.tsx)
- [components/cases/TeethSelector.tsx](../frontend/components/cases/TeethSelector.tsx)

### 8.8 Visor 3D (1)
- [components/DentalViewer3D.tsx](../frontend/components/DentalViewer3D.tsx) *(solo chrome; canvas Three.js no se toca)*

### 8.9 Perfil de técnico (2)
- [components/profile/AvailabilityToggle.tsx](../frontend/components/profile/AvailabilityToggle.tsx)
- [components/profile/SkillMatrixForm.tsx](../frontend/components/profile/SkillMatrixForm.tsx)

### 8.10 Admin general (4)
- [app/dashboard/admin/page.tsx](../frontend/app/dashboard/admin/page.tsx)
- [app/dashboard/admin/catalogos/page.tsx](../frontend/app/dashboard/admin/catalogos/page.tsx)
- [app/dashboard/admin/contactguard/page.tsx](../frontend/app/dashboard/admin/contactguard/page.tsx)
- [components/admin/ImpersonationSelector.tsx](../frontend/components/admin/ImpersonationSelector.tsx)

### 8.11 Admin Fauchard (15)
- [app/dashboard/admin/fauchard/page.tsx](../frontend/app/dashboard/admin/fauchard/page.tsx)
- [app/dashboard/admin/fauchard/TabClient.tsx](../frontend/app/dashboard/admin/fauchard/TabClient.tsx)
- [app/dashboard/admin/fauchard/monitor/page.tsx](../frontend/app/dashboard/admin/fauchard/monitor/page.tsx)
- [app/dashboard/admin/fauchard/simulate/page.tsx](../frontend/app/dashboard/admin/fauchard/simulate/page.tsx)
- [components/admin/fauchard/ConcentrationAlert.tsx](../frontend/components/admin/fauchard/ConcentrationAlert.tsx)
- [components/admin/fauchard/ConfigChangeLog.tsx](../frontend/components/admin/fauchard/ConfigChangeLog.tsx)
- [components/admin/fauchard/ConfirmSaveModal.tsx](../frontend/components/admin/fauchard/ConfirmSaveModal.tsx)
- [components/admin/fauchard/FailedSelectionsPanel.tsx](../frontend/components/admin/fauchard/FailedSelectionsPanel.tsx)
- [components/admin/fauchard/FauchardFiltersPanel.tsx](../frontend/components/admin/fauchard/FauchardFiltersPanel.tsx)
- [components/admin/fauchard/FauchardNav.tsx](../frontend/components/admin/fauchard/FauchardNav.tsx)
- [components/admin/fauchard/FauchardWeightsPanel.tsx](../frontend/components/admin/fauchard/FauchardWeightsPanel.tsx)
- [components/admin/fauchard/InvitationDistributionChart.tsx](../frontend/components/admin/fauchard/InvitationDistributionChart.tsx)
- [components/admin/fauchard/LeagueConfigPanel.tsx](../frontend/components/admin/fauchard/LeagueConfigPanel.tsx)
- [components/admin/fauchard/QuotationMetricsPanel.tsx](../frontend/components/admin/fauchard/QuotationMetricsPanel.tsx)
- [components/admin/fauchard/SimulatorPanel.tsx](../frontend/components/admin/fauchard/SimulatorPanel.tsx)
- [components/admin/fauchard/TechnicianRankingTable.tsx](../frontend/components/admin/fauchard/TechnicianRankingTable.tsx)

### 8.12 UI primitives (4)
- [components/ui/Button.tsx](../frontend/components/ui/Button.tsx)
- [components/ui/Input.tsx](../frontend/components/ui/Input.tsx)
- [components/ui/Slider.tsx](../frontend/components/ui/Slider.tsx)
- [components/ui/StatusBadge.tsx](../frontend/components/ui/StatusBadge.tsx)

### 8.13 Archivos nuevos a crear (4)
- `frontend/components/theme/ThemeProvider.tsx`
- `frontend/components/theme/ThemeContext.ts`
- `frontend/components/profile/ThemeSelector.tsx`
- `frontend/lib/db/actions/userPreferences.ts`

---

## 9. Bloques de trabajo (orden recomendado dentro del big-bang)

Aunque la entrega es un único merge, el trabajo dentro de la rama se organiza por bloques para facilitar revisión interna y QA incremental.

| Bloque | Contenido | Días |
|---|---|---|
| **A. Infra de tema** | Schema BD, `userPreferences.ts`, `ThemeProvider`, `ThemeSelector`, `theme.css` completo, `app/layout.tsx` reescrito | 1.5 |
| **B. UI primitives** | `Button`, `Input`, `Slider`, `StatusBadge` migrados a tokens | 1 |
| **C. Shell + auth + onboarding** | Layouts, navbar, AuthNavbar, login/register/verify/forgot-password, error, not-found, home pública | 1.5 |
| **D. Dashboard home + perfil** | `dashboard/page.tsx`, `profile/page.tsx`, KPIs, integración de `ThemeSelector` en perfil | 1 |
| **E. Listados de casos** | `cases/page.tsx`, kanban, finance, marketplace card, wizard, filtros, toolbar | 2 |
| **F. UCH completo** | Ficha de caso + UCH + stepper (con remapeo rosa→error) + paneles + bubbles (rediseño self/thread) | 4 |
| **G. Admin** | Dashboard admin, catálogos, contactguard, Fauchard completo (15 archivos), impersonación | 2 |
| **H. Tests + QA** | Update fixtures Vitest, smoke tests, QA cross-rol y cross-tema, contraste WCAG, accesibilidad selector | 2 |

**Total estimado: 15 días dev** (+30% margen = ~3 semanas calendario).

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| **FOUC en SSR** al cargar modo `system` | Script inline pre-hidratación (sección 4.5); `suppressHydrationWarning` en `<html>` |
| **Conflicto entre `localStorage`, cookie y BD** | BD es fuente de verdad; en login se reconcilia → cookie + localStorage; cambios optimistas en cliente con server action no bloqueante |
| **Snapshots de tests rotos** | Bloque H dedicado a actualizar fixtures; revisar [frontend/test](../frontend/test) sistemáticamente |
| **UCH bubbles indistinguibles en light** | Rediseño manual de carriles antes del codemod: `thread` = `bg-surface border-divider`; `self` = `bg-primary-hl border border-primary/20` |
| **Stepper pasos rosa** | Decisión explícita (sección 2 #2): `bg-error-hl` + `text-error` |
| **Glassmorphism perdido** | Aceptado en decisión #4. Cabeceras UCH y paneles usan `bg-surface` + `shadow-sm` + `border-divider` |
| **Identidad de marca teal** | Sobrevive como `.gradient-teal-marketing` en logo, splash, login background, vacíos ilustrados |
| **Selección de texto** | `selection:bg-primary/25` global en `<body>` |
| **Visor 3D Three.js** | El canvas se renderiza con sus propios shaders; solo se ajusta el chrome (toolbar, controles) |
| **Impersonación admin** | El selector de tema visible y aplicado siempre es el del usuario autenticado (admin), no del impersonado |
| **Codemod ambiguo en `bg-white/X`** | Reemplazos marcados como `// TODO(theme): revisar`; cada bloque revisa los TODOs de su scope |

---

## 11. Checklist de aceptación (DoD)

### Infraestructura
- [ ] Columna `user.theme_preference` creada vía `infrastructure.ts` (`INFRA_VERSION='v4.1'`).
- [ ] Server action `updateThemePreferenceAction` y `getThemePreferenceAction` funcionando.
- [ ] Cookie `dfa-theme` se setea en login y en cada cambio.
- [ ] `ThemeProvider` montado en root layout; `useTheme()` disponible en client components.
- [ ] Script inline anti-FOUC verificado: recarga dura en Chrome con throttling "Slow 3G" no muestra parpadeo.

### UI de selección
- [ ] Selector de tema (3 tarjetas: Claro / Oscuro / Sistema) presente en `/dashboard/profile`.
- [ ] Cambio aplica de inmediato sin recarga.
- [ ] Persiste cross-device (login en otro browser respeta la preferencia).
- [ ] Modo `system` cambia en vivo cuando el usuario cambia el tema del SO con la app abierta.
- [ ] Toast de confirmación tras cambio exitoso.
- [ ] Navegable con teclado (←/→ + Enter).
- [ ] `aria-checked` correcto en cada tarjeta.

### Migración visual
- [ ] Los **72 archivos** del inventario migrados.
- [ ] Grep limpio: cero ocurrencias de `bg-slate-*`, `text-slate-*`, `bg-white/X`, `border-white/X`, `text-teal-*`, `bg-teal-*`, `ring-teal-*`, `text-rose-*`, `bg-rose-*`, `glass-effect`, `gradient-teal` (fuera de `gradient-teal-marketing`), `gradient-amber`.
- [ ] [app/layout.tsx](../frontend/app/layout.tsx) no contiene `className="... dark"` hardcoded.
- [ ] `selection:bg-teal-500/30` reemplazado por `selection:bg-primary/25`.

### Verificación funcional
- [ ] `npm run test:run` pasa.
- [ ] `npm run test:smoke` pasa.
- [ ] `npm run validate:full` (lint + type-check + build) limpio.
- [ ] Recorrido QA en **light**: dentista, técnico, admin.
- [ ] Recorrido QA en **dark**: dentista, técnico, admin.
- [ ] Recorrido QA en **system** con cambio de SO en vivo.
- [ ] Impersonación admin → técnico/dentista: el tema aplicado es el del admin.
- [ ] UCH: bubbles `self` vs `thread` claramente distinguibles en light y dark.
- [ ] Stepper: pasos `rechazado`/`cerrado` en `error-hl` + `text-error`, verificado en ambos modos.

### Accesibilidad
- [ ] Contraste WCAG verificado en las 8 combinaciones de la tabla del design system (light + dark).
- [ ] Focus ring (`shadow-focus`) visible en todos los elementos interactivos.
- [ ] Selector de tema accesible con teclado y screen reader.

---

## 12. Lo que NO se hace en esta migración

- No se rediseña la arquitectura de pantallas (mismos componentes, mismas rutas).
- No se cambia lógica de negocio (Fauchard, server actions, schema clínico).
- No se introducen nuevos componentes funcionales (Button, Card, etc. se refactorizan, no se reemplazan).
- No se toca el canvas Three.js del visor 3D (solo el chrome alrededor).
- No se migran emails transaccionales (Resend) — son un sistema separado.
- No se introduce `next-themes` ni otra dependencia de tema.
- No se hace branding nuevo (logo, favicon).

---

*Complemento operativo de [dentflowai-design-system.md](dentflowai-design-system.md). Mayo 2026.*
