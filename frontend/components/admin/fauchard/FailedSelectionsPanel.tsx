import { Activity, AlertCircle, Calendar, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface FailedCase {
  caseId: string;
  reason: string;
  status?: string;
  internalStatus?: string | null;
  createdAt: string | Date;
}

interface Props {
  failedCases: FailedCase[];
}

function failureBadge(fc: FailedCase): { label: string; className: string } {
  if (fc.status === 'sin_asignacion_fallo') {
    return { label: 'Sin técnicos elegibles', className: 'bg-error-hl text-error border-error/30' };
  }
  return { label: 'Pool agotado', className: 'bg-warning-hl text-warning border-warning/30' };
}

export default function FailedSelectionsPanel({ failedCases }: Props) {
  if (!failedCases || failedCases.length === 0) {
    return (
      <div className="bg-surface border border-divider rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-xl bg-primary-hl flex items-center justify-center text-primary">
            <Activity className="w-4 h-4" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Casos sin asignación</h2>
        </div>
        <p className="text-faint text-sm">No se registraron casos fallidos en este período.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-divider rounded-3xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-error-hl flex items-center justify-center text-error">
            <XCircle className="w-4 h-4" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Casos sin asignación ({failedCases.length})</h2>
        </div>
      </div>

      <div className="space-y-4">
        {failedCases.map((fc) => {
          const badge = failureBadge(fc);
          return (
            <div key={fc.caseId} className="bg-surface-2 rounded-2xl p-4 border border-divider">
              <div className="flex items-start justify-between mb-3 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wider">
                      Caso: {fc.caseId.slice(0, 8)}…
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-faint">
                    <Calendar className="w-3.5 h-3.5" />
                    {format(new Date(fc.createdAt), 'd MMM, yyyy HH:mm', { locale: es })}
                  </div>
                </div>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${badge.className}`}>
                  <AlertCircle className="w-3 h-3" />
                  {badge.label}
                </div>
              </div>
              <p className="text-sm text-muted font-medium">{fc.reason}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
