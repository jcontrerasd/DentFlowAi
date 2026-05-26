/** Fila unificada del hilo UCH (eventos + contexto + acciones), orden descendente por `sortAt`. */

export type UchActionRowId = 'dentist_review' | 'case_actions' | 'delivery';

export type UchCaseEventLite = {
  id: string;
  userId?: string;
  type: 'negociacion' | 'tecnico' | 'sistema';
  action: string;
  content: string;
  payload: unknown;
  stateChange: unknown;
  createdAt: string | Date;
  user?: {
    id: string;
    fullName: string;
    role: string;
    image?: string;
  };
};

export type UchTimelineRow =
  | { kind: 'context'; id: 'context'; sortAt: number }
  | { kind: 'action'; id: UchActionRowId; sortAt: number; priority: number }
  | { kind: 'event'; id: string; sortAt: number; event: UchCaseEventLite };

export function compareTimelineRowsNewestFirst(a: UchTimelineRow, b: UchTimelineRow): number {
  if (b.sortAt !== a.sortAt) return b.sortAt - a.sortAt;
  const tier = (r: UchTimelineRow) => (r.kind === 'context' ? 3 : r.kind === 'action' ? 2 : 1);
  if (tier(b) !== tier(a)) return tier(b) - tier(a);
  if (a.kind === 'action' && b.kind === 'action' && b.priority !== a.priority) return b.priority - a.priority;
  return b.id.localeCompare(a.id);
}
