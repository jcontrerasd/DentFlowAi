'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { List, Kanban as KanbanIcon, Loader2, Info } from 'lucide-react';
import { listCasesByOrganization } from '@/lib/db/actions/cases';
import KanbanBoard from '@/components/cases/KanbanBoard';
import { useAuth } from '@/context/AuthContext';
import { logError } from '@/lib/logger';
import { expandTechPreset, normalizeFiltersForRole } from '@/lib/cases/caseListFilters';
import { DEFAULT_CASE_LIST_FILTERS } from '@/lib/cases/caseListFilters';

const KANBAN_PAGE_SIZE = 200;

export default function KanbanPage() {
  const { userProfile } = useAuth();
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const role = userProfile?.role === 'tecnico' ? 'tecnico' : 'dentista';
  const userId = userProfile?.id ? String(userProfile.id) : '';

  useEffect(() => {
    if (!userProfile) return;

    const fetchCases = async () => {
      try {
        const filters = normalizeFiltersForRole(
          role,
          expandTechPreset({
            ...DEFAULT_CASE_LIST_FILTERS,
            techPreset: role === 'tecnico' ? 'progreso' : null,
          }),
        );
        const { cases: data } = await listCasesByOrganization(
          1,
          KANBAN_PAGE_SIZE,
          false,
          true,
          filters,
        );
        setCases(data || []);
      } catch (err) {
        logError('Error fetching cases for kanban', err);
      } finally {
        setLoading(false);
      }
    };
    void fetchCases();
  }, [userProfile, role]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 text-teal-500 animate-spin" />
        <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">
          Cargando Tablero de Producción...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-4xl serif-font text-white">Tablero de Producción</h1>
            <div className="px-3 py-1 bg-teal-500/10 border border-teal-500/20 rounded-full">
              <span className="text-[9px] text-teal-400 font-black uppercase tracking-tighter italic">
                BETA Kanban
              </span>
            </div>
          </div>
          <p className="text-slate-500 text-sm">
            {role === 'tecnico'
              ? 'Solo casos en los que eres el laboratorio asignado y trabajo en producción.'
              : 'Visualiza el flujo de trabajo de tus casos activos.'}
          </p>
        </div>

        <div className="flex items-center bg-slate-900/60 p-1 rounded-2xl border border-white/5">
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl shadow-lg shadow-teal-900/20 transition-all"
          >
            <KanbanIcon className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">Kanban</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2 text-slate-500 hover:text-white transition-all"
          >
            <List className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">Lista</span>
          </button>
        </div>
      </div>

      <div className="bg-amber-500/5 border border-amber-500/10 p-4 rounded-2xl flex items-center gap-4">
        <div className="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center flex-shrink-0">
          <Info className="w-5 h-5" />
        </div>
        <p className="text-[10px] text-amber-500/80 uppercase font-black tracking-widest leading-relaxed">
          {role === 'tecnico'
            ? 'Solo casos en los que eres el laboratorio asignado. Haz clic en una tarjeta para abrir el caso.'
            : 'Haz clic en cualquier tarjeta para abrir el visor 3D y gestionar la entrega o revisión del caso.'}
        </p>
      </div>

      <KanbanBoard cases={cases} role={role} userId={userId} />
    </div>
  );
}
