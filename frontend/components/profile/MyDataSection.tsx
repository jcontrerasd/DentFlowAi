'use client';

import { useState, useEffect } from 'react';
import { Send, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import {
  requestDataExportAction,
  getMyActiveDataExportRequestAction,
  type ActiveDataExportRequest,
} from '@/lib/db/actions/dataExport';

/** Cumplimiento legal (Ley 21.719) — derecho de acceso y portabilidad: el usuario solicita
 *  un ZIP con sus datos personales, que se genera de forma asíncrona y se envía por correo. */
export default function MyDataSection({ userId }: { userId?: string }) {
  const { showSuccess, showError } = useToast();
  const [requesting, setRequesting] = useState(false);
  const [active, setActive] = useState<ActiveDataExportRequest | null | undefined>(undefined);

  useEffect(() => {
    setActive(undefined);
    getMyActiveDataExportRequestAction().then((r) => {
      setActive(r.success ? r.data : null);
    });
  }, [userId]);

  const handleRequest = async () => {
    setRequesting(true);
    try {
      const result = await requestDataExportAction();
      if (!result.success) {
        showError(result.error || 'No se pudo crear la solicitud.');
        return;
      }
      showSuccess('Solicitud enviada. Te avisaremos por correo cuando tu archivo esté listo.');
      setActive({ id: '', status: 'pending', requestedAt: new Date(), expiresAt: null });
    } catch {
      showError('No se pudo crear la solicitud.');
    } finally {
      setRequesting(false);
    }
  };

  const isPending = active?.status === 'pending' || active?.status === 'processing';
  const isReady = active?.status === 'ready';
  const canRequest = active == null || active?.status === 'failed' || active?.status === 'expired';

  return (
    <div className="bg-surface shadow-sm border border-divider p-8 rounded-[2rem] space-y-4">
      <div>
        <h3 className="text-sm font-black text-foreground uppercase tracking-widest mb-1">Mis Datos</h3>
        <p className="text-[11px] text-faint leading-relaxed">
          Solicita una copia de tus datos personales y los casos en los que participas (derecho de
          acceso y portabilidad, Ley 21.719). Recibirás un correo con el enlace de descarga del archivo
          ZIP — disponible durante 2 días, luego se elimina permanentemente.
        </p>
      </div>

      {/* Estado: cargando */}
      {active === undefined && (
        <div className="h-10 flex items-center">
          <div className="w-4 h-4 border-2 border-border border-t-foreground rounded-full animate-spin" />
        </div>
      )}

      {/* Estado: solicitud en proceso */}
      {isPending && (
        <div className="flex items-center gap-2 text-[11px] text-faint">
          <Clock className="w-4 h-4 shrink-0 text-amber-400" />
          <span>Estamos preparando tu archivo. Te avisaremos por correo cuando esté listo.</span>
        </div>
      )}

      {/* Estado: listo (link enviado por correo) */}
      {isReady && active?.expiresAt && (
        <div className="flex items-start gap-2 text-[11px] text-faint">
          <CheckCircle className="w-4 h-4 shrink-0 text-green-400 mt-0.5" />
          <span>
            Tu archivo está listo. Revisa tu correo para el enlace de descarga.{' '}
            <span className="font-semibold">
              Vence el{' '}
              {new Date(active.expiresAt).toLocaleString('es-CL', {
                timeZone: 'America/Santiago',
                dateStyle: 'long',
                timeStyle: 'short',
              })}
              .
            </span>
          </span>
        </div>
      )}

      {/* Estado: fallo — puede volver a solicitar */}
      {active?.status === 'failed' && (
        <div className="flex items-center gap-2 text-[11px] text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>La solicitud anterior falló. Puedes intentarlo nuevamente.</span>
        </div>
      )}

      {/* Botón solicitar */}
      {(canRequest || active === null) && active !== undefined && (
        <button
          type="button"
          onClick={handleRequest}
          disabled={requesting}
          className="inline-flex items-center gap-2 bg-surface-2 hover:bg-surface-2 border border-divider px-5 py-3 rounded-2xl font-bold uppercase tracking-wider text-[11px] text-foreground transition-all disabled:opacity-50 disabled:pointer-events-none"
        >
          {requesting ? (
            <div className="w-4 h-4 border-2 border-border border-t-foreground rounded-full animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Solicitar mis datos
        </button>
      )}
    </div>
  );
}
