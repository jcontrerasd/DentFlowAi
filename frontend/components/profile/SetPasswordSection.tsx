'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { setOwnPasswordAction } from '@/lib/db/actions/auth';

/**
 * Solo se renderiza para cuentas 100% Google (sin contraseña propia, ver
 * UserProfile.hasPassword). Permite agregar una clave para poder loguear también
 * con email/clave a partir de ahí, sin perder la opción de "Continuar con Google".
 */
export default function SetPasswordSection({ onPasswordSet }: { onPasswordSet?: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.showError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirm) {
      toast.showError('Las contraseñas no coinciden');
      return;
    }
    setSaving(true);
    try {
      const res = await setOwnPasswordAction(password);
      if (res.success) {
        toast.showSuccess('Contraseña creada. Ya puedes iniciar sesión también con tu correo y clave.');
        setDone(true);
        onPasswordSet?.();
      } else {
        toast.showError(res.error || 'No se pudo guardar la contraseña');
      }
    } catch {
      toast.showError('Error de conexión con el servidor');
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <section className="bg-surface border border-divider rounded-lg p-5 shadow-sm">
        <header className="mb-1 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-primary" aria-hidden />
          <h2 className="text-[15px] font-bold text-foreground">Contraseña</h2>
        </header>
        <p className="text-sm text-muted">
          Ya tienes una contraseña configurada. Puedes iniciar sesión con Google o con tu correo y clave.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-surface border border-divider rounded-lg p-5 shadow-sm">
      <header className="mb-4">
        <h2 className="text-[15px] font-bold text-foreground flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-primary" aria-hidden />
          Agregar contraseña
        </h2>
        <p className="text-sm text-muted mt-1">
          Tu cuenta hoy solo inicia sesión con Google. Crea una contraseña para poder entrar también
          con tu correo y clave, sin perder la opción de Google.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
        <div>
          <label htmlFor="new-password" className="block text-xs font-bold text-muted mb-1">Nueva contraseña</label>
          <input
            id="new-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
            className="w-full px-3 py-2 rounded-md border border-divider bg-surface-2 text-foreground text-sm focus-visible:outline-none focus-visible:shadow-focus"
          />
        </div>
        <div>
          <label htmlFor="confirm-password" className="block text-xs font-bold text-muted mb-1">Confirmar contraseña</label>
          <input
            id="confirm-password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={6}
            required
            className="w-full px-3 py-2 rounded-md border border-divider bg-surface-2 text-foreground text-sm focus-visible:outline-none focus-visible:shadow-focus"
          />
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-primary hover:bg-primary text-inverse px-6 py-2.5 rounded-md font-bold uppercase tracking-wider text-[11px] transition-all disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </div>
      </form>
    </section>
  );
}
