Guías de Desarrollo — DentFlowAi
1. Stack y Arquitectura

Next.js 15 App Router (fullstack)
├── Server Actions ('use server') — único canal de acceso a datos
├── NO hay endpoints REST propios (excepto /api/auth y /api/cron/*)
├── Drizzle ORM + PostgreSQL
├── Tailwind CSS + Framer Motion
└── NextAuth.js v5 (JWT)
Regla clave: Todo acceso a datos ocurre en Server Actions. Los Client Components llaman Server Actions directamente — nunca fetch('/api/...') propio.

2. Estructura de Archivos

frontend/
├── app/                          # Páginas (App Router)
│   ├── dashboard/
│   │   ├── cases/[id]/page.tsx   # Página de detalle
│   │   └── invitations/
│   │       └── [invitationId]/page.tsx
│   └── api/cron/                 # Solo endpoints de sistema
├── components/
│   ├── cases/                    # Componentes de dominio
│   ├── invitations/              # Agrupados por dominio
│   ├── profile/
│   └── ui/                      # Componentes genéricos (Button, FocusTrap, StatusBadge...)
└── lib/
    ├── db/
    │   ├── actions/              # Un archivo por dominio
    │   │   ├── cases.ts
    │   │   ├── algorithm.ts
    │   │   ├── invitations.ts
    │   │   ├── proposal.ts
    │   │   └── skills.ts
    │   └── schema.ts             # Único archivo de schema Drizzle
    ├── constants/
    │   ├── dental.ts             # Enums de negocio
    │   └── caseEvents.ts         # Catálogo de acciones UCH
    ├── services/
    │   └── notifications.ts      # Stub — stub real en S8
    ├── gcs.ts                    # GCS con caché en memoria
    └── types/
        └── actions.ts            # ActionResult<T>
3. Nomenclatura
Archivos y directorios

PascalCase    → componentes React:   CaseWorkflowStepper.tsx, ProposalCard.tsx
camelCase     → actions/lib:         algorithm.ts, invitations.ts
kebab-case    → rutas de carpetas:   /dashboard/cases/[id]/
Variables y funciones

// Server Actions: verbo + sustantivo + Action
export async function getMyInvitationsAction() {}
export async function submitQuoteAction() {}
export async function checkProposalExpiryAction() {}

// Funciones internas (no expuestas): sin sufijo
async function calculateTechnicianScore() {}
async function getActiveConfig() {}

// Handlers de UI: handle + Nombre
const handleAccept = async () => {}
const handleSubmit = async () => {}

// Estados booleanos: verbo presente o is/has/show
const [isSubmitting, setIsSubmitting] = useState(false);
const [showDeliveryForm, setShowDeliveryForm] = useState(false);
const [hasActions, setHasActions] = ...

// Colecciones: plural
const [invitations, setInvitations] = useState<InvitationItem[]>([]);
Tipos e interfaces

// Interfaces: PascalCase, prefijo I solo si hay colisión de nombre
interface InvitationItem {}
interface AlgorithmConfigRow {}
interface CaseWorkflowStepperProps {}

// Types de unión de strings: PascalCase
type InvitationStatus = 'pending' | 'quoted' | 'accepted' | ...
type PhaseTab = 'todos' | 'negociacion' | 'diseno' | 'produccion';
type Tab = 'nuevas' | 'cotizaciones' | 'progreso';

// Enums: SNAKE_UPPER_CASE como objeto const
export const CASE_STATUSES = {
  EN_EVALUACION: 'enEvaluacion',
  PROPUESTA_LISTA: 'propuestaLista',
} as const;

// Tipo derivado de enum:
export type CaseStatus = typeof CASE_STATUSES[keyof typeof CASE_STATUSES];
4. Server Actions — Patrón estándar

'use server';

// 1. Guard de identidad siempre primero
export async function miAction(param: string): Promise<ActionResult> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autenticado' };
  // Guard de rol si aplica:
  if (identity.role !== 'tecnico') return { success: false, error: 'Solo técnicos' };

  try {
    // 2. Lógica de negocio
    // ...

    // 3. logCaseEvent para acciones de negocio relevantes
    await logCaseEvent({ ... });

    // 4. Retorno tipado
    return { success: true };          // ActionResult
    // O con datos:
    return { success: true, id: '...' }; // ActionResult<{ id: string }>
  } catch (error) {
    console.error('[miAction] Error:', error);
    return { success: false, error: String(error) };
  }
}
Tipo ActionResult<T>

// lib/types/actions.ts
type ActionResult<T = undefined> =
  | (T extends undefined ? { success: true } : { success: true } & T)
  | { success: false; error: string };
5. Schema Drizzle

// Convención de columnas: camelCase en TS, snake_case en DB
export const clinicalCase = pgTable("clinical_case", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  organizationId: uuid("organization_id").notNull().references(() => organization.id),
  internalStatus: text("internal_status"),          // nuevo campo en Sprint 0
  proposedPrice: doublePrecision("proposed_price"),  // nullable por defecto
});

// Índices al final de la tabla:
}, (table) => [
  index("clinical_case_organizationId_idx").on(table.organizationId),
  uniqueIndex("clinical_case_case_number_uidx").on(table.caseNumber),
]);

// Relaciones: archivo separado al final del schema.ts
export const clinicalCaseRelations = relations(clinicalCase, ({ one, many }) => ({
  organization: one(organization, { fields: [clinicalCase.organizationId], references: [organization.id] }),
  invitations: many(caseInvitation),
}));
6. Componentes React

// Props: interfaz explícita siempre
interface ProposalCardProps {
  caseId: string;
  proposedPrice: number;
  onAccepted: () => void;    // callbacks: on + Evento
  onRejected: () => void;
}

// Componente: named export default
export default function ProposalCard({ caseId, proposedPrice, onAccepted, onRejected }: ProposalCardProps) {
  // hooks al tope, sin lógica entre ellos
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(false);

  // handlers declarados como const arrow functions
  const handleAccept = async () => { ... };

  // return con JSX
  return ( ... );
}

// Componentes auxiliares: mismos estándares, al final del mismo archivo si son pequeños
function EmptyState({ icon: Icon, title, subtitle }: { ... }) { ... }
7. Constantes de Negocio

// dental.ts — Fuente única de verdad para todos los valores de negocio

// Estados del caso: siempre camelCase en valor
export const CASE_STATUSES = {
  BORRADOR: 'borrador',
  EN_EVALUACION: 'enEvaluacion',
  EN_EJECUCION: 'enEjecucion',
} as const;

// Estados internos (admin/sistema): snake_lower
export const INTERNAL_CASE_STATUSES = {
  CASO_RECIBIDO: 'caso_recibido',
  CLASIFICANDO: 'clasificando',
} as const;

// Work types: snake_lower
export const WORK_TYPES = ['corona_anterior', 'corona_posterior', ...] as const;

// Labels legibles: objeto Record<string, string>
export const WORK_TYPE_LABELS: Record<string, string> = {
  corona_anterior: 'Corona Anterior',
  ...
};
8. Estilos Tailwind

Paleta base:
  slate-*      → fondos y bordes neutros
  teal-*       → acción primaria / éxito / activo
  amber-*      → advertencias / atención requerida
  rose-*/red-* → errores / destructivo
  sky-*/blue-* → información / estado neutral-positivo
  indigo-*     → en progreso / diseño
  violet-*     → fabricación

Opacidades tipicas en fondos:  /5, /8, /10, /15, /20
Opacidades tipicas en bordes:  /10, /20, /25, /30

Radios:
  rounded-xl      → elementos pequeños (badges, inputs, botones internos)
  rounded-2xl     → tarjetas medianas, paneles
  rounded-3xl     → paneles grandes, drawers
  rounded-[2rem]  → modales
  rounded-[3rem]  → estados vacíos, cards prominentes
  rounded-full    → avatares, badges de conteo

Texto:
  text-[9px]   → labels de campo (uppercase + tracking-widest)
  text-[10px]  → botones, badges, metadata
  text-[11px]  → contenido compacto en chat
  text-xs      → texto de ayuda
  text-sm      → contenido general
  text-base    → destacados en chat
9. Eventos del Hub (UCH)

// Todos los eventos se registran con logCaseEvent()
await logCaseEvent({
  caseId: string,
  userId: string,
  type: 'negociacion' | 'tecnico' | 'sistema',
  action: string,           // de CASE_EVENTS (caseEvents.ts)
  content?: string,         // descripción legible para el usuario
  payload?: {
    dentistOnly?: true,     // oculto a técnicos permanentemente
    technicianId?: string,  // para privacidad: técnico perdedor ve su rechazo
    ...datosEspecificos
  },
  stateChange?: { from?: string; to?: string },
}, tx?);  // opcional: participar en transacción existente
Tipos por audiencia:

'sistema' → cambios de estado automáticos, visible a ambos roles (excepto dentistOnly)
'tecnico' → acciones del técnico asignado
'negociacion' → ofertas, propuestas (modelo v1 legacy)
10. Flujo de identidad — Regla cardinal

// SIEMPRE primera línea en cualquier Server Action:
const identity = await getServerIdentity();

// Nunca usar auth() directamente en acciones.
// getServerIdentity() resuelve impersonación de admin automáticamente.

// El objeto retornado:
{
  id: string,           // ID activo (real o simulado)
  orgId: string,        // UUID de organización
  role: 'dentista' | 'tecnico' | 'admin',
  isSystemAdmin: boolean,
  isSimulating: boolean,
}
11. Migración de Base de Datos
Las migraciones son runtime — no se usa drizzle-kit migrate. Se aplican en lib/db/infrastructure.ts dentro de un DO $$ BEGIN ... END $$;:


// infrastructure.ts — dentro del bloque DO $$:
CREATE TABLE IF NOT EXISTS nueva_tabla (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ...
);
ALTER TABLE existing_table ADD COLUMN IF NOT EXISTS nueva_col TEXT;
CREATE INDEX IF NOT EXISTS idx_name ON tabla(col);

// Regla: siempre IF NOT EXISTS / IF NOT EXISTS para idempotencia
// Regla: nunca DROP en infrastructure.ts (solo en migraciones manuales coordinadas)
