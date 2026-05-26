'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { User, Calendar } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { CASE_STATUSES } from '@/lib/constants/dental';
import StatusBadge from '@/components/ui/StatusBadge';
import CaseViewerStatusStripe from '@/components/cases/CaseViewerStatusStripe';
import {
  isTechKanbanProductionCase,
  type CaseViewerStatusInput,
} from '@/lib/cases/caseViewerStatusPresentation';
import type { InvitationStatusForKpi } from '@/lib/dashboard/classifyCaseForDashboardKpi';
import { mapViewerInvitationForCard } from '@/lib/cases/caseListCardHelpers';

type KanbanColumn = {
  id: string;
  title: string;
  color: string;
  match: (status: string) => boolean;
};

const DENTIST_COLUMNS: KanbanColumn[] = [
  {
    id: CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO,
    title: 'Esperando inicio',
    color: 'bg-jade-hl text-jade border-jade/20',
    match: (s) => s === CASE_STATUSES.ACEPTADA_PENDIENTE_INICIO,
  },
  {
    id: CASE_STATUSES.EN_EJECUCION,
    title: 'En ejecución',
    color: 'bg-primary-hl text-primary border-blue-500/20',
    match: (s) => s === CASE_STATUSES.EN_EJECUCION,
  },
  {
    id: CASE_STATUSES.EN_REVISION,
    title: 'En revisión',
    color: 'bg-warning-hl text-warning border-warning/20',
    match: (s) =>
      s === CASE_STATUSES.EN_REVISION || s === CASE_STATUSES.CAMBIOS_EN_PROCESO,
  },
  {
    id: CASE_STATUSES.EN_FABRICACION,
    title: 'En fabricación',
    color: 'bg-primary-hl text-primary border-primary/20',
    match: (s) => s === CASE_STATUSES.EN_FABRICACION,
  },
  {
    id: CASE_STATUSES.ENVIADO,
    title: 'Enviado',
    color: 'bg-primary-hl text-primary border-primary/30',
    match: (s) => s === CASE_STATUSES.ENVIADO,
  },
  {
    id: CASE_STATUSES.COMPLETADO,
    title: 'Completado',
    color: 'bg-surface-off text-muted border-divider/20',
    match: (s) => s === CASE_STATUSES.COMPLETADO,
  },
];

function kanbanColumnForStatus(status: string): string {
  const col = DENTIST_COLUMNS.find((c) => c.match(status));
  return col?.id ?? CASE_STATUSES.EN_EJECUCION;
}

interface KanbanBoardProps {
  cases: any[];
  role: 'dentista' | 'tecnico';
  userId?: string;
}

export default function KanbanBoard({ cases, role, userId }: KanbanBoardProps) {
  const router = useRouter();
  const isTech = role === 'tecnico';

  const visibleCases = useMemo(() => {
    if (!isTech || !userId) return cases;
    return cases.filter((c) => {
      const viewerInv = c.viewerInvitation;
      const myBid = mapViewerInvitationForCard(viewerInv, c, userId);
      const input: CaseViewerStatusInput = {
        caseStatus: String(c.status ?? ''),
        assignedTechnicianId: c.assignedTechnicianId ?? null,
        technicianUserId: userId,
        invitationStatus: (myBid?.status ?? null) as InvitationStatusForKpi,
      };
      return isTechKanbanProductionCase(input);
    });
  }, [cases, isTech, userId]);

  const casesByColumn = useMemo(() => {
    const map: Record<string, any[]> = {};
    DENTIST_COLUMNS.forEach((col) => {
      map[col.id] = [];
    });
    visibleCases.forEach((c) => {
      const colId = kanbanColumnForStatus(String(c.status ?? ''));
      if (map[colId]) map[colId].push(c);
    });
    return map;
  }, [visibleCases]);

  return (
    <div className="flex gap-6 overflow-x-auto pb-8 custom-scrollbar min-h-[70vh]">
      {DENTIST_COLUMNS.map((col) => (
        <div key={col.id} className="flex-shrink-0 w-80 flex flex-col">
          <div className={`mb-4 p-4 rounded-2xl border ${col.color} flex items-center justify-between`}>
            <h3 className="text-[10px] uppercase font-black tracking-widest">{col.title}</h3>
            <span className="text-[10px] font-bold opacity-60 bg-surface-off px-2 py-0.5 rounded-full">
              {casesByColumn[col.id].length}
            </span>
          </div>

          <div className="flex-1 space-y-4">
            {casesByColumn[col.id].map((c) => {
              const techInput: CaseViewerStatusInput | null =
                isTech && userId
                  ? {
                      caseStatus: String(c.status ?? ''),
                      assignedTechnicianId: c.assignedTechnicianId ?? null,
                      technicianUserId: userId,
                      invitationStatus: (mapViewerInvitationForCard(
                        c.viewerInvitation,
                        c,
                        userId,
                      )?.status ?? null) as InvitationStatusForKpi,
                    }
                  : null;

              return (
                <motion.div
                  key={c.id}
                  layoutId={c.id}
                  onClick={() => router.push(`/dashboard/cases/${c.id}`)}
                  className="bg-surface/40 border border-divider p-5 rounded-[2rem] hover:border-divider transition-all cursor-pointer group space-y-4 transition-colors duration-150 hover:bg-surface-off hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-[10px] text-primary font-mono tracking-tighter">{c.caseNumber}</p>
                      <h4 className="text-foreground text-xs font-bold leading-tight group-hover:text-primary transition-colors uppercase">
                        {c.internalName}
                      </h4>
                    </div>
                    {c.urgency === 'Prioritario' && (
                      <div className="w-2 h-2 bg-warning-hl rounded-full animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-surface-off p-2 rounded-xl border border-divider">
                      <p className="text-[8px] text-faint uppercase font-black">Restauración</p>
                      <p className="text-[10px] text-muted font-bold truncate">{c.restorationType}</p>
                    </div>
                    <div className="bg-surface-off p-2 rounded-xl border border-divider">
                      <p className="text-[8px] text-faint uppercase font-black">Material</p>
                      <p className="text-[10px] text-muted font-bold truncate">{c.material}</p>
                    </div>
                  </div>

                  <div className="pt-1">
                    {techInput ? (
                      <CaseViewerStatusStripe input={techInput} compact />
                    ) : (
                      <StatusBadge status={c.status} />
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-divider">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-surface-2 rounded-full flex items-center justify-center">
                        <User className="w-3 h-3 text-muted" />
                      </div>
                      <span className="text-[9px] text-muted uppercase font-bold">Clínica</span>
                    </div>
                    <div className="flex items-center gap-1 text-faint">
                      <Calendar className="w-3 h-3" />
                      <span className="text-[9px] font-bold">
                        {new Date(c.createdAt).toLocaleDateString('es-ES', {
                          day: '2-digit',
                          month: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {casesByColumn[col.id].length === 0 && (
              <div className="h-32 border border-dashed border-divider rounded-[2rem] flex items-center justify-center">
                <span className="text-[9px] text-faint uppercase font-black tracking-widest italic">
                  Vacío
                </span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
