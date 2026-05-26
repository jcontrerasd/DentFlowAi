import { Activity, AlertCircle, Calendar, Users, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface FailedCase {
  caseId: string;
  reason: string;
  details: any;
  createdAt: string;
}

interface Props {
  failedCases: FailedCase[];
}

export default function FailedSelectionsPanel({ failedCases }: Props) {
  if (!failedCases || failedCases.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-400">
            <Activity className="w-4 h-4" />
          </div>
          <h2 className="text-lg font-bold text-white">Fallas de Selección</h2>
        </div>
        <p className="text-slate-500 text-sm">No se han registrado fallas de selección en este período.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400">
            <XCircle className="w-4 h-4" />
          </div>
          <h2 className="text-lg font-bold text-white">Fallas de Selección ({failedCases.length})</h2>
        </div>
      </div>

      <div className="space-y-4">
        {failedCases.map((fc, i) => {
          const exclusions = fc.details?.exclusionReasons || {};
          const totalCandidates = fc.details?.candidatesTotal || 0;

          return (
            <div key={i} className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Caso: {fc.caseId.slice(0, 8)}...
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Calendar className="w-3.5 h-3.5" />
                    {format(new Date(fc.createdAt), "d MMM, yyyy HH:mm", { locale: es })}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-semibold">
                  <AlertCircle className="w-3 h-3" />
                  Pool Vacío
                </div>
              </div>

              <div className="mb-3">
                <p className="text-sm text-slate-300 font-medium">Motivos de exclusión:</p>
                <p className="text-xs text-slate-500 mt-1">Total evaluados: {totalCandidates}</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <ExclusionStat label="Liga Inferior" count={exclusions.notInLeague || 0} />
                <ExclusionStat label="Suspendidos" count={exclusions.suspended || 0} />
                <ExclusionStat label="Sin Respuesta" count={exclusions.noResponse || 0} />
                <ExclusionStat label="Inactivos" count={exclusions.inactive || 0} />
                <ExclusionStat label="En Cooldown" count={exclusions.cooldown || 0} />
                <ExclusionStat label="Sin Habilidades" count={exclusions.lowSkill || 0} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExclusionStat({ label, count }: { label: string; count: number }) {
  return (
    <div className="bg-slate-900 rounded-xl p-2.5 border border-slate-800 flex items-center justify-between">
      <span className="text-xs font-medium text-slate-400">{label}</span>
      <span className={`text-sm font-bold ${count > 0 ? 'text-white' : 'text-slate-600'}`}>
        {count}
      </span>
    </div>
  );
}
