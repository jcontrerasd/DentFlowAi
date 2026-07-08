'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, HelpCircle, History, ToggleLeft, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import {
  getFeatureFlagsAction,
  setFeatureFlagAction,
  getFeatureFlagLogAction,
  getFlagImpactConfigAction,
  type FeatureFlagRow,
  type FeatureFlagLogRow,
} from '@/lib/db/actions/featureFlags';
import { FEATURE_FLAGS_HELP, getFeatureFlagImpact, emailVerificationTtlImpact, type FlagImpactConfig } from '@/lib/constants/featureFlagsHelp';
import FauchardHelpButton from '@/components/admin/fauchard/FauchardHelpButton';
import FauchardHelpWindow from '@/components/admin/fauchard/FauchardHelpWindow';
import Button from '@/components/ui/Button';
import FocusTrap from '@/components/ui/FocusTrap';

const TTL_KEY = 'EMAIL_VERIFICATION_TTL_MINUTES';

function formatDate(d: Date | string) {
  return new Date(d).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
}

type PendingChange = {
  key: string;
  label: string;
  fromValue: string;
  toValue: string;
  impact: string;
};

export default function FeatureFlagsPage() {
  const { userProfile } = useAuth();
  const router = useRouter();
  const { showSuccess, showError } = useToast();

  const [flags, setFlags] = useState<FeatureFlagRow[]>([]);
  const [logs, setLogs] = useState<FeatureFlagLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [helpFocus, setHelpFocus] = useState<string | null>(null);
  const [ttlDraft, setTtlDraft] = useState<string>('');
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [impactConfig, setImpactConfig] = useState<FlagImpactConfig | null>(null);

  const openHelp = useCallback((focus?: string | null) => {
    setHelpFocus(focus ?? null);
    setShowHelp(true);
  }, []);

  useEffect(() => {
    if (userProfile && userProfile.role !== 'admin') router.replace('/dashboard');
  }, [userProfile, router]);

  const load = useCallback(async () => {
    setLoading(true);
    const [res, impactRes] = await Promise.all([getFeatureFlagsAction(), getFlagImpactConfigAction()]);
    if (res.success) {
      setFlags(res.flags);
      const ttl = res.flags.find((f) => f.key === TTL_KEY);
      if (ttl) setTtlDraft(ttl.value);
    } else {
      showError(res.error);
    }
    if (impactRes.success) setImpactConfig(impactRes.config);
    setLoading(false);
  }, [showError]);

  const loadLogs = useCallback(async () => {
    const res = await getFeatureFlagLogAction(100);
    if (res.success) setLogs(res.logs);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (showHistory) loadLogs(); }, [showHistory, loadLogs]);

  const applyChange = useCallback(async (key: string, value: string) => {
    setSavingKey(key);
    const res = await setFeatureFlagAction(key, value);
    setSavingKey(null);
    if (!res.success) {
      showError(res.error);
      return;
    }
    if (res.persisted) showSuccess('Cambio guardado.');
    await load();
    if (showHistory) loadLogs();
  }, [load, loadLogs, showHistory, showError, showSuccess]);

  const requestToggle = useCallback((flag: FeatureFlagRow) => {
    const toValue = flag.value === 'true' ? 'false' : 'true';
    const help = FEATURE_FLAGS_HELP.params.find((p) => p.symbol === flag.key);
    const impact = getFeatureFlagImpact(flag.key, toValue === 'true' ? 'on' : 'off', impactConfig);
    setPendingChange({ key: flag.key, label: help?.label ?? flag.key, fromValue: flag.value, toValue, impact });
  }, [impactConfig]);

  const requestTtlChange = useCallback(() => {
    const ttl = flags.find((f) => f.key === TTL_KEY);
    if (!ttl || ttl.value === ttlDraft) return;
    const help = FEATURE_FLAGS_HELP.params.find((p) => p.symbol === TTL_KEY);
    setPendingChange({
      key: TTL_KEY,
      label: help?.label ?? TTL_KEY,
      fromValue: ttl.value,
      toValue: ttlDraft,
      impact: emailVerificationTtlImpact(ttl.value, ttlDraft),
    });
  }, [flags, ttlDraft]);

  const cancelPending = useCallback(() => {
    if (pendingChange?.key === TTL_KEY) {
      const ttl = flags.find((f) => f.key === TTL_KEY);
      if (ttl) setTtlDraft(ttl.value);
    }
    setPendingChange(null);
  }, [pendingChange, flags]);

  const confirmPending = useCallback(async () => {
    if (!pendingChange) return;
    const { key, toValue } = pendingChange;
    setPendingChange(null);
    await applyChange(key, toValue);
  }, [pendingChange, applyChange]);

  const booleanFlags = flags.filter((f) => f.valueType === 'boolean');
  const numericFlags = flags.filter((f) => f.valueType === 'number');

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-10 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/admin"
            className="p-2 bg-surface border border-divider rounded-xl text-muted hover:text-primary transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <ToggleLeft className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tighter">Feature Flags</h1>
              <p className="text-xs text-faint">Activa o desactiva funciones del sistema en segundos, sin deploy</p>
            </div>
          </div>
        </div>
        <FauchardHelpButton onClick={() => openHelp()} label="Feature Flags" />
      </div>

      {loading ? (
        <p className="text-sm text-faint">Cargando…</p>
      ) : (
        <>
          <div className="bg-surface border border-divider rounded-2xl divide-y divide-divider">
            {booleanFlags.map((flag) => {
              const value = flag.value === 'true';
              const help = FEATURE_FLAGS_HELP.params.find((p) => p.symbol === flag.key);
              return (
                <div key={flag.key} className="flex items-start gap-4 p-5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={value}
                    disabled={savingKey === flag.key}
                    onClick={() => requestToggle(flag)}
                    className={[
                      'relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                      value ? 'bg-primary' : 'bg-surface-off border border-divider',
                      savingKey === flag.key ? 'opacity-50 pointer-events-none' : '',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200',
                        value ? 'translate-x-5' : 'translate-x-0',
                      ].join(' ')}
                    />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-foreground">{help?.label ?? flag.key}</span>
                      <code className="text-[10px] text-faint">{flag.key}</code>
                      {help && (
                        <button
                          type="button"
                          onClick={() => openHelp(flag.key)}
                          className="shrink-0 rounded-lg p-1 text-faint transition-colors hover:bg-white/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                          title="Ver explicación y ejemplo"
                          aria-label={`Ayuda de ${help.label}`}
                        >
                          <HelpCircle className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {flag.description && <p className="text-xs text-muted mt-1">{flag.description}</p>}
                    <p className="text-[10px] text-faint mt-1">
                      Último cambio: {flag.updatedByName ?? '—'} · {formatDate(flag.updatedAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {numericFlags.length > 0 && (
            <div className="bg-surface border border-divider rounded-2xl divide-y divide-divider">
              {numericFlags.map((flag) => {
                const help = FEATURE_FLAGS_HELP.params.find((p) => p.symbol === flag.key);
                return (
                  <div key={flag.key} className="flex items-start gap-4 p-5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{help?.label ?? flag.key}</span>
                        <code className="text-[10px] text-faint">{flag.key}</code>
                        {help && (
                          <button
                            type="button"
                            onClick={() => openHelp(flag.key)}
                            className="shrink-0 rounded-lg p-1 text-faint transition-colors hover:bg-white/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                            title="Ver explicación y ejemplo"
                            aria-label={`Ayuda de ${help.label}`}
                          >
                            <HelpCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {flag.description && <p className="text-xs text-muted mt-1">{flag.description}</p>}
                      <p className="text-[10px] text-faint mt-1">
                        Último cambio: {flag.updatedByName ?? '—'} · {formatDate(flag.updatedAt)}
                      </p>
                    </div>
                    <input
                      type="number"
                      min={5}
                      max={1440}
                      value={ttlDraft}
                      disabled={savingKey === flag.key}
                      onChange={(e) => setTtlDraft(e.target.value)}
                      onBlur={requestTtlChange}
                      className="w-24 bg-surface-off border border-divider rounded-lg px-3 py-2 text-sm text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    />
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted hover:text-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 rounded-sm"
          >
            <History className="w-4 h-4" />
            {showHistory ? 'Ocultar historial' : 'Ver historial de cambios'}
          </button>

          {showHistory && (
            <div className="bg-surface border border-divider rounded-2xl divide-y divide-divider">
              {logs.length === 0 ? (
                <p className="text-sm text-faint p-5">Sin cambios registrados.</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="p-4 text-xs">
                    <p className="font-bold text-foreground">{log.flagKey}</p>
                    <p className="text-muted mt-0.5">
                      {log.oldValue ?? '—'} → {log.newValue ?? '—'} · {log.changedByName ?? '—'} · {formatDate(log.changedAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      <FauchardHelpWindow isOpen={showHelp} onClose={() => setShowHelp(false)} section={FEATURE_FLAGS_HELP} focusKey={helpFocus} wide />

      <AnimatePresence>
        {pendingChange && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={cancelPending}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-surface border border-divider rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <FocusTrap onEscape={cancelPending}>
                <div className="p-8">
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-warning-hl border border-warning/20 flex items-center justify-center text-warning">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <button onClick={cancelPending} className="p-2 text-muted hover:text-foreground transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <h3 className="text-xl font-black text-foreground uppercase tracking-tighter mb-1">
                    Confirmar cambio
                  </h3>
                  <p className="text-sm text-muted font-medium mb-6">
                    {pendingChange.label} — <span className="text-foreground font-bold">{pendingChange.fromValue}</span>
                    {' → '}
                    <span className="text-foreground font-bold">{pendingChange.toValue}</span>
                  </p>

                  <div className="mb-6">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted mb-2">
                      Qué va a pasar
                    </p>
                    <p className="text-sm text-foreground/90 leading-relaxed rounded-2xl border border-divider/60 bg-surface-2/40 p-4">
                      {pendingChange.impact}
                    </p>
                  </div>

                  <div className="flex flex-col gap-3">
                    <Button onClick={confirmPending} loading={savingKey === pendingChange.key} className="w-full">
                      Sí, aplicar el cambio
                    </Button>
                    <Button onClick={cancelPending} disabled={savingKey === pendingChange.key} variant="secondary" className="w-full">
                      Cancelar
                    </Button>
                  </div>
                </div>
              </FocusTrap>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
