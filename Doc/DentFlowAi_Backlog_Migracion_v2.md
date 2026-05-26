# DentFlowAi — Backlog de Migración: Marketplace → Servicio Orquestado
**Versión:** 1.0  
**Fecha:** 2026-04-29  
**Clasificación:** Interno — Planificación técnica

---

## Índice

1. [Principios de la migración](#1-principios-de-la-migración)
2. [Resumen ejecutivo: qué desaparece, qué llega, qué se mantiene](#2-resumen-ejecutivo)
3. [Mapa de decisiones por pieza del sistema](#3-mapa-de-decisiones-por-pieza-del-sistema)
4. [Sprint 0 — Fundamentos de Base de Datos](#sprint-0--fundamentos-de-base-de-datos)
5. [Sprint 1 — Perfil del Técnico: Competencias y Disponibilidad](#sprint-1--perfil-del-técnico-competencias-y-disponibilidad)
6. [Sprint 2 — Flujo del Dentista: Del Borrador a "En Evaluación"](#sprint-2--flujo-del-dentista-del-borrador-a-en-evaluación)
7. [Sprint 3 — Interface del Técnico: Invitaciones y Cotizaciones](#sprint-3--interface-del-técnico-invitaciones-y-cotizaciones)
8. [Sprint 4 — Motor de Caja Negra: Clasificación y Selección](#sprint-4--motor-de-caja-negra-clasificación-y-selección)
9. [Sprint 5 — Motor de Caja Negra: Evaluación y Propuesta al Dentista](#sprint-5--motor-de-caja-negra-evaluación-y-propuesta-al-dentista)
10. [Sprint 6 — Panel de Administración: Gestión del Algoritmo](#sprint-6--panel-de-administración-gestión-del-algoritmo)
11. [Sprint 7 — UCH y Flujo Post-adjudicación en el Nuevo Modelo](#sprint-7--uch-y-flujo-post-adjudicación-en-el-nuevo-modelo)
12. [Sprint 8 — Limpieza y Eliminación del Modelo Marketplace](#sprint-8--limpieza-y-eliminación-del-modelo-marketplace)
13. [Tabla de dependencias entre sprints](#13-tabla-de-dependencias-entre-sprints)
14. [Hilo conductor y duración estimada](#14-hilo-conductor-y-duración-estimada)

---

## 1. Principios de la migración

- **Nunca romper lo que funciona.** Cada sprint entrega algo usable. Nada queda en estado intermedio al cierre del sprint.
- **El sistema de chat (UCH) es intocable hasta Sprint 7.** Se adapta, no se reescribe.
- **El flujo post-adjudicación (diseño iterativo, fabricación, despacho) se reutiliza sin cambios.** Es exactamente el mismo modelo que el actual.
- **La base de datos tiene solo usuarios** — no hay casos ni archivos reales en producción. Podemos ejecutar migraciones destructivas sin riesgo de pérdida de datos de negocio.
- **El stub precede al motor real.** Los sprints 2 y 3 usan stubs que el Sprint 4/5 reemplaza con el motor real. Esto permite iterar sobre la UI antes de tener el backend completo.

---

## 2. Resumen ejecutivo

### 2.1 Lo que DESAPARECE del sistema

**Para el dentista**
- Ya no publica casos al marketplace
- Ya no ve una lista de ofertas de técnicos competidores
- Ya no elige al técnico (nunca sabrá quién es, ni cuántos cotizaron)
- Ya no hay negociación de precio ni plazo

**Para el técnico**
- Ya no navega un marketplace público de casos
- Ya no hace ofertas por iniciativa propia
- Ya no puede ver qué otros técnicos están compitiendo

**Del código**
- Las páginas `/dashboard/marketplace` y `/dashboard/bids`
- El sistema completo de ofertas (`bid` table, `BidManagerModal`, `bids.ts`, `marketplace.ts`)
- Las rondas comerciales (`commercial_round` table)
- Los Server Actions: `acceptBidAction`, `withdrawCaseAction`, `republishCaseAction`, `createBidAction`, `rejectBidAction`, `deleteBidAction`
- Los componentes: `BidManagerModal.tsx`, `MarketplaceCaseCard.tsx`

### 2.2 Lo que LLEGA nuevo

**Para el dentista**
- Crea el caso exactamente igual que antes (wizard sin cambios importantes)
- Hace clic en **"Enviar para evaluación"** — y espera
- La plataforma le devuelve una tarjeta con **tiempo de entrega + precio total** (sin desglose, sin identidad del técnico)
- Solo tiene dos opciones: **Aceptar** o **Rechazar** (con motivo opcional)
- Si acepta: el trabajo comienza. Nunca ve la identidad del técnico

**Para el técnico**
- Nueva sección **"Invitaciones"** en su dashboard (reemplaza el catálogo de casos)
- Recibe invitaciones de la plataforma — no busca casos por sí solo
- Cada invitación muestra: tipo de restauración, complejidad, material, urgencia, plazo límite para cotizar
- **No recibe:** nombre del dentista, archivos STL, identidad de otros técnicos invitados
- Responde con: precio propuesto + días de entrega + nota opcional (máx 200 chars)
- Los archivos STL solo se desbloquean si es seleccionado **y** el dentista acepta la propuesta

**Motor interno — la Caja Negra (invisible para ambos actores)**
- Clasifica el caso por complejidad y tipo de servicio automáticamente
- Filtra el pool de técnicos elegibles (disponibilidad, nivel, cooldowns, inactividad, sub-perfil)
- Calcula un score ponderado: calidad histórica, puntualidad, experiencia, carga reciente, bono de equidad
- Selecciona N técnicos mediante sorteo probabilístico (no siempre los mejores — por diseño anti-optimización)
- Evalúa las cotizaciones recibidas al vencer el plazo
- Construye la propuesta final para el dentista con el margen de la plataforma incluido

**Para el administrador**
- Panel de parámetros del algoritmo con sliders (los 5 pesos α₁–α₅, ventanas temporales, N técnicos, fees)
- Validación en tiempo real de que los pesos α suman exactamente 1
- Log inmutable de todos los cambios de parámetros (quién, cuándo, valor anterior vs. nuevo)
- Gestión de ligas por técnico (ver y ajustar manualmente con auditoría)
- Histograma de distribución de invitaciones — alerta automática si hay concentración excesiva
- Simulador: dado un tipo de caso, muestra qué técnicos serían invitados con los parámetros actuales vs. propuestos (sin ejecutar el proceso real)
- Panel de cotizaciones: tasa de respuesta, casos sin cotizaciones, técnicos en revisión de disponibilidad

**En el perfil del técnico**
- Matriz de competencias: 15 tipos de trabajo × nivel diseño + nivel fabricación (escala 1-7 por celda)
- Sub-perfil: solo diseño / solo fabricación / integral
- Toggle de disponibilidad (si desactiva, sale del pool automáticamente)
- Liga calculada automáticamente según niveles declarados (bronce/plata/oro/élite)

### 2.3 Lo que SE MANTIENE intacto

| Pieza | Estado |
|---|---|
| Ciclo iterativo de diseño (técnico sube versión → dentista aprueba o pide cambios) | Sin tocar |
| Fase de fabricación y despacho con número de seguimiento | Sin tocar |
| Sistema de calificaciones (1-5 al finalizar) | Sin tocar — es entrada crítica para el algoritmo Q |
| Visor 3D con anotaciones ancladas en coordenadas 3D | Sin tocar |
| Motor de eventos UCH (`logCaseEvent`) | Sin tocar |
| Upload de archivos a GCS con URLs firmadas | Sin tocar |
| Autenticación, roles, impersonación de admin | Sin tocar |
| Gestión de organizaciones por RUT | Sin tocar |
| Panel de administración base (usuarios, bloqueo, purga) | Sin tocar |
| Wizard de creación de caso | Cambio mínimo: solo el botón final |
| Sistema de notificaciones (stub) | Se extiende con nuevos tipos de evento |

---

## 3. Mapa de decisiones por pieza del sistema

### Reutilizar sin cambios
| Pieza | Archivo(s) |
|---|---|
| Sistema de autenticación + impersonación | `auth.ts`, `auth.config.ts`, `impersonation.ts` |
| Ciclo iterativo de diseño completo | `submitReviewAction`, `approveWorkAction`, `requestRevisionAction` |
| Fase de fabricación y despacho | `transitionToManufacturingAction`, `registerDispatchAction`, `confirmReceptionAction` |
| Flujo bilateral de pausa y cancelación | `requestFlowChangeAction`, `resolveFlowRequestAction`, `resumeWorkAction` |
| Visor 3D con anotaciones | `DentalViewer3D.tsx`, `annotations.ts` |
| Upload de archivos a GCS | `gcs.ts`, `gcp-storage.ts`, `files.ts` |
| Motor de eventos UCH (`logCaseEvent`) | `cases.ts:17` |
| Sistema de calificaciones | tabla `review`, `submitUserRatingAction` |
| Wizard de creación de caso | `CaseCreationWizard.tsx` (solo cambiar botón final) |
| Panel de administración base | `admin/page.tsx`, `admin.ts` |
| `ToastContext`, `Button`, `FocusTrap`, `StatusBadge` | `components/ui/` |

### Modificar
| Pieza | Qué cambia |
|---|---|
| `user` table | Agregar 8 campos del técnico para el algoritmo (ver S0-1) |
| `clinical_case` table | Agregar `complexity_level`, `service_type`, `current_proposal_id` (ver S0-2) |
| `CASE_STATUSES` en `dental.ts` | Nuevos estados del modelo orquestado; eliminar `publicado` del flujo principal |
| `UnifiedCaseHub.tsx` | Eliminar selector de hilos múltiples, eliminar tab "Negociación", adaptar eventos |
| `/dashboard/bids` | Reemplazar con `/dashboard/invitations` (ver Sprint 3) |
| `/dashboard/page.tsx` (dentista) | KPIs con nuevos estados del caso |
| `dashboard/layout.tsx` | Actualizar ítems de navegación por rol |
| `CaseWorkflowStepper.tsx` | Nuevos 7 pasos del flujo orquestado |
| `listCasesByOrganization` | Filtros adaptados a nuevos estados |
| `notificaciones.ts` | Extender con nuevos tipos de evento de la caja negra |
| `getCaseEventsAction` | Filtrar eventos con flag `adminOnly` |

### Eliminar
| Pieza | Motivo |
|---|---|
| Tabla `bid` | Reemplazada por `quotation_request` + `technician_quotation` |
| Tabla `commercial_round` | Reemplazada por `platform_proposal` |
| `/dashboard/marketplace/page.tsx` | Técnicos ya no navegan casos públicos |
| `/dashboard/bids/page.tsx` | Reemplazada por `/dashboard/invitations` |
| `BidManagerModal.tsx` | No hay más ofertas visibles para el dentista |
| `MarketplaceCaseCard.tsx` | No hay marketplace público |
| `lib/db/actions/bids.ts` | Completo |
| `lib/db/actions/marketplace.ts` | Completo |
| `acceptBidAction`, `withdrawCaseAction`, `republishCaseAction` | Flujo de licitación eliminado |

### Crear nuevo
| Pieza | Descripción |
|---|---|
| Tabla `algorithm_config` | Parámetros α₁–α₅, ventanas, N_invitados, fees configurables |
| Tabla `quotation_request` | Invitación de la plataforma a un técnico para cotizar |
| Tabla `technician_quotation` | Respuesta del técnico a la invitación (precio + plazo + nota) |
| Tabla `platform_proposal` | Propuesta final presentada al dentista (precio con margen, entrega) |
| Tabla `technician_score_log` | Historial de scores calculados (auditoría del algoritmo) |
| `lib/engine/classifier.ts` | Clasificación automática de caso por complejidad y tipo de servicio |
| `lib/engine/filter.ts` | Filtro duro del pool elegible (6 condiciones de exclusión) |
| `lib/engine/scorer.ts` | Cálculo S = α₁Q + α₂P + α₃E − α₄C + α₅B con decaimiento exponencial |
| `lib/engine/selector.ts` | Selección probabilística ponderada sin reemplazo + cuota de piso |
| `lib/engine/evaluator.ts` | Evaluación de cotizaciones y selección de mejor oferta |
| `lib/engine/proposer.ts` | Construcción de propuesta final con margen de plataforma |
| `lib/db/actions/engine.ts` | Orquestador principal de la caja negra |
| `lib/db/actions/quotations.ts` | CRUD de solicitudes y cotizaciones |
| `lib/db/actions/proposals.ts` | CRUD de propuestas al dentista |
| `lib/db/actions/algorithm-config.ts` | Lectura y escritura de parámetros del algoritmo |
| `/dashboard/invitations/page.tsx` | Dashboard del técnico: mis invitaciones + en progreso |
| `components/technician/InvitationCard.tsx` | Tarjeta de invitación con countdown y estado |
| `components/technician/QuotationForm.tsx` | Formulario de cotización del técnico |
| `components/technician/WorkTypeLevelsMatrix.tsx` | Matriz 15 tipos × diseño/fabricación, nivel 1-7 |
| `components/dentist/ProposalCard.tsx` | Tarjeta de propuesta para el dentista (precio, entrega, countdown, aceptar/rechazar) |
| `components/admin/AlgorithmPanel.tsx` | Panel de parámetros del algoritmo con sliders y log |
| `components/admin/EquityPanel.tsx` | Histograma de distribución de invitaciones y alertas |
| `components/admin/AlgorithmSimulator.tsx` | Simulador del algoritmo (no ejecuta proceso real) |
| `components/admin/LeagueManager.tsx` | Gestión de ligas por técnico con ajuste manual |

---

## Sprint 0 — Fundamentos de Base de Datos
**Duración estimada:** 2 semanas  
**Objetivo:** Schema completo listo. No hay cambios de UI. La app sigue funcionando exactamente igual que antes.  
**Dependencias:** Ninguna.

### S0-1 · Extender tabla `user` para datos del técnico

Agregar columnas via migración Drizzle. Todos los campos son nullable para que la migración sea no destructiva sobre los usuarios existentes.

```typescript
// Campos nuevos en la tabla user
work_type_levels: jsonb    // { "corona_anterior": { design: 4, fabrication: 2 }, ... }
sub_profile: text          // 'design' | 'fabrication' | 'integral' | null
is_available: boolean      // default true — si false, sale del pool inmediatamente
league_assignments: jsonb  // { "corona_anterior": "plata", "puente_3": "bronce", ... }
last_invitation_at: timestamp           // para calcular días sin invitación
consecutive_no_responses: integer       // default 0 — penalización acumulativa
is_in_availability_review: boolean      // default false — excluido del pool hasta confirmar disponibilidad
```

### S0-2 · Extender tabla `clinical_case`

```typescript
// Campos nuevos en clinical_case
complexity_level: text         // 'basico' | 'intermedio' | 'avanzado' | 'critico'
service_type: text             // 'design_only' | 'design_fabrication'
current_proposal_id: uuid      // FK → platform_proposal (nullable)
evaluation_started_at: timestamp
```

### S0-3 · Crear tabla `algorithm_config`

```sql
CREATE TABLE algorithm_config (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  key         text UNIQUE NOT NULL,    -- 'alpha_1', 'T_cooldown', 'fee_plataforma_bronce', etc.
  value       double precision NOT NULL,
  description text,
  min_value   double precision,
  max_value   double precision,
  updated_by  text REFERENCES "user"(id) ON DELETE SET NULL,
  updated_at  timestamp with time zone DEFAULT now()
);
```

**Seed inicial con todos los parámetros del documento de caja negra:**

| Clave | Valor inicial | Rango permitido |
|---|---|---|
| `alpha_1` | 0.25 | 0.0 – 0.50 |
| `alpha_2` | 0.20 | 0.0 – 0.50 |
| `alpha_3` | 0.20 | 0.0 – 0.50 |
| `alpha_4` | 0.20 | 0.0 – 0.50 |
| `alpha_5` | 0.15 | 0.0 – 0.50 |
| `W_calidad` | 90 | 30 – 365 |
| `W_carga` | 30 | 7 – 90 |
| `C_max` | 2.0 | 1.0 – 5.0 |
| `D_bono_max` | 30 | 7 – 60 |
| `T_cooldown` | 12 | 1 – 72 |
| `D_inactividad` | 15 | 3 – 30 |
| `N_invitados` | 5 | 3 – 10 |
| `N_piso` | 1 | 0 – 3 |
| `T_cotizacion` | 90 | 30 – 480 |
| `T_propuesta_dentista` | 2 | 1 – 24 |
| `Q_minima_seleccion` | 3.0 | 1.0 – 5.0 |
| `L_calificacion_minima` | 4.2 | 3.5 – 5.0 |
| `L_casos_evaluados` | 10 | 5 – 20 |
| `L_puntualidad_minima` | 0.85 | 0.70 – 1.0 |
| `L_casos_completados` | 15 | 5 – 30 |
| `L_casos_transicion` | 3 | 1 – 5 |
| `L_penalizacion_transicion` | 20 | 5 – 40 |
| `L_calificacion_descenso` | 3.0 | 2.0 – 3.5 |
| `L_dias_descenso` | 60 | 30 – 120 |
| `fee_plataforma_bronce` | 0.30 | 0.05 – 0.60 |
| `fee_plataforma_plata` | 0.28 | 0.05 – 0.60 |
| `fee_plataforma_oro` | 0.25 | 0.05 – 0.60 |
| `fee_plataforma_elite` | 0.22 | 0.05 – 0.60 |

### S0-4 · Crear tabla `quotation_request`

```sql
CREATE TABLE quotation_request (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinical_case_id    uuid NOT NULL REFERENCES clinical_case(id) ON DELETE CASCADE,
  technician_id       text NOT NULL REFERENCES "user"(id),
  status              text NOT NULL DEFAULT 'pending',
                      -- 'pending' | 'responded' | 'expired' | 'cancelled'
  sent_at             timestamp with time zone DEFAULT now(),
  expires_at          timestamp with time zone NOT NULL,
  responded_at        timestamp with time zone,
  score_at_selection  double precision   -- score del técnico en el momento de selección (auditoría)
);

CREATE INDEX qr_clinical_case_idx ON quotation_request(clinical_case_id);
CREATE INDEX qr_technician_idx ON quotation_request(technician_id);
```

### S0-5 · Crear tabla `technician_quotation`

```sql
CREATE TABLE technician_quotation (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  quotation_request_id  uuid NOT NULL REFERENCES quotation_request(id) ON DELETE CASCADE,
  technician_id         text NOT NULL REFERENCES "user"(id),
  price                 double precision NOT NULL,   -- en CLP
  delivery_days         integer NOT NULL,
  note                  text,                        -- máx 200 chars
  is_selected           boolean DEFAULT false,
  created_at            timestamp with time zone DEFAULT now()
);
```

### S0-6 · Crear tabla `platform_proposal`

```sql
CREATE TABLE platform_proposal (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinical_case_id        uuid NOT NULL REFERENCES clinical_case(id) ON DELETE CASCADE,
  technician_quotation_id uuid REFERENCES technician_quotation(id),
  technician_id           text REFERENCES "user"(id),   -- opaco para el dentista
  technician_price        double precision NOT NULL,
  platform_fee            double precision NOT NULL,     -- factor multiplicador (ej. 0.28)
  final_price             double precision NOT NULL,     -- technician_price × (1 + fee)
  delivery_days           integer NOT NULL,
  status                  text NOT NULL DEFAULT 'pending_dentist',
                          -- 'pending_dentist' | 'accepted' | 'rejected' | 'expired'
  presented_at            timestamp with time zone DEFAULT now(),
  expires_at              timestamp with time zone NOT NULL,
  decided_at              timestamp with time zone,
  rejection_motive        text,
  created_at              timestamp with time zone DEFAULT now()
);

CREATE INDEX pp_clinical_case_idx ON platform_proposal(clinical_case_id);
```

### S0-7 · Crear tabla `technician_score_log`

```sql
CREATE TABLE technician_score_log (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  technician_id     text NOT NULL REFERENCES "user"(id),
  clinical_case_id  uuid REFERENCES clinical_case(id),
  q_score           double precision,   -- Calidad histórica
  p_score           double precision,   -- Puntualidad
  e_score           double precision,   -- Experiencia en tipo
  c_index           double precision,   -- Índice de carga reciente
  b_bonus           double precision,   -- Bono de infrautilización
  total_score       double precision,
  was_selected      boolean DEFAULT false,
  calculated_at     timestamp with time zone DEFAULT now()
);

CREATE INDEX tsl_technician_idx ON technician_score_log(technician_id);
```

### S0-8 · Actualizar `CASE_STATUSES` en `dental.ts`

```typescript
export const CASE_STATUSES = {
  BORRADOR: 'borrador',
  EN_EVALUACION: 'enEvaluacion',       // nuevo — reemplaza PUBLICADO en el flujo principal
  PROPUESTA_LISTA: 'propuestaLista',   // nuevo
  PROPUESTA_RECHAZADA: 'propuestaRechazada', // nuevo
  SIN_COTIZACIONES_FALLO: 'sinCotizacionesFallo', // nuevo — fallo del motor
  ACEPTADO: 'aceptado',               // semántica nueva: dentista aceptó propuesta de plataforma
  EN_PROGRESO: 'enProgreso',
  EN_REVISION: 'enRevision',
  FABRICACION: 'fabricacion',
  PAUSADO: 'pausado',
  DESPACHADO: 'despachado',
  TERMINADO: 'terminado',
  COMPLETADO: 'completado',
  CANCELADO: 'cancelado',
  // Mantenidos por compatibilidad hasta Sprint 8:
  PUBLICADO: 'publicado',             // deprecated — eliminar en Sprint 8
} as const;
```

### S0-9 · Generar y ejecutar migración Drizzle

```bash
npx drizzle-kit generate   # genera SQL
# revisar el SQL generado antes de ejecutar
npx drizzle-kit migrate
```

Verificar que todos los usuarios existentes pueden hacer login y sus datos son correctos.

### S0-10 · Actualizar relaciones en `schema.ts`

Agregar relaciones Drizzle para las 4 nuevas tablas (`quotation_request`, `technician_quotation`, `platform_proposal`, `technician_score_log`) conectándolas con `clinical_case` y `user`.

---

## Sprint 1 — Perfil del Técnico: Competencias y Disponibilidad
**Duración estimada:** 2 semanas  
**Objetivo:** El técnico puede declarar sus niveles de competencia, sub-perfil y disponibilidad. Los técnicos existentes pueden completar sus nuevos datos. El algoritmo aún no usa estos datos — el motor llega en Sprint 4.  
**Dependencias:** Sprint 0 completo.

### S1-1 · Nuevas constantes en `dental.ts`

```typescript
export const WORK_TYPES = [
  { key: 'corona_anterior',  label: 'Corona unitaria anterior' },
  { key: 'corona_posterior', label: 'Corona unitaria posterior' },
  { key: 'corona_implante',  label: 'Corona sobre implante unitaria' },
  { key: 'inlay_onlay',      label: 'Inlay / Onlay' },
  { key: 'carilla_unitaria', label: 'Carilla unitaria' },
  { key: 'carillas_multiples',label: 'Carillas múltiples (hasta 4)' },
  { key: 'puente_3',         label: 'Puente 3 unidades' },
  { key: 'puente_4_plus',    label: 'Puente 4 o más unidades' },
  { key: 'full_arch',        label: 'Full arch / rehabilitación completa' },
  { key: 'protesis_parcial', label: 'Prótesis parcial removible' },
  { key: 'protesis_total',   label: 'Prótesis total' },
  { key: 'sobredentadura',   label: 'Sobredentadura sobre implantes' },
  { key: 'barra_implantes',  label: 'Barra sobre implantes' },
  { key: 'guia_simple',      label: 'Guía quirúrgica simple' },
  { key: 'guia_compleja',    label: 'Guía quirúrgica compleja (múltiples implantes)' },
] as const;

export const SUB_PROFILES = {
  DESIGN:      'design',      // solo diseño CAD
  FABRICATION: 'fabrication', // solo fabricación
  INTEGRAL:    'integral',    // diseño + fabricación
} as const;

export const LEAGUES = {
  BRONCE: 'bronce',  // niveles 1-2
  PLATA:  'plata',   // niveles 3-4
  ORO:    'oro',     // niveles 5-6
  ELITE:  'elite',   // nivel 7
} as const;
```

### S1-2 · Componente `WorkTypeLevelsMatrix.tsx`

- Grid de 15 filas (tipos de trabajo) × 3 columnas (tipo de trabajo | nivel diseño | nivel fabricación)
- Cada celda de nivel: select o slider 0-7
- Si `sub_profile = 'design'`: columna fabricación bloqueada visualmente (gris, valor forzado a 0)
- Si `sub_profile = 'fabrication'`: columna diseño bloqueada
- Si `sub_profile = 'integral'`: ambas columnas habilitadas
- Tooltip en cada tipo de trabajo con ejemplos clínicos del tipo
- Resumen al pie: "Liga estimada por tipo de trabajo" calculada al vuelo

### S1-3 · Sección de competencias en `/dashboard/profile`

- Nueva sección colapsable "Competencias técnicas", visible solo para `role === 'tecnico'`
- Subsecciones:
  1. **Sub-perfil de trabajo:** radio buttons (Solo diseño / Solo fabricación / Diseño + Fabricación)
  2. **Matriz de niveles:** componente `WorkTypeLevelsMatrix`
  3. **Disponibilidad:** toggle "Disponible para recibir invitaciones"
- Server Action `updateTechnicianProfileAction(data)`:
  - Guarda `sub_profile`, `work_type_levels` (JSONB), `is_available`
  - Recalcula `league_assignments` automáticamente al guardar (ver S1-6)
- Banner de alerta si el técnico no ha completado su perfil: _"Completa tu perfil de competencias para comenzar a recibir invitaciones de casos."_

### S1-4 · Toggle de disponibilidad standalone

- Switch prominente en la parte superior del dashboard del técnico
- Texto: "Disponible para nuevos casos" / "No disponible"
- Server Action `setTechnicianAvailabilityAction(available: boolean)`
- Si `is_available = false`: badge visual en el perfil indicando que está inactivo

### S1-5 · Script de inicialización de técnicos existentes

Ejecutar manualmente una sola vez post-migración:
- Para cada técnico existente: asignar `sub_profile = null`, `work_type_levels = {}`, `is_available = true`
- Enviar notificación (o marcar banner): _"Actualiza tu perfil para seguir recibiendo trabajo."_

### S1-6 · Módulo de cálculo de liga `lib/engine/leagues.ts`

```typescript
function computeLeagueForLevel(level: number): League {
  if (level <= 0) return null;       // sin nivel declarado = no elegible
  if (level <= 2) return 'bronce';
  if (level <= 4) return 'plata';
  if (level <= 6) return 'oro';
  return 'elite';
}

function computeAllLeagues(workTypeLevels: WorkTypeLevels, subProfile: SubProfile): LeagueAssignments {
  // Para cada tipo de trabajo, toma el nivel relevante según sub-perfil
  // y calcula la liga correspondiente
}
```

Al guardar el perfil, `updateTechnicianProfileAction` llama a esta función y persiste el resultado en `user.league_assignments`.

### S1-7 · Agregar selección de sub-perfil al onboarding de registro del técnico

- En `/auth/register/page.tsx`, el paso del técnico que define capacidades técnicas pasa a preguntar también: **sub-perfil de trabajo** (radio buttons)
- El campo `organization.technical_capabilities` sigue almacenando las capacidades a nivel de organización; el nuevo campo `user.sub_profile` almacena el sub-perfil del técnico individual

---

## Sprint 2 — Flujo del Dentista: Del Borrador a "En Evaluación"
**Duración estimada:** 2 semanas  
**Objetivo:** El dentista puede crear un caso y enviarlo a evaluación. Ve la pantalla de espera y, cuando llega la propuesta (vía stub), puede aceptarla o rechazarla. La Caja Negra aún no existe — un stub genera una propuesta ficticia para poder desarrollar y testear la UI.  
**Dependencias:** Sprint 0.  
**Pueden ir en paralelo con Sprint 1.**

### S2-1 · Modificar `CaseCreationWizard.tsx`

- Cambiar el botón final "Publicar al marketplace" → **"Enviar para evaluación"**
- El modal de confirmación cambia su texto: en lugar de "Publicar", muestra _"Tu caso será enviado a evaluación. La plataforma seleccionará un técnico y te enviará una propuesta de tiempo y costo."_
- Al confirmar, llama a `submitCaseForEvaluationAction(caseId)`
- Eliminar toda mención a "marketplace", "licitación" y "publicar" del componente

### S2-2 · Server Action `submitCaseForEvaluationAction(caseId)`

```typescript
// Guards: solo dentista propietario; caso debe estar en 'borrador'
// Efectos:
1. Calcular complexity_level y service_type (mapa hardcodeado por ahora — motor real llega en S4-1)
2. UPDATE clinical_case SET {
     status = 'enEvaluacion',
     complexity_level = ...,
     service_type = ...,
     evaluation_started_at = now()
   }
3. logCaseEvent({ type: 'sistema', action: 'CASO_ENVIADO_EVALUACION',
                  content: 'El caso fue enviado a evaluación. Buscando técnico disponible.',
                  stateChange: { from: 'borrador', to: 'enEvaluacion' } })
4. triggerBlackBoxStub(caseId)  // reemplazado por motor real en Sprint 4
```

### S2-3 · Stub `triggerBlackBoxStub(caseId)` — solo para desarrollo

```typescript
// lib/engine/stub.ts
// Genera una propuesta ficticia para poder desarrollar la UI sin el motor real
// ELIMINAR en Sprint 5 cuando se active evaluateAndPropose()

async function triggerBlackBoxStub(caseId: string) {
  // Esperar 3 segundos para simular procesamiento asíncrono
  await delay(3000);

  const price = Math.floor(Math.random() * (450000 - 120000) + 120000);
  const deliveryDays = Math.floor(Math.random() * 5) + 3;
  const fee = 0.28;

  // Crear proposal ficticia
  await db.insert(platformProposal).values({
    clinicalCaseId: caseId,
    technicianPrice: price,
    platformFee: fee,
    finalPrice: Math.round(price * (1 + fee)),
    deliveryDays,
    status: 'pending_dentist',
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 horas
  });

  await db.update(clinicalCase)
    .set({ status: 'propuestaLista' })
    .where(eq(clinicalCase.id, caseId));

  await logCaseEvent({ action: 'PROPUESTA_GENERADA', ... });
}
```

### S2-4 · Pantalla de estado "En Evaluación" en vista de caso

En `/dashboard/cases/[id]`, cuando `status = 'enEvaluacion'`:
- Banner prominente: _"Estamos analizando tu caso. Recibirás una propuesta en breve."_
- Indicador de progreso animado (spinner o barra pulsante)
- El stepper muestra el paso "En Evaluación" activo

### S2-5 · Componente `ProposalCard.tsx`

Visible cuando `status = 'propuestaLista'` en la vista del caso del dentista.

Muestra:
- Tipo de trabajo y nivel de complejidad
- **Tiempo de entrega estimado** (ej. "5 días hábiles")
- **Precio total** (ej. "$412.800 IVA incluido") — sin desglose de margen ni identidad del técnico
- Countdown visual del tiempo de validez restante (`expires_at - now()`)

Acciones:
- Botón primario **"Aceptar propuesta"** → abre `ModalAceptacion`
- Botón texto/destructivo **"Rechazar"** → abre `ModalRechazo`

`ModalAceptacion`:
- Resumen de lo aceptado (precio + entrega)
- Texto: _"Al aceptar, el trabajo comenzará inmediatamente. No podrás cambiar el técnico asignado."_
- Botón confirmar → llama a `acceptProposalAction`

`ModalRechazo`:
- Campo de texto opcional: "¿Por qué rechazas la propuesta?"
- Botón confirmar → llama a `rejectProposalAction`

### S2-6 · Server Action `acceptProposalAction(caseId, proposalId)`

```typescript
// Guards: dentista propietario del caso; proposal status = 'pending_dentist'; no expirada
// Efectos (transacción):
1. UPDATE platform_proposal SET { status: 'accepted', decided_at: now() }
2. UPDATE clinical_case SET {
     status: 'aceptado',
     assignedTechnicianId: proposal.technician_id,
     assignedAt: now(),
     currentResponsibility: 'tecnico',
     current_proposal_id: proposalId
   }
3. Desbloquear acceso GCS del técnico al caso (actualizar control de acceso, ver S5-6)
4. UPDATE quotation_request SET status = 'responded' (el del técnico seleccionado)
5. UPDATE quotation_request SET status = 'cancelled' (los demás del caso)
6. notifyUser(proposal.technician_id, 'PROPUESTA_ACEPTADA', { caseId })
7. logCaseEvent({ action: 'PROPUESTA_ACEPTADA',
                  stateChange: { from: 'propuestaLista', to: 'aceptado' } })
```

### S2-7 · Server Action `rejectProposalAction(caseId, proposalId, motive?)`

```typescript
// Guards: dentista propietario; proposal status = 'pending_dentist'
// Efectos (transacción):
1. UPDATE platform_proposal SET { status: 'rejected', decided_at: now(), rejection_motive: motive }
2. UPDATE quotation_request SET status = 'cancelled' (todos los del caso)
3. UPDATE clinical_case SET { status: 'propuestaRechazada', current_proposal_id: null }
4. logCaseEvent({ action: 'PROPUESTA_RECHAZADA',
                  stateChange: { from: 'propuestaLista', to: 'propuestaRechazada' } })
```

### S2-8 · Adaptar `CaseWorkflowStepper.tsx`

Nuevos 7 pasos para el modelo orquestado:

```
Borrador → En Evaluación → Propuesta → En Ejecución → Revisión → Fabricación → Completado
```

- "En Evaluación": ícono de reloj/procesamiento, animación de pulso
- "Propuesta": ícono de sobre/documento, se resalta con badge cuando hay propuesta esperando
- Los pasos post-adjudicación son idénticos al flujo actual

### S2-9 · Actualizar `StatusBadge.tsx`

| Estado | Label | Color |
|---|---|---|
| `enEvaluacion` | En evaluación | Azul/slate pulsante |
| `propuestaLista` | Propuesta lista | Ámbar — requiere acción |
| `propuestaRechazada` | Propuesta rechazada | Rojo suave |
| `sinCotizacionesFallo` | Sin disponibilidad | Rojo intenso |

### S2-10 · Actualizar dashboard del dentista `/dashboard/page.tsx`

Reemplazar KPIs de "publicados" y "en licitación" por:
- "En evaluación" (contador de casos en `enEvaluacion`)
- "Propuesta pendiente" (contador de casos en `propuestaLista`) — con badge de alerta si > 0

---

## Sprint 3 — Interface del Técnico: Invitaciones y Cotizaciones
**Duración estimada:** 2 semanas  
**Objetivo:** El técnico ya no navega el marketplace. Tiene una nueva sección "Invitaciones" desde donde recibe y responde solicitudes de cotización. El motor real llega en Sprint 4 — por ahora las invitaciones pueden crearse manualmente desde el admin para probar la UI.  
**Dependencias:** Sprint 0, Sprint 1.

### S3-1 · Nueva ruta `/dashboard/invitations`

Reemplaza `/dashboard/bids` como ruta principal del técnico.

En `dashboard/layout.tsx`:
- Cambiar el ítem de menú "Catálogo de Casos" → **"Invitaciones"** con `href='/dashboard/invitations'`
- Badge numérico en el ítem: cuenta de `quotation_request` con `status='pending'` del técnico

Dos tabs en la página:
1. **Invitaciones** — solicitudes recibidas (pendientes + historial)
2. **En Progreso** — casos asignados activos

### S3-2 · Server Action `getMyInvitationsAction()`

```typescript
// Guard: solo técnico autenticado
// Devuelve: quotation_request del técnico con info del caso
// NO incluye: nombre del dentista, archivos, precio de otros técnicos

return db.select({
  requestId: quotationRequest.id,
  status: quotationRequest.status,
  sentAt: quotationRequest.sentAt,
  expiresAt: quotationRequest.expiresAt,
  respondedAt: quotationRequest.respondedAt,
  // Del caso (sin datos del dentista):
  caseId: clinicalCase.id,
  caseNumber: clinicalCase.caseNumber,
  restorationType: clinicalCase.restorationType,
  complexityLevel: clinicalCase.complexityLevel,
  serviceType: clinicalCase.serviceType,
  material: clinicalCase.material,
  urgency: clinicalCase.urgency,
  // Si ya respondió:
  myQuotation: technician_quotation (join nullable),
})
.from(quotationRequest)
.leftJoin(clinicalCase, ...)
.leftJoin(technicianQuotation, ...)
.where(eq(quotationRequest.technicianId, identity.id))
.orderBy(desc(quotationRequest.sentAt));
```

### S3-3 · Componente `InvitationCard.tsx`

Tarjeta por cada invitación recibida. Muestra:
- Badge de complejidad (color por nivel: básico=verde, intermedio=ámbar, avanzado=naranja, crítico=rojo)
- Tipo de restauración y material
- Urgencia del caso
- Plazo máximo de entrega esperado por la plataforma
- **Countdown hasta expiración** (en tiempo real si está pendiente)
- Estado: "Pendiente de cotización" / "Cotización enviada" / "Expirada" / "Cancelada"

Si estado es "Pendiente":
- Botón **"Enviar cotización"** → abre `QuotationForm` en modal o panel lateral
- Botón secundario **"No puedo atender"** → declina sin penalización (solo disponible en primeras horas)

### S3-4 · Componente `QuotationForm.tsx`

Modal con:
- **Precio propuesto** (input numérico en CLP, con formato automático de miles)
- **Plazo de entrega** (select: 1, 2, 3, 5, 7, 10, 15, 20, 30 días hábiles)
- **Nota técnica** (textarea opcional, máx 200 chars con contador regresivo)
- Resumen visible del caso al que se cotiza (tipo, material, urgencia)
- Countdown prominente hasta vencimiento de la invitación
- Botón **"Enviar cotización"** y "Cancelar"

### S3-5 · Server Action `submitTechnicianQuotationAction(requestId, data)`

```typescript
// Guards: técnico dueño de la quotation_request;
//         request.status = 'pending'; request.expires_at > now()
// Efectos:
1. INSERT INTO technician_quotation { price, delivery_days, note }
2. UPDATE quotation_request SET { status: 'responded', responded_at: now() }
3. INSERT INTO audit_log { action: 'COTIZACION_ENVIADA', payload: { requestId, price, deliveryDays } }
```

### S3-6 · Tab "En Progreso" del técnico

Reutiliza la lógica existente de `listTechnicianAssignedCases()`.

Muestra casos donde `assignedTechnicianId = identity.id` y `status` en:
`['aceptado', 'enProgreso', 'enRevision', 'fabricacion', 'despachado']`

Cada tarjeta muestra: número de caso, tipo de restauración, estado actual, última actividad, badge de "turno" si `currentResponsibility = 'tecnico'`.

### S3-7 · Notificaciones de invitación

Cuando el motor crea una `quotation_request`:
```typescript
notifyUser(technicianId, 'NUEVA_INVITACION', {
  caseId,
  expiresAt,
  restorationType,
  urgency,
})
```
El stub actual ya absorbe esta llamada sin enviar nada. Cuando se implementen notificaciones reales (email/push), solo hay que rellenar el stub.

### S3-8 · Deprecación de `/dashboard/marketplace`

- Agregar redirect: `/dashboard/marketplace` → `/dashboard/invitations`
- Mostrar mensaje al redireccionar: _"El marketplace ha sido reemplazado por el sistema de invitaciones directas."_

### S3-9 · Acción de creación manual de invitación desde Admin (temporal, para testing)

En el panel de admin, agregar opción de prueba: seleccionar un caso en `enEvaluacion` y un técnico → crear `quotation_request` manualmente. Esto permite probar la UI del técnico antes de que el motor real exista (Sprint 4).

---

## Sprint 4 — Motor de Caja Negra: Clasificación y Selección
**Duración estimada:** 3 semanas  
**Objetivo:** El motor real puede recibir un caso, clasificarlo, filtrar el pool elegible y enviar invitaciones a los técnicos seleccionados mediante el algoritmo de selección ponderada.  
**Dependencias:** Sprint 0, Sprint 1, Sprint 2, Sprint 3.

### S4-1 · `lib/engine/classifier.ts`

```typescript
export function classifyCase(data: ClinicalCaseData): {
  complexity_level: ComplexityLevel,
  service_type: ServiceType,
  required_work_type: WorkType
}

// Mapa restorationType → complexity_level:
const COMPLEXITY_MAP: Record<RestorationType, ComplexityLevel> = {
  'Corona Unitaria': 'basico',
  'Inlay': 'basico',
  'Onlay': 'basico',
  'Carilla': 'basico',           // unitaria
  'Puente': 'intermedio',        // 3 unidades (por defecto)
  'Corona sobre implante': 'intermedio',
  'Denture': 'avanzado',
  'Guía Quirúrgica': 'avanzado', // simple → intermedio, compleja → critico
  'Otro': 'intermedio',          // fallback conservador
};

// service_type:
// 'design_only' si needsFabrication = false
// 'design_fabrication' si needsFabrication = true
```

Guarda los valores calculados en `clinical_case.complexity_level` y `clinical_case.service_type`.

### S4-2 · `lib/engine/filter.ts`

```typescript
export async function getEligiblePool(
  caseData: ClinicalCaseData,
  config: AlgorithmConfig
): Promise<User[]>

// Consulta SQL que excluye técnicos según:
// 1. is_available = false
// 2. is_in_availability_review = true
// 3. Nivel en el tipo de trabajo < nivel mínimo para la complejidad del caso
//    (Básico → nivel ≥ 1, Intermedio → nivel ≥ 3, Avanzado → nivel ≥ 5, Crítico → nivel ≥ 7)
// 4. Sub-perfil incompatible:
//    - caso service_type = 'design_fabrication' y técnico sub_profile = 'design' → excluir
//    - caso service_type = 'design_only' y técnico sub_profile = 'fabrication' → excluir
// 5. Cooldown: tiene quotation_request para el mismo tipo de caso
//    en los últimos T_cooldown horas con status IN ('pending', 'responded')
// 6. Inactividad: user.updatedAt < now() - D_inactividad days
```

### S4-3 · `lib/engine/scorer.ts`

```typescript
export async function calculateScore(
  technician: User,
  caseData: ClinicalCaseData,
  config: AlgorithmConfig
): Promise<ScoreBreakdown>

// Q — Calidad histórica con decaimiento exponencial
// Promedio ponderado de review.rating en ventana W_calidad días
// w_i = exp(-lambda * (now - review.createdAt).days)
// Q = Σ(w_i × rating_i) / Σ(w_i), normalizado a [0,1] sobre escala 5

// P — Puntualidad
// Casos donde completedAt <= assignedAt + deliveryDays * 86400s
// P = casos_en_plazo / total_casos_completados (0 si no hay casos)

// E — Experiencia en tipo
// E = work_type_levels[required_work_type][relevant_sub_type] / 7

// C — Índice de carga reciente
// invitations_last_W_carga_days = COUNT(quotation_request WHERE sent_at > now()-W_carga)
// league_avg = AVG del mismo COUNT para técnicos de la misma liga
// C = min(invitations_last_W_carga_days / league_avg, C_max)

// B — Bono de infrautilización
// B = min(days_since_last_invitation / D_bono_max, 1.0)

// TOTAL: S = α₁Q + α₂P + α₃E - α₄C + α₅B

// Persiste en technician_score_log para auditoría
```

### S4-4 · `lib/engine/selector.ts`

```typescript
export async function selectTechnicians(
  eligiblePool: User[],
  caseData: ClinicalCaseData,
  config: AlgorithmConfig
): Promise<User[]>

// 1. Calcular score de cada técnico del pool (llamar scorer.ts)
// 2. Selección probabilística ponderada:
//    P_i = S_i / Σ(S_j)
//    Sorteo sin reemplazo de N_invitados técnicos
// 3. Cuota de piso (N_piso):
//    Si ningún técnico del cuartil inferior de score quedó seleccionado:
//    → reemplazar al técnico de menor score del resultado por el mejor del cuartil inferior
// 4. Penalización de transición de liga:
//    Si técnico está en período de transición:
//    → aplicar reducción de L_penalizacion_transicion% al score antes del sorteo
```

### S4-5 · `lib/db/actions/engine.ts` — Orquestador principal

```typescript
export async function triggerBlackBoxAction(caseId: string): Promise<void>

// Flujo completo:
1. Leer caso de DB, validar que está en 'enEvaluacion'
2. Clasificar caso → classifier.ts
3. Filtrar pool → filter.ts
4. Si pool.length < N_invitados:
   a. Intentar con liga inferior (bajar un nivel en los requisitos)
   b. Si sigue sin pool suficiente:
      → UPDATE clinical_case SET status = 'sinCotizacionesFallo'
      → notifyUser(adminId, 'POOL_VACIO', { caseId })
      → notifyUser(doctorId, 'EVALUACION_DEMORADA', { caseId })
      → return
5. Seleccionar técnicos → selector.ts
6. Para cada técnico seleccionado:
   → INSERT quotation_request {
       clinical_case_id, technician_id,
       status: 'pending',
       sent_at: now(),
       expires_at: now() + T_cotizacion (minutos),
       score_at_selection: score calculado
     }
   → notifyUser(technicianId, 'NUEVA_INVITACION', { caseId })
   → UPDATE user SET last_invitation_at = now()
7. logCaseEvent({ action: 'COTIZACIONES_ABIERTAS', payload: { adminOnly: true, n_invited } })
```

### S4-6 · Reemplazar stub en `submitCaseForEvaluationAction`

Cambiar `triggerBlackBoxStub(caseId)` → `triggerBlackBoxAction(caseId)`.

A partir de aquí, el motor real se activa al enviar cualquier caso.

### S4-7 · Lógica de penalización por no responder

Job / función que corre al vencer `T_cotizacion` (ver mecanismo de ejecución en S5-3):

```typescript
// Para cada quotation_request con status='pending' y expires_at < now():
1. UPDATE quotation_request SET status = 'expired'
2. UPDATE user SET consecutive_no_responses = consecutive_no_responses + 1
3. Si consecutive_no_responses >= 3:
   → UPDATE user SET is_in_availability_review = true
   → notifyUser(technicianId, 'REVISION_DISPONIBILIDAD', { caseId })
   // El técnico debe confirmar disponibilidad manualmente para volver al pool
```

### S4-8 · Tests unitarios del motor

Archivo: `test/engine.test.ts`

- `classifier.ts`: todos los 15 tipos de restauración clasifican correctamente en complejidad
- `filter.ts`: cada una de las 6 condiciones de exclusión funciona de forma independiente
- `scorer.ts`: fórmula con valores conocidos produce resultados esperados (test numérico)
- `selector.ts`: distribución de probabilidades es correcta; cuota de piso garantiza inclusión del cuartil inferior
- `engine.ts`: flujo completo con datos de prueba — crea las `quotation_request` esperadas

---

## Sprint 5 — Motor de Caja Negra: Evaluación y Propuesta al Dentista
**Duración estimada:** 2 semanas  
**Objetivo:** Cuando vence el plazo de cotización, el sistema selecciona la mejor oferta, construye la propuesta final con el margen de la plataforma y la presenta al dentista. El stub del Sprint 2 queda eliminado.  
**Dependencias:** Sprint 4.

### S5-1 · `lib/engine/evaluator.ts`

```typescript
export function evaluateBestOffer(
  quotations: TechnicianQuotation[],
  config: AlgorithmConfig
): TechnicianQuotation | null

// Criterio de selección:
// 1. Calcular promedio de delivery_days de todas las cotizaciones recibidas
// 2. Filtrar cotizaciones con delivery_days <= promedio
// 3. De las filtradas: seleccionar la de menor precio
// 4. Desempate en precio y plazo iguales: técnico con user.createdAt más antiguo (FIFO)
// 5. Si el técnico de la mejor oferta tiene rating promedio < Q_minima_seleccion:
//    → retornar null (requiere revisión manual del admin)
```

### S5-2 · `lib/engine/proposer.ts`

```typescript
export function buildProposal(
  bestOffer: TechnicianQuotation,
  caseData: ClinicalCaseData,
  config: AlgorithmConfig
): PlatformProposalData

// Calcular fee según liga del técnico:
// fee = config[`fee_plataforma_${technicianLeague}`]

// final_price = bestOffer.price × (1 + fee)
// expires_at = now() + T_propuesta_dentista (horas)
```

### S5-3 · Mecanismo de ejecución al vencer `T_cotizacion`

**Opción A (implementar ahora) — Evaluación lazy:**

Al cargar la vista del caso del dentista, si `status = 'enEvaluacion'` y `evaluation_started_at + T_cotizacion * 60s < now()`:
- Disparar `evaluateAndPropose(caseId)` antes de renderizar
- Mostrar spinner mientras se procesa

**Opción B (preparar, no activar) — Endpoint externo:**

```typescript
// /api/engine/evaluate/route.ts
// POST con header 'x-engine-secret' = process.env.ENGINE_SECRET
// Útil para Vercel Cron o Cloud Scheduler
// Dejar documentado pero deshabilitado hasta Sprint 8
```

### S5-4 · Server Action `evaluateAndPropose(caseId)`

```typescript
// Verificar que T_cotizacion ya venció o todas las requests están cerradas
// Recopilar todas las technician_quotation del caso
// Si no hay cotizaciones suficientes (< 1 que cumpla calidad mínima):
//   → notifyUser(adminId, 'SIN_COTIZACIONES_VALIDAS', { caseId })
//   → UPDATE clinical_case SET status = 'sinCotizacionesFallo'
//   → notifyUser(doctorId, 'EVALUACION_DEMORADA', { ... })
//   → return

// Llamar evaluator.ts → proposer.ts
// INSERT INTO platform_proposal { ... status: 'pending_dentist' }
// UPDATE technician_quotation SET is_selected = true (el ganador)
// Marcar quotation_request del ganador como reservado (técnico preseleccionado)
// UPDATE quotation_request de los demás → status: 'cancelled'
// UPDATE clinical_case SET {
//   status: 'propuestaLista',
//   current_proposal_id: newProposal.id
// }
// notifyUser(doctorId, 'PROPUESTA_LISTA', { caseId, proposalId })
// logCaseEvent({ action: 'PROPUESTA_GENERADA', payload: { adminOnly: true } })
// logCaseEvent({ action: 'PROPUESTA_PRESENTADA' })
```

### S5-5 · Lógica de expiración de propuesta

Al cargar la vista del dentista, si `platform_proposal.expires_at < now()` y `status = 'pending_dentist'`:

```typescript
// UPDATE platform_proposal SET status = 'expired'
// Liberar técnico preseleccionado:
// UPDATE quotation_request SET status = 'cancelled' (el del técnico seleccionado)
// UPDATE user SET consecutive_no_responses = 0 (no es culpa del técnico)
// Opciones:
// A. Reintentar el proceso completo desde triggerBlackBoxAction (si hay pool disponible)
// B. UPDATE clinical_case SET status = 'sinCotizacionesFallo' + notificar admin
// Implementar opción B ahora, A en iteración futura
```

### S5-6 · Desbloqueo de archivos STL al aceptar propuesta

En `acceptProposalAction` (definida en S2-6), agregar:

```typescript
// Agregar entrada en audit_log que el sistema de control de acceso GCS verificará:
// La función getSignedUrlAction ya tiene lógica para verificar si el técnico está asignado al caso
// Al asignar assignedTechnicianId, el acceso se habilita automáticamente por la regla:
// "Si técnico Y archivo en caso asignado a él → acceso"
// Verificar que esta regla está activa en gcs.ts — no requiere cambios adicionales
```

### S5-7 · Notificación al técnico preseleccionado al aceptar propuesta

```typescript
notifyUser(proposal.technician_id, 'TRABAJO_CONFIRMADO', {
  caseId,
  message: '¡Tu cotización fue seleccionada! El dentista ha aceptado la propuesta. Puedes revisar el caso e iniciar el trabajo.',
})
```

### S5-8 · Eliminar el stub del Sprint 2

- Eliminar `lib/engine/stub.ts`
- Eliminar import de `triggerBlackBoxStub` en `submitCaseForEvaluationAction`
- Confirmar que `triggerBlackBoxAction` es la única función llamada

### S5-9 · Tests de integración del flujo completo

```
1. Crear 5 técnicos de prueba con distintos perfiles y niveles
2. Crear caso con dentista de prueba
3. submitCaseForEvaluationAction → verificar que se crean N quotation_request
4. Simular respuestas de técnicos (3 de 5 responden)
5. evaluateAndPropose → verificar propuesta creada con precio correcto
6. acceptProposalAction → verificar caso en 'aceptado', técnico asignado
7. Técnico inicia diseño → submitReviewAction → approveWorkAction → 'terminado'
```

---

## Sprint 6 — Panel de Administración: Gestión del Algoritmo
**Duración estimada:** 2 semanas  
**Objetivo:** El administrador puede tunear el algoritmo en tiempo real, ver la distribución de equidad, simular resultados y gestionar ligas.  
**Dependencias:** Sprint 4 (para que haya datos reales). Puede ir en paralelo con Sprint 5.

### S6-1 · Server Actions `lib/db/actions/algorithm-config.ts`

```typescript
// Leer todos los parámetros (con caché de 5 min para el motor):
getAlgorithmConfigAction(): Promise<Record<string, number>>

// Actualizar parámetros (guard: solo admin):
updateAlgorithmConfigAction(updates: Record<string, number>): Promise<ActionResult>
// Validaciones:
// - Cada valor dentro de [min_value, max_value]
// - α₁ + α₂ + α₃ + α₄ + α₅ = 1.0 (± 0.001 tolerancia de flotante)
// Efectos:
// - UPDATE algorithm_config para cada clave
// - INSERT audit_log con valores anteriores y nuevos por cada cambio

// Historial de cambios:
getAlgorithmConfigHistoryAction(): Promise<ConfigChange[]>
// Devuelve últimos 100 cambios con: timestamp, userId, key, old_value, new_value
```

### S6-2 · Componente `AlgorithmPanel.tsx`

Nueva sección en `/dashboard/admin`:

**Subpanel "Pesos del Score":**
- 5 sliders para α₁–α₅ con:
  - Label descriptivo: "Calidad Histórica (α₁)", etc.
  - Rango visual según `min_value` / `max_value` del config
  - Suma en tiempo real: "Total: 0.98 ⚠️" (rojo si ≠ 1) / "Total: 1.00 ✓" (verde)
- Botón "Guardar pesos" — deshabilitado si la suma ≠ 1

**Subpanel "Parámetros operativos":**
- Inputs numéricos para: `W_calidad`, `W_carga`, `C_max`, `D_bono_max`, `T_cooldown`, `D_inactividad`, `N_invitados`, `N_piso`, `T_cotizacion`, `T_propuesta_dentista`
- Botón "Guardar parámetros"

**Subpanel "Log de cambios":**
- Tabla inmutable con: fecha, usuario, parámetro, valor anterior → valor nuevo
- Paginada (últimos 50 cambios visibles)

### S6-3 · Componente `LeagueManager.tsx`

Tabla de todos los técnicos activos con:
- Nombre, email
- Sub-perfil actual
- Liga por tipo de trabajo (resumen: "Oro en 8/15 tipos, Plata en 5/15, Bronce en 2/15")
- Score promedio (últimos 30 días)
- Casos completados total
- Días sin invitación
- Badge si está en `is_in_availability_review`

Acciones por fila:
- **"Ver detalle"** → expande con la liga por cada tipo de trabajo individual
- **"Ajustar liga"** → modal con: tipo de trabajo selector, nueva liga selector, motivo (texto requerido) → guarda en `user.league_assignments` + registra en `audit_log`
- **"Reactivar"** (si `is_in_availability_review = true`) → limpia el flag y notifica al técnico

### S6-4 · Componente `EquityPanel.tsx`

**Histograma de invitaciones:**
- Barras por técnico, ordenadas de mayor a menor
- Selector de período: 30 / 90 / 365 días
- Color por liga (bronce=marrón, plata=gris, oro=dorado, élite=morado)

**Distribución por liga:**
- Pie chart o barras: % de invitaciones captadas por cada liga

**Alerta de concentración:**
- Si top 20% de técnicos por score acapara >60% de invitaciones en los últimos 30 días:
  - Banner rojo: "Concentración alta detectada. Considera aumentar α₄ (Carga) o α₅ (Equidad)."

**Lista de técnicos sin invitaciones:**
- Técnicos activos con 0 invitaciones en los últimos N días (configurable, default 30)
- Botón rápido: "Ver su perfil"

**Métricas de cotización:**
- Tasa de respuesta global (cotizaciones enviadas / invitaciones)
- Tasa de respuesta por liga
- Tiempo promedio de respuesta

### S6-5 · Componente `AlgorithmSimulator.tsx`

- **Inputs:**
  - Tipo de restauración (selector)
  - `needsFabrication` (checkbox)
  - Complejidad calculada automáticamente (label, no editable)
  - Número de técnicos a simular invitar (slider)

- **Dos modos:**
  - "Parámetros actuales" (los guardados en DB)
  - "Parámetros propuestos" (sliders locales que NO guardan en DB)

- **Output:**
  - Tabla con top 15 técnicos del pool elegible
  - Columnas: nombre (anonimizado en producción), Q, P, E, C, B, Score total, Probabilidad de selección (%)
  - Resalta los N técnicos que serían seleccionados con cada configuración
  - Botón "Ejecutar simulación" → llama Server Action que calcula scores sin crear `quotation_request`
  - Nota prominente: _"Esta simulación no envía invitaciones ni afecta el sistema real."_

### S6-6 · Panel de cotizaciones en curso

Tabla de casos en `enEvaluacion`:
- Número de caso, complejidad, tipo
- Invitaciones enviadas / respondidas / expiradas
- Tiempo restante para que venza `T_cotizacion`

Lista de casos en `sinCotizacionesFallo`:
- Motivo (pool vacío / sin respuestas)
- Botón "Reintentar" → dispara `triggerBlackBoxAction` manualmente

### S6-7 · Configuración de fee diferenciado

En `AlgorithmPanel`, nueva subección "Fees de plataforma":
- 4 inputs: fee bronce, plata, oro, élite (en % con 2 decimales)
- Preview: para un precio técnico de $200.000, el precio final sería $X con cada fee
- Botón "Guardar fees"

---

## Sprint 7 — UCH y Flujo Post-adjudicación en el Nuevo Modelo
**Duración estimada:** 2 semanas  
**Objetivo:** El chat y el flujo de trabajo completo (diseño, revisión, fabricación, despacho) funcionan correctamente bajo la nueva lógica de identidad opaca. El sistema de mensajería se preserva.  
**Dependencias:** Sprint 2, Sprint 3, Sprint 5.

### S7-1 · Adaptar `UnifiedCaseHub.tsx`

**Qué se elimina:**
- El selector de hilo por técnico (dropdown "Ver hilo de [técnico]") — ya no hay múltiples técnicos en un caso
- La tab "Negociación" y los eventos asociados
- Los eventos de tipo `OFERTA_RECIBIDA`, `OFERTA_ACEPTADA`, `OFERTA_RECHAZADA`, `OFERTA_RETIRADA` del feed del dentista

**Qué se mantiene sin cambios:**
- Tabs: Todos / Diseño / Producción
- Sección de Adjuntos (entregas versionadas con descarga en ZIP)
- Panel de revisión fijo para dentista cuando `enRevision`
- Action panel contextual según estado y rol
- Input de mensaje libre + adjunto de archivos
- Burbujas de chat diferenciadas por rol

**Ajuste clave:**
- El dentista nunca ve el nombre del técnico en el feed, en headers ni en cualquier otro lugar del UCH
- Todos los mensajes del técnico se muestran como _"Laboratorio DentFlow"_ (alias opaco)

### S7-2 · Nuevos eventos UCH en `caseEvents.ts`

```typescript
// Agregar al catálogo:
'CASO_ENVIADO_EVALUACION'    // dentista envía caso — visible para dentista
'PROPUESTA_PRESENTADA'       // propuesta llega al dentista — visible para dentista
'PROPUESTA_ACEPTADA'         // dentista acepta — visible para dentista
'PROPUESTA_RECHAZADA'        // dentista rechaza — visible para dentista
'TECNICO_CONFIRMADO'         // técnico recibe confirmación — visible para técnico
// Internos (adminOnly: true):
'COTIZACIONES_ABIERTAS'      // solo admin
'PROPUESTA_GENERADA'         // solo admin
'TECNICO_PRESELECCIONADO'    // solo admin
```

Actualizar `getCaseEventsAction` para filtrar eventos con `payload.adminOnly = true` para no-admins.

### S7-3 · Verificar acciones del flujo post-adjudicación

Las siguientes funciones **no requieren cambios** — verificar que siguen funcionando correctamente en el nuevo contexto:
- `startWorkAction` — técnico inicia diseño
- `submitReviewAction` — técnico sube entrega
- `approveWorkAction` — dentista aprueba
- `requestRevisionAction` — dentista pide ajustes
- `transitionToManufacturingAction` — pasa a fabricación
- `registerDispatchAction` — técnico registra despacho
- `confirmReceptionAction` — dentista confirma recepción
- `requestFlowChangeAction` / `resolveFlowRequestAction` / `resumeWorkAction` — flujo bilateral

### S7-4 · Vista del caso del técnico post-aceptación

Cuando el técnico recibe confirmación (`status = 'aceptado'`, `assignedTechnicianId = identity.id`):
- Aparece en tab "En Progreso" de `/dashboard/invitations`
- En la vista del caso: botón "Iniciar diseño" disponible
- Los archivos STL del dentista son accesibles mediante URLs firmadas (ya habilitado por S5-6)
- El UCH muestra el historial de eventos de diseño (no el de cotización)

### S7-5 · Badge de notificación en fichas de caso

En la lista `/dashboard/cases` del dentista, actualizar los badges de actividad:
- Badge pulsante ámbar para `propuestaLista` — requiere acción del dentista
- Badge azul para `enRevision` — requiere revisión del dentista
- Mantener la lógica de `lastRead` en `localStorage` para contar no leídos

### S7-6 · Adaptar `KanbanBoard.tsx`

Reemplazar columnas del modelo antiguo por las del nuevo modelo:

| Columna nueva | Estados incluidos |
|---|---|
| Borrador | `borrador` |
| En Evaluación | `enEvaluacion` |
| Propuesta | `propuestaLista` |
| En Ejecución | `aceptado`, `enProgreso` |
| En Revisión | `enRevision` |
| Fabricación | `fabricacion` |
| Despachado | `despachado` |
| Completado | `terminado`, `completado` |

### S7-7 · Tests end-to-end del flujo completo

Flujo de test a cubrir:
```
1. Técnico completa perfil (S1) ✓
2. Dentista crea caso y envía a evaluación (S2) ✓
3. Motor selecciona técnicos y envía invitaciones (S4) ✓
4. Técnico cotiza (S3) ✓
5. Motor evalúa y genera propuesta (S5) ✓
6. Dentista acepta propuesta (S2) ✓
7. Técnico ve caso en "En Progreso" y accede a los STL ✓
8. Técnico sube diseño → dentista aprueba ✓
9. Si fabricación: técnico registra despacho → dentista confirma recepción ✓
10. Ambos se califican mutuamente ✓
```

---

## Sprint 8 — Limpieza y Eliminación del Modelo Marketplace
**Duración estimada:** 1 semana  
**Objetivo:** Eliminar todo el código del modelo antiguo. El codebase queda limpio y sin código muerto.  
**Dependencias:** Todos los sprints anteriores completos y verificados.

### S8-1 · Eliminar rutas y páginas

```bash
rm frontend/app/dashboard/marketplace/page.tsx
# /dashboard/bids ya fue reemplazado en Sprint 3 — verificar que no hay referencias
```

### S8-2 · Eliminar Server Actions del modelo antiguo

De `lib/db/actions/cases.ts`:
- Eliminar: `acceptBidAction`, `withdrawCaseAction`, `republishCaseAction`

Eliminar archivos completos:
```bash
rm frontend/lib/db/actions/bids.ts
rm frontend/lib/db/actions/marketplace.ts
```

### S8-3 · Eliminar componentes del marketplace

```bash
rm frontend/components/cases/BidManagerModal.tsx
rm frontend/components/cases/MarketplaceCaseCard.tsx
```

### S8-4 · Migración de base de datos — eliminar tablas legacy

```typescript
// drizzle migration:
DROP TABLE bid;
DROP TABLE commercial_round;
// Eliminar de schema.ts las tablas bid, commercialRound y sus relaciones
```

### S8-5 · Limpiar constantes y tipos

En `dental.ts`:
- Eliminar `PUBLICADO` de `CASE_STATUSES`
- Verificar que no hay referencias a `CASE_STATUSES.PUBLICADO` en el codebase

En `caseEvents.ts`:
- Eliminar: `OFERTA_RECIBIDA`, `OFERTA_ACEPTADA`, `OFERTA_RECHAZADA`, `OFERTA_RETIRADA`, `RETIRO_PUBLICACION`, `REPUBLICACION`

### S8-6 · Actualizar tests existentes

- Eliminar `test/marketplace-guards.test.tsx`
- Actualizar `test/case-actions.test.ts` — eliminar tests de `acceptBidAction`, `createBidAction`
- Agregar tests para `submitCaseForEvaluationAction`, `acceptProposalAction`, `rejectProposalAction`

### S8-7 · Activar endpoint de cron (Opción B de S5-3)

Habilitar `/api/engine/evaluate/route.ts` protegido con header secreto, para configurar en Vercel Cron o Cloud Scheduler y no depender de la evaluación lazy.

### S8-8 · Actualizar documentación

- Actualizar `ESTADO_DEL_ARTE.md` con la arquitectura v2
- Actualizar `dentflowai_descripcion_funcional.md` con el nuevo flujo

---

## 13. Tabla de dependencias entre sprints

```
S0 ─────────────────────────────────────────────────────────────────────┐
│                                                                        │
├──→ S1 (Técnico Profile)     ┐                                         │
│    (puede ir en ║ con S2)   │                                         │
│                             ├──→ S4 (Motor: Clasificación/Selección)  │
├──→ S2 (Dentista Flow)       │         │                               │
│    (puede ir en ║ con S1)   │         ├──→ S5 (Motor: Propuesta) ────┤
│                             │         │         │                      │
└──→ S3 (Técnico Quotations) ─┘         └──→ S6 (Admin: Algoritmo)     │
                                               (puede ir en ║ con S5)  │
                                                     │                  │
                                         S2 + S3 + S5                  │
                                               ↓                        │
                                         S7 (UCH + Post-adj)           │
                                               ↓                        │
                                         S8 (Cleanup) ─────────────────┘
```

**Sprints paralelizables:**
- S1 y S2 (distintas partes del sistema, mismo schema)
- S5 y S6 (backend del motor vs. frontend de admin)

---

## 14. Hilo conductor y duración estimada

### Duración por sprint

| Sprint | Nombre | Semanas |
|---|---|---|
| S0 | DB Foundation | 2 |
| S1 | Técnico Profile | 2 |
| S2 | Dentista Flow (stub) | 2 |
| S3 | Técnico Quotations | 2 |
| S4 | Motor: Clasificación y Selección | 3 |
| S5 | Motor: Propuesta | 2 |
| S6 | Admin: Algoritmo | 2 |
| S7 | UCH + Post-adjudicación | 2 |
| S8 | Cleanup | 1 |
| **Total secuencial** | | **~18 semanas** |
| **Con paralelización (S1∥S2, S5∥S6)** | | **~14-15 semanas** |

### Hilo conductor — qué puedes demostrar al cerrar cada sprint

| Sprint | Demostración posible |
|---|---|
| S0 | "La base de datos está lista. Los técnicos existentes siguen funcionando sin interrupción." |
| S1 | "Un técnico puede declarar sus 15 tipos de competencia, elegir su sub-perfil y activar/desactivar su disponibilidad." |
| S2 | "Un dentista puede crear un caso, enviarlo a evaluación y recibir una propuesta (simulada). Puede aceptarla o rechazarla." |
| S3 | "Un técnico puede ver sus invitaciones y cotizar con precio + plazo + nota. El admin puede crear invitaciones de prueba." |
| S4 | "El motor real clasifica el caso, filtra el pool, calcula scores y envía invitaciones reales a los técnicos seleccionados." |
| S5 | "El ciclo completo funciona de verdad: caso → cotizaciones → propuesta con margen → aceptación → técnico asignado." |
| S6 | "El admin puede tunear los pesos α en tiempo real, ver la distribución de invitaciones y simular el algoritmo." |
| S7 | "El flujo de diseño, revisión, fabricación y despacho funciona correctamente bajo el nuevo modelo opaco." |
| S8 | "El código está limpio. El marketplace no existe en el codebase ni en la base de datos." |

---

*Documento generado el 2026-04-29. Base para implementación faseada de DentFlowAi v2.*  
*Referencia cruzada: `DentFlowAi_CajaNegra_Flujo.md` (especificación del algoritmo), `ESTADO_DEL_ARTE.md` (arquitectura v1 de referencia).*
