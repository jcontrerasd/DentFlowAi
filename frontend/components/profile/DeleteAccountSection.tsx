'use client';

import { useState } from 'react';
import { AlertCircle, Trash2 } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { useToast } from '@/context/ToastContext';
import { requestAccountDeletionAction } from '@/lib/db/actions/user';

/** Cumplimiento legal (Ley 21.719/19.628) — derecho de cancelación/supresión iniciado por el
 *  propio usuario. Ver Doc/Auditoria_Cumplimiento_Legal.md (política de retención). */
export default function DeleteAccountSection() {
  const { showError } = useToast();
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      const result = await requestAccountDeletionAction();
      if (!result.success) {
        showError(result.error || 'No se pudo procesar la solicitud.');
        return;
      }
      await signOut({ callbackUrl: '/' });
    } catch {
      showError('No se pudo procesar la solicitud.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-error-hl/10 border border-error/20 p-8 rounded-[2rem] space-y-4">
      <div>
        <h3 className="text-sm font-black text-error uppercase tracking-widest mb-1">Zona de Peligro</h3>
        <p className="text-[11px] text-faint leading-relaxed">
          Puedes solicitar la eliminación de tu cuenta en cualquier momento. Si no tienes casos ni historial
          asociado, se borra de inmediato. Si tienes actividad registrada, la cuenta se desactiva (no podrás
          iniciar sesión) y los datos se retienen por motivos de integridad histórica, sujeto a revisión.
        </p>
      </div>

      {!showConfirm ? (
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          className="inline-flex items-center gap-2 bg-error/10 hover:bg-error/20 border border-error/30 px-5 py-3 rounded-2xl font-bold uppercase tracking-wider text-[11px] text-error transition-all"
        >
          <Trash2 className="w-4 h-4" />
          Solicitar eliminación de mi cuenta
        </button>
      ) : (
        <div className="space-y-3 bg-surface border border-error/20 rounded-2xl p-5">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
            <p className="text-xs text-foreground font-medium leading-relaxed">
              Esta acción no se puede deshacer fácilmente. ¿Confirmas que quieres solicitar la eliminación de tu cuenta?
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              disabled={deleting}
              className="flex-1 h-12 bg-surface rounded-xl font-bold uppercase tracking-wider text-faint border border-divider hover:text-muted transition-all text-[10px] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={deleting}
              className="flex-1 h-12 bg-error hover:bg-error text-white rounded-xl font-bold uppercase tracking-wider text-[10px] transition-all disabled:opacity-50"
            >
              {deleting ? 'Procesando...' : 'Sí, eliminar mi cuenta'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
