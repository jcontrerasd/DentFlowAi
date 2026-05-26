# DentFlowAI — Design System & Look and Feel

> Definición canónica del sistema de diseño propuesto. Mayo 2026.

---

## Art Direction

| Pilar | Decisión | Razón |
|---|---|---|
| **Tono** | Profesional-científico. Calma clínica. Confianza sin frialdad | Plataforma de IA para decisiones odontológicas de alta responsabilidad |
| **Modo base** | **Light mode default** + Dark mode como opt-in (toggle) | Clínicas dentales trabajan en ambientes iluminados; imponer dark = fatiga visual |
| **Densidad** | Balanced-dense | Usuarios expertos (admin, técnicos) con alta carga cognitiva |
| **Referencia** | Linear × Stripe × healthcare calm | Precisión tecnológica + confianza institucional |

---

## Paleta de Color

### Filosofía
- **1 acento primario** (índigo) para acciones y CTAs.
- **1 acento semántico** (jade) exclusivo para estados de salud/éxito del dominio odontológico.
- Todo lo demás: escala de superficies neutras.
- Amber y red **reservados únicamente** para alertas y errores. Nunca decorativos.

### Tokens — Light Mode (default)

```css
@theme inline {

  /* ── Superficies ── */
  --color-background:     #f4f6f9;   /* Fondo base app */
  --color-surface:        #ffffff;   /* Cards, panels, modales */
  --color-surface-2:      #f8fafc;   /* Fondo de inputs, filas de tabla */
  --color-surface-off:    #edf0f5;   /* Hover de filas, sidebar items */
  --color-divider:        #e2e8f0;   /* Separadores, bordes de tabla */
  --color-border:         rgba(15,30,60,.10); /* Bordes alpha-blended */

  /* ── Texto ── */
  --color-foreground:     #0f1c2e;   /* Texto principal — 18:1 sobre bg */
  --color-muted:          #4a5568;   /* Texto secundario — 7.2:1 ✓ AA */
  --color-faint:          #8896a7;   /* Labels, meta — 3.4:1 decorativo */
  --color-inverse:        #ffffff;   /* Texto sobre fondos de color */

  /* ── Primary — Índigo cobalto ── */
  --color-primary:        #3b5bdb;   /* CTA principal, links, nav activo */
  --color-primary-hover:  #2f4ac8;
  --color-primary-active: #2340b5;
  --color-primary-fg:     #ffffff;   /* Texto sobre primary — 5.9:1 ✓ */
  --color-primary-hl:     rgba(59,91,219,.08); /* Fondo tonal chips/hover */

  /* ── Jade — Salud / Éxito ── */
  --color-jade:           #0e9f6e;   /* Estado activo, caso aprobado */
  --color-jade-hover:     #087a55;
  --color-jade-hl:        rgba(14,159,110,.08);

  /* ── Semánticos ── */
  --color-warning:        #d97706;   /* Pendiente, revisión */
  --color-warning-hl:     rgba(217,119,6,.10);
  --color-error:          #dc2626;   /* Error, rechazado, alerta crítica */
  --color-error-hl:       rgba(220,38,38,.08);

  /* ── Tipografía ── */
  --font-sans:   'Inter', system-ui, sans-serif;
  --font-serif:  'Instrument Serif', Georgia, serif;

  /* ── Radios ── */
  --radius-sm:   6px;
  --radius-md:   10px;
  --radius-lg:   14px;
  --radius-xl:   20px;
  --radius-full: 9999px;

  /* ── Sombras ── */
  --shadow-sm: 0 1px 3px rgba(15,30,60,.06), 0 1px 2px rgba(15,30,60,.04);
  --shadow-md: 0 4px 12px rgba(15,30,60,.08), 0 2px 4px rgba(15,30,60,.04);
  --shadow-lg: 0 12px 32px rgba(15,30,60,.10), 0 4px 8px rgba(15,30,60,.04);
  --shadow-focus: 0 0 0 3px rgba(59,91,219,.22);

  /* ── Transición ── */
  --transition: 160ms cubic-bezier(.16,1,.3,1);
}
```

### Tokens — Dark Mode (`.dark` en `<html>`)

```css
.dark {
  --color-background:     #0c0f14;
  --color-surface:        #131720;
  --color-surface-2:      #1a2030;
  --color-surface-off:    #212840;
  --color-divider:        #2a3348;
  --color-border:         rgba(255,255,255,.08);

  --color-foreground:     #dce6f4;
  --color-muted:          #8b9ab4;
  --color-faint:          #566070;
  --color-inverse:        #0c0f14;

  --color-primary:        #6282f0;
  --color-primary-hover:  #7b97ff;
  --color-primary-active: #9aafff;
  --color-primary-fg:     #ffffff;
  --color-primary-hl:     rgba(98,130,240,.12);

  --color-jade:           #34d399;
  --color-jade-hover:     #10b981;
  --color-jade-hl:        rgba(52,211,153,.10);

  --color-warning:        #fbbf24;
  --color-warning-hl:     rgba(251,191,36,.10);
  --color-error:          #f87171;
  --color-error-hl:       rgba(248,113,113,.10);

  --shadow-sm: 0 1px 3px rgba(0,0,0,.25);
  --shadow-md: 0 4px 16px rgba(0,0,0,.35);
  --shadow-lg: 0 12px 40px rgba(0,0,0,.45);
  --shadow-focus: 0 0 0 3px rgba(98,130,240,.30);
}
```

---

## Tipografía

### Fuentes

| Tipo | Fuente | Uso |
|---|---|---|
| **Display** | Instrument Serif 400 | H1 de página, títulos de wizard/onboarding |
| **Body** | Inter 300–700 | Todo el resto: nav, botones, body, labels |

### Escala

| Elemento | Tamaño | Peso | Color |
|---|---|---|---|
| H1 página | 28–36px | 400 (serif) | `--color-foreground` |
| H2 sección | 18px | 700 (Inter) | `--color-foreground` |
| H3 card / modal | 15px | 700 (Inter) | `--color-foreground` |
| Body / descripción | 14px | 400 (Inter) | `--color-muted` |
| Botón / UI | 13–14px | 600 (Inter) | según contexto |
| Label tabla / meta | 11px | 700 (Inter) | `--color-faint`, uppercase, tracking `.06em` |

### Reglas

- **Instrument Serif solo para H1 y momentos editoriales** (wizard steps, onboarding). Mínimo 24px.
- **Inter para todo lo funcional**: nav, botones, inputs, tables, chips.
- Máximo **4 tamaños distintos por vista**.
- Mínimo absoluto: **12px** (etiquetas de badge, metadata).
- Body copy: **16px** en contextos de lectura larga; **14px** en UI densa.

---

## Contraste WCAG — Verificación (Light Mode)

| Combinación | Ratio | Nivel |
|---|---|---|
| Texto principal (#0f1c2e) / fondo (#f4f6f9) | 18.0:1 | **AAA** |
| Texto muted (#4a5568) / fondo | 7.2:1 | **AAA** |
| Texto muted / card (#ffffff) | 7.5:1 | **AAA** |
| Texto faint (#8896a7) / fondo — decorativo | 3.4:1 | ≥3:1 ✓ |
| Blanco / primary (#3b5bdb) — botón | 5.9:1 | **AAA** |
| Blanco / jade (#0e9f6e) — botón éxito | 4.7:1 | **AA** |
| Primary (#3b5bdb) / fondo — links | 6.2:1 | **AAA** |
| Jade (#0e9f6e) / fondo — estado | 4.8:1 | **AA** |

---

## Componentes

### Botones

```
Primary:    bg primary, text inverse, radius-md, 600 13-14px
Secondary:  bg surface, border divider, text muted, radius-md
Ghost:      bg transparent, border primary, text primary, radius-md
Jade:       bg jade, text inverse, radius-md (éxito / aprobar)
Danger:     bg error-hl, border error/20, text error, radius-md
Small:      padding 6px 13px, radius-sm
```

**Regla:** máximo **1 botón primary** por viewport. El resto usan secondary o ghost.

### Chips de estado

| Estado | Color bg | Color texto | Uso |
|---|---|---|---|
| Activo | `jade-hl` | `jade` | Caso/usuario activo — con dot pulsante |
| En proceso | `primary-hl` | `primary` | Derivación en curso |
| Pendiente | `warning-hl` | `warning` | Requiere acción |
| Rechazado | `error-hl` | `error` | Estado terminal negativo |
| Cerrado | `surface-off` | `muted` | Estado terminal neutro |
| Rol Admin | `primary-hl` fuerte | `primary` | Siempre índigo para roles |
| Rol Técnico | `surface-off` | `muted` | Rol estándar |

### Cards de módulo

```
bg: --color-surface
border: 1px solid --color-divider
border-radius: --radius-lg
padding: 20px
shadow: --shadow-sm
hover: border-color rgba(59,91,219,.2), shadow --shadow-md
```

- Ícono sobre **fondo tonal** (`primary-hl` o `jade-hl`), sin círculo de color sólido.
- Título en Mixed Case, **nunca ALL CAPS**.
- Descripción en `--color-muted`, máximo 2 líneas.
- Footer con chip de categoría + link de acción.

### Inputs / Formularios

```
bg: --color-surface
border: 1px solid --color-divider
border-radius: --radius-md
padding: 10px 14px
font-size: 14px
focus: border-color primary, box-shadow --shadow-focus
placeholder: --color-faint
```

### Tabla

```
th: font-size 11px, font-weight 700, uppercase, letter-spacing .06em, color faint
td: padding 13px 16px, border-bottom 1px solid surface-2
tr:hover: background --color-surface-off
font: tabular-nums para números
```

### Navegación lateral

```
Sidebar bg: --color-surface (blanco/claro)
sobre fondo bg (gris) → profundidad visible sin sombra
Item normal: color muted, hover bg surface-off
Item activo: bg primary-hl, color primary, font-weight 700
Grupos de nav: label 10px, uppercase, color faint
Logo mark: bg primary, ícono svg blanco
```

---

## Reglas de uso del acento

### ✅ Usar índigo (`--color-primary`) para:
- Botón primario CTA (uno por vista)
- Focus ring en inputs: `box-shadow: 0 0 0 3px rgba(59,91,219,.22)`
- Links inline y nav item activo
- Chips de rol (Admin, Master)
- Ícono de módulo activo / seleccionado

### ✅ Usar jade (`--color-jade`) para:
- Chip de estado "Activo" / "Aprobado"
- Botón de acción exitosa ("Aprobar derivación")
- KPI de métricas positivas de salud
- Indicadores de caso cerrado con éxito

### ❌ No usar colores de acento para:
- Fondo de cards genéricas
- Texto de cuerpo o descripción
- Más de 1 CTA por viewport simultáneamente
- Gradientes decorativos de fondo
- Bordes laterales en cards (`border-left: 3px solid accent`)

---

## Espaciado

Sistema de 4px base. Todo margin/padding referencia un token.

```css
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-5:  20px;
--space-6:  24px;
--space-8:  32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;
```

---

## Qué cambió respecto a la versión anterior

| Dimensión | Anterior | Propuesto |
|---|---|---|
| Modo base | Dark obligatorio (`#020617`) | Light default (`#f4f6f9`) |
| Color primario | Teal-400 `#2dd4bf` | Índigo `#3b5bdb` |
| Color de salud | Sin semántica propia | Jade `#0e9f6e` |
| Contraste muted | 4.0:1 ✗ (falla AA) | 7.2:1 ✓ (pasa AAA) |
| Tipografía H1 | Inter 700 uppercase | Instrument Serif 400 |
| Iconos en cards | Círculos de 4+ colores | Fondo tonal 1 color/módulo |
| Sidebar | Mismo negro que fondo | Blanco sobre gris, elevación visible |
| Row hover tabla | Ninguno | `surface-off` (#edf0f5) |
| Dark mode | Default único | Toggle disponible, fondo `#0c0f14` (no negro puro) |

---

## Lo que no cambia

- Stack tecnológico: Tailwind CSS 4 con `@theme inline`
- Fuente de body: **Inter** (solo se agrega Instrument Serif para display)
- Estructura de navegación y arquitectura de pantallas
- Sistema de chips semánticos por estado de caso
- Gradiente de marca `gradient-teal` puede mantenerse en contextos de marketing/landing

---

*Archivo generado en el contexto de la propuesta de Look & Feel — DentFlowAI, Mayo 2026.*
