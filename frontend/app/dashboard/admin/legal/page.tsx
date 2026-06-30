'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, ShieldCheck, FileDown } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { DATA_PROCESSING_REGISTRY } from '@/lib/constants/dataProcessingRegistry';
import { listDeletionRequestsAdmin } from '@/lib/db/actions/admin';
import { getSignedUrlAction } from '@/lib/db/actions/cases';
import { DELETION_REINSTATEMENT_REASONS } from '@/lib/constants/legalReasons';

const OUTCOME_COLORS: Record<string, string> = {
  deactivated: 'bg-amber-500/10 text-amber-400',
  deleted: 'bg-red-500/10 text-red-400',
  reinstated: 'bg-primary/10 text-primary',
  pending: 'bg-surface-2 text-faint',
};

const OUTCOME_LABELS: Record<string, string> = {
  deactivated: 'Desactivada',
  deleted: 'Eliminada',
  reinstated: 'Reactivada',
  pending: 'Pendiente',
};

export default function AdminLegalCompliancePage() {
  const { userProfile } = useAuth();
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const [mounted, setMounted] = useState(false);
  const [deletionRequests, setDeletionRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (userProfile && userProfile.role !== 'admin') router.replace('/dashboard');
  }, [userProfile, router]);

  useEffect(() => {
    if (!userProfile || userProfile.role !== 'admin') return;
    listDeletionRequestsAdmin().then(res => {
      if (res.success) setDeletionRequests(res.data ?? []);
      setLoadingRequests(false);
    });
  }, [userProfile]);

  const handleDownloadEvidence = async (gcsPath: string, filename: string) => {
    const url = await getSignedUrlAction(gcsPath);
    if (!url) { showError('No se pudo generar la URL de descarga.'); return; }
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };

  const handleDownload = () => {
    const blob = new Blob(
      [JSON.stringify({
        generatedAt: new Date().toISOString(),
        registro: DATA_PROCESSING_REGISTRY,
        solicitudesEliminacion: deletionRequests,
      }, null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dentflowai-registro-tratamiento-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('Descarga generada con éxito.');
  };

  if (!mounted || !userProfile || userProfile.role !== 'admin') return null;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/admin/observability" className="text-faint hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl serif-font italic text-foreground flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" /> Cumplimiento Legal.
            </h1>
            <p className="text-faint text-xs mt-1">
              Registro de actividades de tratamiento (Art. 14 ter, Ley 21.719). Ver también{' '}
              <code className="text-[10px]">Doc/Auditoria_Cumplimiento_Legal.md</code>.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex items-center gap-2 bg-surface-2 hover:bg-surface-2 border border-divider px-5 py-3 rounded-2xl font-bold uppercase tracking-wider text-[11px] text-foreground transition-all"
        >
          <Download className="w-4 h-4" />
          Descargar registro (JSON)
        </button>
      </div>

      {/* Registro de actividades de tratamiento */}
      <div className="bg-surface shadow-sm border border-divider rounded-[2rem] overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-surface-2">
            <tr>
              {['Dataset', 'Descripción', 'Finalidad', 'Base legal', 'Quién accede', 'Retención', 'Referencia en schema'].map((h) => (
                <th key={h} className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-faint whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DATA_PROCESSING_REGISTRY.map((entry) => (
              <tr key={entry.dataset} className="border-t border-divider align-top">
                <td className="px-5 py-4 text-xs font-bold text-foreground whitespace-nowrap">{entry.dataset}</td>
                <td className="px-5 py-4 text-xs text-muted leading-relaxed max-w-[220px]">{entry.description}</td>
                <td className="px-5 py-4 text-xs text-muted leading-relaxed max-w-[220px]">{entry.purpose}</td>
                <td className="px-5 py-4 text-xs text-muted leading-relaxed max-w-[200px]">{entry.legalBasis}</td>
                <td className="px-5 py-4 text-xs text-muted leading-relaxed max-w-[200px]">{entry.accessedBy}</td>
                <td className="px-5 py-4 text-xs text-muted leading-relaxed max-w-[200px]">{entry.retention}</td>
                <td className="px-5 py-4 text-[10px] text-faint font-mono whitespace-nowrap">{entry.schemaRef}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Historial de solicitudes de eliminación */}
      <div className="bg-surface shadow-sm border border-divider rounded-[2rem] overflow-hidden">
        <div className="px-6 py-5 border-b border-divider">
          <h2 className="text-base font-bold text-foreground">Historial de solicitudes de eliminación</h2>
          <p className="text-faint text-xs mt-1">
            Registro inmutable bajo Ley 21.719 — art. 14 sexies (derechos ARCO). No se purga junto a los datos de negocio.
          </p>
        </div>
        {loadingRequests ? (
          <div className="py-12 text-center">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-teal-500 rounded-full animate-spin mx-auto" />
          </div>
        ) : deletionRequests.length === 0 ? (
          <div className="py-12 text-center text-faint text-sm">Sin solicitudes registradas.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-2">
                <tr>
                  {['Usuario', 'Email', 'Fecha solicitud', 'Resultado', 'Fecha resolución', 'Admin responsable', 'Motivo', 'Respaldo'].map(h => (
                    <th key={h} className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-faint whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deletionRequests.map((r) => {
                  const reasonLabel = DELETION_REINSTATEMENT_REASONS.find(x => x.code === r.resolutionReasonCode)?.label ?? r.resolutionReasonCode ?? '—';
                  return (
                    <tr key={r.id} className="border-t border-divider align-top">
                      <td className="px-5 py-4 text-xs text-foreground">{r.userFullName ?? '—'}</td>
                      <td className="px-5 py-4 text-xs text-muted">{r.userEmailSnapshot}</td>
                      <td className="px-5 py-4 text-xs text-faint whitespace-nowrap">
                        {new Date(r.requestedAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${OUTCOME_COLORS[r.outcome] ?? 'bg-surface-2 text-faint'}`}>
                          {OUTCOME_LABELS[r.outcome] ?? r.outcome}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-faint whitespace-nowrap">
                        {r.resolvedAt ? new Date(r.resolvedAt).toLocaleDateString('es-CL') : '—'}
                      </td>
                      <td className="px-5 py-4 text-xs text-muted">{r.resolvedByAdminName ?? '—'}</td>
                      <td className="px-5 py-4 text-xs text-muted max-w-[200px]">
                        <span title={r.resolutionNote ?? undefined}>{reasonLabel}</span>
                        {r.resolutionNote && (
                          <p className="text-[10px] text-faint mt-0.5 truncate max-w-[180px]" title={r.resolutionNote}>{r.resolutionNote}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {r.evidenceGcsPath ? (
                          <button
                            onClick={() => handleDownloadEvidence(r.evidenceGcsPath, r.evidenceFilename ?? 'respaldo')}
                            className="p-1.5 text-faint hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                            title={r.evidenceFilename ?? 'Descargar respaldo'}
                          >
                            <FileDown className="w-4 h-4" />
                          </button>
                        ) : <span className="text-faint text-xs">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
