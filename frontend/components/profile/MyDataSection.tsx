'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { exportMyDataAction } from '@/lib/db/actions/user';

/** Cumplimiento legal (Ley 21.719) — derecho de acceso y portabilidad: permite al usuario
 *  descargar una copia de sus datos personales en JSON. Ver Doc/Auditoria_Cumplimiento_Legal.md. */
export default function MyDataSection() {
  const { showSuccess, showError } = useToast();
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const result = await exportMyDataAction();
      if (!result.success || !result.data) {
        showError(result.error || 'No se pudo generar la descarga.');
        return;
      }
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dentflowai-mis-datos-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showSuccess('Descarga generada con éxito.');
    } catch {
      showError('No se pudo generar la descarga.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="bg-surface shadow-sm border border-divider p-8 rounded-[2rem] space-y-4">
      <div>
        <h3 className="text-sm font-black text-foreground uppercase tracking-widest mb-1">Mis Datos</h3>
        <p className="text-[11px] text-faint leading-relaxed">
          Descarga una copia de tus datos personales y de los casos en los que participas (derecho de acceso y
          portabilidad, Ley 21.719). Por cada caso se incluyen los enlaces de descarga del archivo final
          aprobado — no de revisiones intermedias en curso ni rechazadas.
        </p>
      </div>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="inline-flex items-center gap-2 bg-surface-2 hover:bg-surface-2 border border-divider px-5 py-3 rounded-2xl font-bold uppercase tracking-wider text-[11px] text-foreground transition-all disabled:opacity-50"
      >
        {downloading ? (
          <div className="w-4 h-4 border-2 border-border border-t-foreground rounded-full animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        Descargar mis datos (JSON)
      </button>
    </div>
  );
}
