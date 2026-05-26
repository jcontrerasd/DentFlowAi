'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  Inbox,
  Undo2,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  SERVICE_TYPE_LABELS,
  SERVICE_TYPES,
} from '@/lib/constants/dental';
import { listUrgencyLevelsAction, type CatalogOption } from '@/lib/db/actions/catalogs';
import {
  CASE_LIST_FILTER_USE_TIMELINE_UI,
  TECH_INVITATION_STATUS_OPTIONS,
  normalizeFiltersForRole,
  type CaseListQueryFilters,
  type InvitationStatusFilter,
} from '@/lib/cases/caseListFilters';
import { ExceptionPill } from '@/components/cases/CaseListTimelineFilter';
import DentistCaseStatusFilterField from '@/components/cases/DentistCaseStatusFilterField';
import TechnicianCaseKpiFilterField from '@/components/cases/TechnicianCaseKpiFilterField';
import type { TechKpiId } from '@/lib/dashboard/classifyCaseForDashboardKpi';

const INVITATION_FILTER_ICONS: Record<InvitationStatusFilter, LucideIcon> = {
  pending: Inbox,
  quoted: FileText,
  accepted: Check,
  confirmed: CheckCircle2,
  rejected: X,
  expired: Clock,
  withdrawn: Undo2,
};

type CaseListFiltersModalProps = {
  role: 'dentista' | 'tecnico';
  currentFilters: CaseListQueryFilters;
  onClose: () => void;
  onApply: (f: CaseListQueryFilters) => void;
};

function toggle(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((i) => i !== item) : [...list, item];
}

export default function CaseListFiltersModal({
  role,
  currentFilters,
  onClose,
  onApply,
}: CaseListFiltersModalProps) {
  const [temp, setTemp] = useState<CaseListQueryFilters>({ ...currentFilters });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [urgencyLevels, setUrgencyLevels] = useState<CatalogOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    listUrgencyLevelsAction().then((rows) => { if (!cancelled) setUrgencyLevels(rows); });
    return () => { cancelled = true; };
  }, []);
  const isTech = role === 'tecnico';

  const handleApply = () => {
    onApply(normalizeFiltersForRole(role, temp));
  };

  const useTimelineFilter = CASE_LIST_FILTER_USE_TIMELINE_UI;

  const dentistEstadoSection = !isTech ? (
    <section>
      <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-2.5">
        Estado
      </label>
      <DentistCaseStatusFilterField
        selected={temp.caseStatuses ?? []}
        onToggle={(s) =>
          setTemp({
            ...temp,
            techPreset: null,
            caseStatuses: toggle(temp.caseStatuses ?? [], s),
          })
        }
      />
    </section>
  ) : null;

  const techEstadoSection = isTech ? (
    <section>
      <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-2.5">
        Mi estado en el caso
      </label>
      <TechnicianCaseKpiFilterField
        selected={(temp.techKpiStatuses ?? []) as TechKpiId[]}
        onToggle={(kpi) =>
          setTemp({
            ...temp,
            techPreset: null,
            techKpiStatuses: toggle(temp.techKpiStatuses ?? [], kpi) as TechKpiId[],
            caseStatuses: [],
          })
        }
      />
    </section>
  ) : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="case-filters-title"
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        className={`w-full bg-slate-900 border border-slate-800 rounded-[2rem] p-6 shadow-2xl relative overflow-hidden font-sans ${
          useTimelineFilter ? 'max-w-4xl' : 'max-w-sm'
        }`}
      >
        <motion.div
          className={`flex items-center justify-between ${useTimelineFilter ? 'mb-5' : 'mb-8'}`}
        >
          <h2 id="case-filters-title" className="text-3xl serif-font text-white leading-none">
            Filtros
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-full bg-slate-900 border border-slate-800 text-slate-500 hover:text-white transition-all hover:rotate-90"
            aria-label="Cerrar filtros"
          >
            <X className="w-5 h-5" />
          </button>
        </motion.div>

        <motion.div
          className={`space-y-4 overflow-y-auto pr-1 custom-scrollbar ${
            useTimelineFilter ? 'max-h-[58vh]' : 'max-h-[65vh]'
          }`}
        >
          {isTech && (
            <p className="text-[10px] text-slate-500 leading-relaxed normal-case tracking-normal">
              Filtra por tu participación en el caso (invitación, cotización o trabajo asignado), no
              solo por el estado global del caso.
            </p>
          )}

          {useTimelineFilter && !isTech ? dentistEstadoSection : null}
          {useTimelineFilter && isTech ? techEstadoSection : null}

          <section>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-2.5">
              Fecha publicación
            </label>
            <motion.div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={temp.dateStart ?? ''}
                onChange={(e) => {
                  const start = e.target.value;
                  let end = temp.dateEnd ?? '';
                  if (end && end < start) end = start;
                  setTemp({ ...temp, dateStart: start, dateEnd: end });
                }}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-teal-500/50 [color-scheme:dark]"
              />
              <input
                type="date"
                value={temp.dateEnd ?? ''}
                min={temp.dateStart}
                onChange={(e) => setTemp({ ...temp, dateEnd: e.target.value })}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-teal-500/50 [color-scheme:dark]"
              />
            </motion.div>
          </section>

          {isTech && (
            <section>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-2.5">
                Fecha invitación
              </label>
              <motion.div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={temp.offerDateStart ?? ''}
                  onChange={(e) => setTemp({ ...temp, offerDateStart: e.target.value })}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-teal-500/50 [color-scheme:dark]"
                />
                <input
                  type="date"
                  value={temp.offerDateEnd ?? ''}
                  min={temp.offerDateStart}
                  onChange={(e) => setTemp({ ...temp, offerDateEnd: e.target.value })}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-teal-500/50 [color-scheme:dark]"
                />
              </motion.div>
            </section>
          )}

          <section>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-2.5">
              Orden
            </label>
            <motion.div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setTemp({ ...temp, sortOrder: 'recent' })}
                className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                  temp.sortOrder !== 'old' ? 'bg-teal-600 text-white shadow-lg' : 'text-slate-500'
                }`}
              >
                Recientes
              </button>
              <button
                type="button"
                onClick={() => setTemp({ ...temp, sortOrder: 'old' })}
                className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                  temp.sortOrder === 'old' ? 'bg-teal-600 text-white shadow-lg' : 'text-slate-500'
                }`}
              >
                Antiguos
              </button>
            </motion.div>
          </section>

          <section>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-2.5">
              Prioridad
            </label>
            <motion.div className="grid grid-cols-3 gap-2">
              {urgencyLevels.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() =>
                    setTemp({
                      ...temp,
                      priorities: toggle(temp.priorities ?? [], u.label),
                    })
                  }
                  className={`py-2 rounded-xl border text-[8px] font-black uppercase tracking-widest transition-all ${
                    (temp.priorities ?? []).includes(u.label)
                      ? 'bg-teal-600/20 border-teal-500/50 text-teal-400'
                      : 'bg-slate-950 border-slate-800 text-slate-500'
                  }`}
                >
                  {u.label}
                </button>
              ))}
            </motion.div>
          </section>

          <section>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-2.5">
              Tipo de servicio
            </label>
            <motion.div className="flex flex-wrap gap-2">
              {Object.values(SERVICE_TYPES).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() =>
                    setTemp({
                      ...temp,
                      serviceTypes: toggle(temp.serviceTypes ?? [], st),
                    })
                  }
                  className={`px-3 py-1.5 rounded-xl border text-[8px] font-black uppercase tracking-widest transition-all ${
                    (temp.serviceTypes ?? []).includes(st)
                      ? 'bg-teal-600/20 border-teal-500/50 text-teal-400'
                      : 'bg-slate-950 border-slate-800 text-slate-500'
                  }`}
                >
                  {SERVICE_TYPE_LABELS[st] ?? st}
                </button>
              ))}
            </motion.div>
          </section>

          {isTech && !useTimelineFilter ? techEstadoSection : null}
          {!isTech && !useTimelineFilter ? dentistEstadoSection : null}

          {isTech && (
            <section>
              <button
                type="button"
                onClick={() => setAdvancedOpen((o) => !o)}
                className="flex w-full items-center justify-between text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300"
              >
                Avanzado — estado de invitación
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {advancedOpen && (
                <motion.div className="mt-2.5 space-y-2">
                  {useTimelineFilter ? (
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-600">
                      Por invitación
                    </p>
                  ) : null}
                  <motion.div className="flex flex-wrap gap-2">
                    {TECH_INVITATION_STATUS_OPTIONS.map(({ value, label }) =>
                      useTimelineFilter ? (
                        <ExceptionPill
                          key={value}
                          item={{
                            id: value,
                            label,
                            icon: INVITATION_FILTER_ICONS[value],
                          }}
                          selected={(temp.invitationStatuses ?? []).includes(value)}
                          onToggle={(id) =>
                            setTemp({
                              ...temp,
                              techPreset: null,
                              invitationStatuses: toggle(
                                temp.invitationStatuses ?? [],
                                id,
                              ) as InvitationStatusFilter[],
                            })
                          }
                        />
                      ) : (
                        <button
                          key={value}
                          type="button"
                          onClick={() =>
                            setTemp({
                              ...temp,
                              techPreset: null,
                              invitationStatuses: toggle(
                                temp.invitationStatuses ?? [],
                                value,
                              ) as InvitationStatusFilter[],
                            })
                          }
                          className={`px-3 py-1.5 rounded-xl border text-[8px] font-black uppercase tracking-widest transition-all ${
                            (temp.invitationStatuses ?? []).includes(value)
                              ? 'bg-teal-600/20 border-teal-500/50 text-teal-400'
                              : 'bg-slate-950 border-slate-800 text-slate-500'
                          }`}
                        >
                          {label}
                        </button>
                      ),
                    )}
                  </motion.div>
                </motion.div>
              )}
            </section>
          )}
        </motion.div>

        <motion.div className="mt-6 pt-4 border-t border-slate-800/60 flex gap-3">
          <button
            type="button"
            onClick={() =>
              setTemp({
                ...clearFiltersKeepSearch(temp.q),
                q: temp.q ?? '',
              })
            }
            className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white"
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex-[1.5] py-3 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-teal-900/30 transition-all active:scale-95"
          >
            Aplicar filtros
          </button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function clearFiltersKeepSearch(q?: string): CaseListQueryFilters {
  return {
    q: q ?? '',
    caseStatuses: [],
    techKpiStatuses: [],
    invitationStatuses: [],
    priorities: [],
    serviceTypes: [],
    dateStart: '',
    dateEnd: '',
    offerDateStart: '',
    offerDateEnd: '',
    techPreset: null,
    sortOrder: 'recent',
  };
}
