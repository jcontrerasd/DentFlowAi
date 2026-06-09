'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, AlertTriangle, Activity } from 'lucide-react';
import {
  purgeAllBusinessDataAdmin,
  type PurgeReport
} from '@/lib/db/actions/admin';
import { useAuth } from '@/context/AuthContext';

export default function AdminDangerPage() {
  const { userProfile, user } = useAuth();
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [purgeState, setPurgeState] = useState<'idle' | 'confirm' | 'running' | 'done'>('idle');
  const [purgeReport, setPurgeReport] = useState<PurgeReport | null>(null);
  const [purgeConfirmInput, setPurgeConfirmInput] = useState('');

  // Bypass de seguridad para Jaime
  if ((userProfile?.role as any) !== 'admin' && user?.email !== 'jaime.contreras.d@gmail.com') {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-center">
        <ShieldAlert className="w-16 h-16 text-error mb-4 animate-pulse" />
        <h1 className="text-2xl font-bold text-foreground mb-2">Acceso Restringido</h1>
        <p className="text-faint">No tienes permisos para ver esta sección.</p>
      </div>
    );
  }

  const handlePurgeData = async () => {
    if (purgeConfirmInput.toUpperCase() !== 'PURGAR') return;
    setPurgeState('running');
    setPurgeReport(null);
    const res = await purgeAllBusinessDataAdmin();
    setPurgeReport(res);
    setPurgeState('done');
  };

  return (
    <div className="space-y-12 pb-20 font-sans max-w-5xl">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl serif-font text-foreground flex items-center gap-3">
          <AlertTriangle className="text-error w-8 h-8" /> Zona de Alta Peligrosidad.
        </h1>
        <p className="text-faint text-sm">Operaciones irreversibles que afectan la integridad de todo el sistema.</p>
      </div>

      {/* Danger Zone */}
      <div className="p-8 border border-dashed border-error/20 rounded-[2.5rem] bg-error">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-error rounded-2xl flex items-center justify-center text-error">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl serif-font text-foreground">Purga total de la base de datos</h3>
            <p className="text-error/60 text-sm">Elimina todos los datos de negocio del sistema.</p>
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <p className="text-faint text-xs max-w-xl">
            La purga total eliminará todos los casos, bids, archivos y usuarios del sistema.
            <strong> Se mantendrá únicamente tu perfil de administrador </strong> para no perder el acceso a este panel.
          </p>
          <button
            onClick={() => { setPurgeConfirmInput(''); setPurgeState('confirm'); setShowPurgeConfirm(true); }}
            className="px-8 py-3 bg-error hover:bg-error text-inverse rounded-xl text-xs font-bold uppercase tracking-wider shadow-2xl shadow-sm transition-all"
          >
            Purgar toda la base de datos
          </button>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showPurgeConfirm && purgeState === 'confirm' && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/60">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-3xl bg-surface border-2 border-error/20 rounded-[2.5rem] p-10 shadow-[0_0_50px_rgba(244,63,94,0.2)] max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-error-hl rounded-2xl flex items-center justify-center text-error">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <h3 className="text-3xl serif-font text-foreground">¿Estás seguro?</h3>
              </div>

              <div className="space-y-3 text-muted text-sm mb-4 leading-relaxed">
                <p>Estás a punto de ejecutar una <span className="text-foreground font-bold underline">Purga Total</span> de los datos de negocio. Revisa el alcance exacto antes de continuar:</p>
              </div>

              <PurgeScopeTable />

              <p className="text-error font-black italic text-sm my-5">Esta acción no se puede deshacer.</p>

              <div className="mb-6">
                <label className="block text-[10px] font-black text-faint uppercase tracking-widest mb-2">
                  Escribe <span className="text-error">PURGAR</span> para confirmar
                </label>
                <input
                  type="text"
                  value={purgeConfirmInput}
                  onChange={e => setPurgeConfirmInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && purgeConfirmInput.toUpperCase() === 'PURGAR' && handlePurgeData()}
                  placeholder="PURGAR"
                  autoFocus
                  className="w-full bg-surface-2 border border-divider rounded-xl px-4 py-3 text-foreground font-black text-sm placeholder:text-faint focus:outline-none focus:border-error/20 transition-colors"
                />
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={handlePurgeData}
                  disabled={purgeConfirmInput.toUpperCase() !== 'PURGAR'}
                  className="w-full py-4 bg-error hover:bg-error disabled:opacity-30 disabled:cursor-not-allowed text-inverse rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all"
                >
                  Ejecutar purga
                </button>
                <button
                  onClick={() => { setShowPurgeConfirm(false); setPurgeState('idle'); setPurgeConfirmInput(''); }}
                  className="w-full py-4 text-faint font-black text-xs uppercase tracking-widest hover:text-foreground transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Modal de progreso / reporte de purga */}
        {(purgeState === 'running' || purgeState === 'done') && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/70">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-lg bg-surface border border-divider rounded-[2rem] p-8 shadow-2xl"
            >
              {purgeState === 'running' && (
                <div className="flex flex-col items-center gap-4 py-6">
                  <div className="w-12 h-12 border-2 border-error/20 border-t-rose-400 rounded-full animate-spin" />
                  <p className="text-foreground font-black text-sm uppercase tracking-widest">Ejecutando purga…</p>
                  <p className="text-faint text-xs text-center">No cierres esta ventana. Eliminando datos y archivos GCS.</p>
                </div>
              )}

              {purgeState === 'done' && purgeReport && (
                <>
                  <div className="flex items-center gap-3 mb-6">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${purgeReport.success ? 'bg-primary-hl text-primary' : 'bg-error-hl text-error'}`}>
                      {purgeReport.success ? <Activity className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="text-foreground font-black text-sm">{purgeReport.success ? 'Purga completada' : 'Error durante la purga'}</p>
                      {purgeReport.error && <p className="text-error text-xs mt-0.5">{purgeReport.error}</p>}
                    </div>
                  </div>

                  {/* Pasos ejecutados */}
                  <div className="space-y-2 mb-6">
                    <p className="text-[10px] font-black text-faint uppercase tracking-widest mb-3">Detalle de ejecución</p>
                    {purgeReport.steps.map((step) => (
                      <div key={step.key} className="flex items-center justify-between py-2 px-3 bg-surface-2/60 rounded-xl">
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${step.status === 'done' ? 'bg-primary' : 'bg-surface-off'}`} />
                          <span className="text-muted text-xs">{step.label}</span>
                        </div>
                        {step.count !== undefined && (
                          <span className="text-[11px] font-black text-foreground tabular-nums">{step.count}</span>
                        )}
                        {step.status === 'skipped' && (
                          <span className="text-[10px] text-faint uppercase tracking-wider">vacío</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Resumen de lo preservado */}
                  {purgeReport.success && (
                    <div className="bg-primary-hl border border-primary/20 rounded-xl p-4 mb-6">
                      <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-2">Preservado intacto</p>
                      <div className="flex gap-6">
                        <div>
                          <p className="text-2xl font-black text-foreground tabular-nums">{purgeReport.preserved.users}</p>
                          <p className="text-[10px] text-muted">usuarios</p>
                        </div>
                        <div>
                          <p className="text-2xl font-black text-foreground tabular-nums">{purgeReport.preserved.organizations}</p>
                          <p className="text-[10px] text-muted">organizaciones</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => { setPurgeState('idle'); setShowPurgeConfirm(false); setPurgeReport(null); }}
                    className="w-full py-3 bg-surface-2 hover:bg-surface-off text-foreground rounded-xl font-black text-xs uppercase tracking-widest transition-all"
                  >
                    Cerrar
                  </button>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Inventario completo de tablas + alcance de la purga (32 filas).
// Mantener sincronizado con purgeAllBusinessDataAdmin() en lib/db/actions/admin.ts
// y con schema.ts (FKs y ON DELETE).
// ─────────────────────────────────────────────────────────────

type PurgeMode = 'explicit' | 'cascade' | 'gcs' | 'reset' | 'never';

const PURGE_INVENTORY: { table: string; desc: string; mode: PurgeMode }[] = [
  // Storage
  { table: 'GCS bucket', desc: 'Archivos físicos (STL/imágenes) de todos los casos', mode: 'gcs' },

  // Borrado explícito (DELETE en la action)
  { table: 'clinical_case', desc: 'Casos clínicos (entidad raíz)', mode: 'explicit' },
  { table: 'clinical_case_event', desc: 'Historial de eventos UCH', mode: 'explicit' },
  { table: 'clinical_case_delivery', desc: 'Entregas de diseño / revisiones', mode: 'explicit' },
  { table: 'case_invitation', desc: 'Invitaciones Fauchard + cotizaciones', mode: 'explicit' },
  { table: 'commercial_round', desc: 'Rondas comerciales', mode: 'explicit' },
  { table: 'bid', desc: 'Ofertas legacy', mode: 'explicit' },
  { table: 'review', desc: 'Reseñas dentista ↔ técnico', mode: 'explicit' },
  { table: 'annotation', desc: 'Anotaciones 3D', mode: 'explicit' },
  { table: 'file', desc: 'Registros DB de archivos (FK SET NULL, requiere explícito)', mode: 'explicit' },
  { table: 'contact_guard_audit', desc: 'Auditoría de intentos de bypass (FK SET NULL)', mode: 'explicit' },
  { table: 'audit_log', desc: 'Log genérico de acciones (FK SET NULL)', mode: 'explicit' },
  { table: 'technician_no_response_event', desc: 'Eventos de no-respuesta / sanción rolling (v5.0)', mode: 'explicit' },

  // Borrado por cascade (no DELETE explícito; FK CASCADE desde clinical_case)
  { table: 'case_user_archive', desc: 'Marcas de archivado por usuario sobre casos', mode: 'cascade' },
  { table: 'clinical_case_hub_read', desc: 'Cursores de lectura del UCH (no leídos)', mode: 'cascade' },

  // Reset parcial de estado operacional (no borra la fila, solo limpia campos derivados)
  { table: 'user (técnicos)', desc: 'Reset de contadores Fauchard: consecutive_no_response=0, suspended_until=null, last_invited_at=null, league_transition_count=0 (leagueLevel se preserva)', mode: 'reset' },

  // Nunca se borra (usuarios, auth, config, catálogos)
  { table: 'user', desc: 'Usuarios (filas + perfil + leagueLevel)', mode: 'never' },
  { table: 'organization', desc: 'Clínicas y laboratorios', mode: 'never' },
  { table: 'accounts', desc: 'Cuentas OAuth (NextAuth)', mode: 'never' },
  { table: 'sessions', desc: 'Sesiones activas (NextAuth)', mode: 'never' },
  { table: 'verificationToken', desc: 'Tokens de verificación de email', mode: 'never' },
  { table: 'technician_skill', desc: 'Matriz de habilidades del técnico', mode: 'never' },
  { table: 'technician_availability', desc: 'Disponibilidad declarada del técnico (v5.0)', mode: 'never' },
  { table: 'invitation_rejection_reason', desc: 'Catálogo: motivos de rechazo individual (v5.0)', mode: 'never' },
  { table: 'bulk_rejection_reason', desc: 'Catálogo: motivos de rechazo masivo (v5.0)', mode: 'never' },
  { table: 'fauchard_config', desc: 'Configuración del motor Fauchard', mode: 'never' },
  { table: 'fauchard_config_log', desc: 'Historial de cambios de config Fauchard', mode: 'never' },
  { table: 'vita_shade', desc: 'Catálogo UI: colores VITA', mode: 'never' },
  { table: 'restoration_type', desc: 'Catálogo UI: tipos de restauración', mode: 'never' },
  { table: 'dental_material', desc: 'Catálogo UI: materiales', mode: 'never' },
  { table: 'urgency_level', desc: 'Catálogo UI: niveles de urgencia', mode: 'never' },
  { table: 'contact_guard_rule', desc: 'Reglas anti-bypass (sistema)', mode: 'never' },
  { table: 'contact_guard_courier_allowlist', desc: 'Allowlist de couriers (sistema)', mode: 'never' },
];

const MODE_META: Record<PurgeMode, { label: string; badge: string; row: string }> = {
  explicit: {
    label: 'Borrado explícito',
    badge: 'bg-error-hl text-error border-error/20',
    row: 'border-l-2 border-error/20',
  },
  cascade: {
    label: 'Cascade (FK)',
    badge: 'bg-orange-500/20 text-warning border-orange-500/40',
    row: 'border-l-2 border-orange-500/60',
  },
  gcs: {
    label: 'Storage (GCS)',
    badge: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40',
    row: 'border-l-2 border-fuchsia-500/60',
  },
  reset: {
    label: 'Reset parcial',
    badge: 'bg-sky-500/20 text-primary border-sky-500/40',
    row: 'border-l-2 border-sky-500/60',
  },
  never: {
    label: 'Nunca se borra',
    badge: 'bg-primary-hl text-primary border-primary/30',
    row: 'border-l-2 border-primary/30/60',
  },
};

function PurgeScopeTable() {
  const counts = PURGE_INVENTORY.reduce<Record<PurgeMode, number>>((acc, r) => {
    acc[r.mode] = (acc[r.mode] || 0) + 1;
    return acc;
  }, { explicit: 0, cascade: 0, gcs: 0, reset: 0, never: 0 });

  return (
    <div className="space-y-3">
      {/* Leyenda */}
      <div className="flex flex-wrap gap-2">
        {(['explicit', 'cascade', 'gcs', 'reset', 'never'] as PurgeMode[]).map(m => (
          <span
            key={m}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${MODE_META[m].badge}`}
          >
            {MODE_META[m].label}
            <span className="opacity-70">({counts[m]})</span>
          </span>
        ))}
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-divider/60 overflow-hidden">
        <div className="max-h-[55vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-2/95 backdrop-blur z-10">
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted">
                <th className="px-3 py-2 w-8">#</th>
                <th className="px-3 py-2">Tabla</th>
                <th className="px-3 py-2">Qué es</th>
                <th className="px-3 py-2 w-32">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {PURGE_INVENTORY.map((r, i) => (
                <tr key={r.table} className={`hover:bg-surface-off/40 ${MODE_META[r.mode].row}`}>
                  <td className="px-3 py-2 text-faint tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2"><code className="text-foreground font-bold">{r.table}</code></td>
                  <td className="px-3 py-2 text-muted leading-snug">{r.desc}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex px-2 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider ${MODE_META[r.mode].badge}`}>
                      {MODE_META[r.mode].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-faint leading-snug">
        <span className="text-error font-bold">Explícito</span>: la action ejecuta DELETE individual.{' '}
        <span className="text-warning font-bold">Cascade</span>: se borra automáticamente al borrar <code>clinical_case</code> (FK ON DELETE CASCADE).{' '}
        <span className="text-primary font-bold">Reset parcial</span>: la fila se preserva, solo se limpian campos operacionales derivados (contadores Fauchard).{' '}
        <span className="text-primary font-bold">Nunca</span>: usuarios, auth, configuración Fauchard, catálogos UI y reglas del sistema se preservan.
      </p>
    </div>
  );
}
