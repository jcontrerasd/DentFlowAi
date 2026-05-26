# Paleta de Colores — DentFlowAi

Definición canónica derivada de [frontend/app/theme.css](../frontend/app/theme.css) (Tailwind CSS 4, config inline en CSS vía `@theme`). La app soporta tema claro y oscuro mediante variables CSS en `:root` y `.dark`.

## Tokens semánticos (variables CSS)

| Token | Light | Dark | Uso |
|---|---|---|---|
| `--background` | `#ffffff` | `#020617` (slate-950) | Fondo base de la app |
| `--foreground` | `#0f172a` (slate-900) | `#f8fafc` (slate-50) | Texto principal |
| `--primary` | `#0d9488` (teal-600) | `#2dd4bf` (teal-400) | Color de marca / acciones primarias |
| `--primary-foreground` | `#f0fdfa` (teal-50) | `#042f2e` (teal-950) | Texto sobre `--primary` |
| `--secondary` | `#64748b` (slate-500) | `#94a3b8` (slate-400) | Texto secundario / soporte |
| `--glass-bg` | `rgba(255,255,255,0.7)` | `rgba(15,23,42,0.7)` | Fondo glassmorphism |
| `--glass-border` | `rgba(203,213,225,0.5)` | `rgba(51,65,85,0.5)` | Borde glassmorphism |

Estos tokens se exponen a Tailwind como `bg-background`, `text-foreground`, `bg-primary`, `text-primary-foreground` vía el bloque `@theme inline`.

## Color de marca — Teal

El acento principal de DentFlowAi es **teal** (verde-azulado). Aparece en hovers, focus rings, links inline y gradiente de marca.

| Tono | Hex | Uso típico |
|---|---|---|
| teal-200 | `#99f6e4` | Hover de links de texto (`hover:text-teal-200`) |
| teal-300 | `#5eead4` | Links inline (`text-teal-300`) |
| teal-400 | `#2dd4bf` | Primary en dark; focus rings (`ring-teal-400/40`); fin del `gradient-teal` |
| teal-500 | `#14b8a6` | Scrollbar premium en hover (`rgba(20,184,166,0.4)`) |
| teal-600 | `#0d9488` | Primary en light; inicio del `gradient-teal` |
| teal-50 | `#f0fdfa` | Primary-foreground (light) |
| teal-950 | `#042f2e` | Primary-foreground (dark) |

## Color de acento secundario — Amber

Usado en gradiente `gradient-amber` (alertas / acentos cálidos).

| Tono | Hex | Uso |
|---|---|---|
| amber-400 | `#fbbf24` | Fin del `gradient-amber` |
| amber-600 | `#d97706` | Inicio del `gradient-amber` |

## Escala neutra — Slate

Base de fondos, bordes y tipografía.

| Tono | Hex |
|---|---|
| slate-50 | `#f8fafc` |
| slate-400 | `#94a3b8` |
| slate-500 | `#64748b` |
| slate-900 | `#0f172a` |
| slate-950 | `#020617` |

## Gradientes utilitarios

Definidos como clases en `theme.css`:

- `.gradient-teal` → `linear-gradient(135deg, #0d9488 0%, #2dd4bf 100%)`
- `.gradient-amber` → `linear-gradient(135deg, #d97706 0%, #fbbf24 100%)`

## Glassmorphism

Clase `.glass-effect` combina `--glass-bg` + `backdrop-filter: blur(12px)` + borde `--glass-border`.

## Convenciones de affordances (hover/focus)

Según [frontend/CLAUDE.md](../frontend/CLAUDE.md):

- **Focus ring estándar**: `focus-visible:ring-2 focus-visible:ring-teal-400/40`
- **Hover sobre superficies oscuras**: `hover:bg-white/5` (tarjetas), `hover:bg-white/[0.04]` (filas)
- **Links inline**: `text-teal-300 hover:text-teal-200 hover:underline`
- **Bordes hover**: `hover:border-white/20`

## Estados de caso (UCH stepper)

Aunque no son tokens del tema, los pasos terminales negativos (`rechazado` / `cerrado`) del `CaseWorkflowStepper` se pintan en **rosa** para diferenciarlos del gris neutro de pasos no alcanzados.

## Tipografía asociada

- `--font-sans` → Inter (cuerpo)
- `--font-serif` → Instrument Serif (h1, h2, h3, `.serif-font`)
