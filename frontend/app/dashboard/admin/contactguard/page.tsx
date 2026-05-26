'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Plus, Save, Shield, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import {
  listContactGuardRulesAction,
  createContactGuardRuleAction,
  updateContactGuardRuleAction,
  setContactGuardRuleActiveAction,
  deleteContactGuardRuleAction,
  testContactGuardRuleAction,
  listCourierAllowlistAction,
  createCourierAllowlistAction,
  setCourierAllowlistActiveAction,
  deleteCourierAllowlistAction,
  listContactGuardAuditAction,
  type GuardRule,
  type CourierEntry,
  type AuditEntry,
} from '@/lib/db/actions/contactGuard';

type Tab = 'rules' | 'couriers' | 'audit';

export default function AdminContactGuardPage() {
  const { userProfile } = useAuth();
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const [tab, setTab] = useState<Tab>('rules');

  useEffect(() => {
    if (userProfile && userProfile.role !== 'admin') router.replace('/dashboard');
  }, [userProfile, router]);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 md:p-10 space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/admin"
          className="p-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-teal-400"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-teal-400" />
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tighter">ContactGuard</h1>
            <p className="text-xs text-slate-500">Reglas anti-desintermediación, couriers permitidos e historial de intentos</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          { key: 'rules', label: 'Reglas' },
          { key: 'couriers', label: 'Couriers permitidos' },
          { key: 'audit', label: 'Historial / Auditoría' },
        ] as { key: Tab; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${
              tab === t.key
                ? 'bg-teal-500/10 border-teal-500/40 text-teal-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'rules' && <RulesTab showSuccess={showSuccess} showError={showError} />}
      {tab === 'couriers' && <CouriersTab showSuccess={showSuccess} showError={showError} />}
      {tab === 'audit' && <AuditTab showError={showError} />}
    </div>
  );
}

// ─── Reglas ──────────────────────────────────────────────────────────────────
function RulesTab({ showSuccess, showError }: { showSuccess: (m: string) => void; showError: (m: string) => void }) {
  const [rules, setRules] = useState<GuardRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({
    type: 'regex' as 'regex' | 'keyword',
    name: '',
    pattern: '',
    flags: 'i',
    description: '',
    appliesToFields: '',
  });
  const [editing, setEditing] = useState<GuardRule | null>(null);
  const [testSample, setTestSample] = useState('');
  const [testResult, setTestResult] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listContactGuardRulesAction();
    if (res.success && res.data) setRules(res.data);
    else showError(res.error ?? 'Error cargando reglas');
    setLoading(false);
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.pattern.trim()) {
      showError('Nombre y patrón son obligatorios');
      return;
    }
    const fieldsArr = form.appliesToFields.trim()
      ? form.appliesToFields.split(',').map((s) => s.trim()).filter(Boolean)
      : null;
    const res = await createContactGuardRuleAction({
      type: form.type,
      name: form.name.trim(),
      pattern: form.pattern,
      flags: form.flags || 'i',
      description: form.description || null,
      appliesToFields: fieldsArr,
    });
    if (res.success) {
      showSuccess('Regla creada');
      setNewOpen(false);
      setForm({ type: 'regex', name: '', pattern: '', flags: 'i', description: '', appliesToFields: '' });
      load();
    } else {
      showError(res.error ?? 'Error creando regla');
    }
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    const res = await updateContactGuardRuleAction(editing.id, {
      name: editing.name,
      pattern: editing.pattern,
      flags: editing.flags ?? 'i',
      type: editing.type,
      description: editing.description,
      appliesToFields: editing.appliesToFields,
    });
    if (res.success) {
      showSuccess('Regla actualizada');
      setEditing(null);
      load();
    } else {
      showError(res.error ?? 'Error actualizando');
    }
  };

  const handleToggle = async (r: GuardRule) => {
    const res = await setContactGuardRuleActiveAction(r.id, !r.isActive);
    if (res.success) load();
    else showError(res.error ?? 'Error');
  };

  const handleDelete = async (r: GuardRule) => {
    if (!confirm(`¿Eliminar regla "${r.name}"? Esta acción es permanente.`)) return;
    const res = await deleteContactGuardRuleAction(r.id);
    if (res.success) {
      showSuccess('Regla eliminada');
      load();
    } else showError(res.error ?? 'Error');
  };

  const handleTest = async () => {
    if (!editing) return;
    const res = await testContactGuardRuleAction({
      type: editing.type,
      pattern: editing.pattern,
      flags: editing.flags ?? 'i',
      sample: testSample,
    });
    if (res.success && res.data) setTestResult(res.data.matches);
    else {
      showError(res.error ?? 'Error en prueba');
      setTestResult(null);
    }
  };

  return (
    <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-5 space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-black">
          {rules.length} reglas
        </span>
        <button
          onClick={() => setNewOpen((v) => !v)}
          className="flex items-center gap-2 px-3 py-2 bg-teal-500/10 border border-teal-500/30 rounded-xl text-teal-300 text-xs font-bold hover:bg-teal-500/20"
        >
          <Plus className="w-4 h-4" /> Nueva regla
        </button>
      </div>

      {newOpen && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as any })}
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            >
              <option value="regex">regex</option>
              <option value="keyword">keyword</option>
            </select>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="nombre (ej. email)"
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm md:col-span-2"
            />
            <input
              value={form.flags}
              onChange={(e) => setForm({ ...form, flags: e.target.value })}
              placeholder="flags (i, ig)"
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <input
            value={form.pattern}
            onChange={(e) => setForm({ ...form, pattern: e.target.value })}
            placeholder="patrón (regex o palabra)"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono"
          />
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="descripción"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={form.appliesToFields}
            onChange={(e) => setForm({ ...form, appliesToFields: e.target.value })}
            placeholder="Aplica a campos (CSV opcional, vacío = todos)"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              className="px-3 py-2 bg-teal-500/20 border border-teal-500/40 rounded-lg text-teal-300 text-xs font-bold"
            >
              Guardar
            </button>
            <button
              onClick={() => setNewOpen(false)}
              className="px-3 py-2 bg-slate-800 rounded-lg text-slate-400 text-xs"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-slate-500 text-sm">Cargando…</div>
      ) : (
        <div className="divide-y divide-slate-800/60">
          {rules.map((r) => {
            const isEdit = editing?.id === r.id;
            return (
              <div key={r.id} className={`py-3 ${r.isActive ? '' : 'opacity-50'}`}>
                {!isEdit ? (
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded ${r.type === 'regex' ? 'bg-purple-500/10 text-purple-300' : 'bg-amber-500/10 text-amber-300'}`}>
                      {r.type}
                    </span>
                    <span className="text-sm font-bold w-40 truncate">{r.name}</span>
                    <code className="text-xs text-slate-400 font-mono flex-1 truncate" title={r.pattern}>{r.pattern}</code>
                    {r.appliesToFields && r.appliesToFields.length > 0 && (
                      <span className="text-[10px] text-slate-500" title={r.appliesToFields.join(', ')}>
                        {r.appliesToFields.length} campo(s)
                      </span>
                    )}
                    <button
                      onClick={() => { setEditing(r); setTestSample(''); setTestResult(null); }}
                      className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-slate-400 hover:text-teal-400 font-black"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleToggle(r)}
                      className={`p-2 rounded-lg ${r.isActive ? 'text-teal-400 hover:bg-teal-500/10' : 'text-slate-500 hover:bg-slate-800'}`}
                      title={r.isActive ? 'Desactivar' : 'Activar'}
                    >
                      {r.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleDelete(r)}
                      className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="bg-slate-950 border border-teal-500/30 rounded-xl p-3 space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <select
                        value={editing.type}
                        onChange={(e) => setEditing({ ...editing, type: e.target.value as any })}
                        className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="regex">regex</option>
                        <option value="keyword">keyword</option>
                      </select>
                      <input
                        value={editing.name}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm md:col-span-2"
                      />
                      <input
                        value={editing.flags ?? 'i'}
                        onChange={(e) => setEditing({ ...editing, flags: e.target.value })}
                        className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <input
                      value={editing.pattern}
                      onChange={(e) => setEditing({ ...editing, pattern: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono"
                    />
                    <input
                      value={editing.description ?? ''}
                      onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                      placeholder="descripción"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      value={(editing.appliesToFields ?? []).join(',')}
                      onChange={(e) => setEditing({
                        ...editing,
                        appliesToFields: e.target.value.trim()
                          ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                          : null,
                      })}
                      placeholder="Aplica a campos (CSV; vacío = todos)"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <input
                        value={testSample}
                        onChange={(e) => setTestSample(e.target.value)}
                        placeholder="Probar contra texto…"
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                      />
                      <button onClick={handleTest} className="px-3 py-2 bg-slate-800 rounded-lg text-slate-300 text-xs">Probar</button>
                    </div>
                    {testResult !== null && (
                      <div className="text-[11px] text-slate-400">
                        {testResult.length > 0 ? (
                          <>Matches: <code className="text-amber-300">{JSON.stringify(testResult)}</code></>
                        ) : (
                          <span className="text-slate-500">Sin matches</span>
                        )}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button onClick={handleSaveEdit} className="px-3 py-2 bg-teal-500/20 border border-teal-500/40 rounded-lg text-teal-300 text-xs font-bold flex items-center gap-1">
                        <Save className="w-3 h-3" /> Guardar
                      </button>
                      <button onClick={() => setEditing(null)} className="px-3 py-2 bg-slate-800 rounded-lg text-slate-400 text-xs flex items-center gap-1">
                        <X className="w-3 h-3" /> Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {rules.length === 0 && (
            <div className="py-12 text-center text-slate-500 text-sm">Sin reglas</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Couriers ────────────────────────────────────────────────────────────────
function CouriersTab({ showSuccess, showError }: { showSuccess: (m: string) => void; showError: (m: string) => void }) {
  const [couriers, setCouriers] = useState<CourierEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listCourierAllowlistAction();
    if (res.success && res.data) setCouriers(res.data);
    else showError(res.error ?? 'Error cargando couriers');
    setLoading(false);
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newDomain.trim()) return showError('Dominio requerido');
    const res = await createCourierAllowlistAction({ domain: newDomain, label: newLabel || undefined });
    if (res.success) {
      showSuccess('Courier agregado');
      setNewDomain(''); setNewLabel('');
      load();
    } else showError(res.error ?? 'Error');
  };

  return (
    <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-5 space-y-4">
      <p className="text-xs text-slate-500">
        Dominios permitidos en el campo de tracking del despacho. URLs de estos dominios <strong>no</strong> disparan
        bloqueo aunque coincidan con la regla de URL.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
        <input
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          placeholder="dominio (ej. chilexpress.cl)"
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
        />
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="etiqueta (ej. Chilexpress)"
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={handleCreate}
          className="px-3 py-2 bg-teal-500/10 border border-teal-500/30 rounded-xl text-teal-300 text-xs font-bold"
        >
          <Plus className="w-4 h-4 inline" /> Agregar
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-500 text-sm">Cargando…</div>
      ) : (
        <div className="divide-y divide-slate-800/60">
          {couriers.map((c) => (
            <div key={c.id} className={`flex items-center gap-3 py-3 ${c.isActive ? '' : 'opacity-50'}`}>
              <code className="text-sm font-mono flex-1">{c.domain}</code>
              <span className="text-sm text-slate-400 w-48">{c.label}</span>
              <button
                onClick={async () => { const r = await setCourierAllowlistActiveAction(c.id, !c.isActive); if (r.success) load(); }}
                className={`p-2 rounded-lg ${c.isActive ? 'text-teal-400 hover:bg-teal-500/10' : 'text-slate-500 hover:bg-slate-800'}`}
              >
                {c.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
              <button
                onClick={async () => {
                  if (!confirm(`¿Eliminar ${c.domain}?`)) return;
                  const r = await deleteCourierAllowlistAction(c.id);
                  if (r.success) { showSuccess('Eliminado'); load(); }
                }}
                className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {couriers.length === 0 && (
            <div className="py-12 text-center text-slate-500 text-sm">Sin couriers</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Auditoría ───────────────────────────────────────────────────────────────
function AuditTab({ showError }: { showError: (m: string) => void }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUserId, setFilterUserId] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listContactGuardAuditAction(
      {
        userId: filterUserId.trim() || undefined,
        role: filterRole || undefined,
      },
      { limit: 100 },
    );
    if (res.success && res.data) setEntries(res.data);
    else showError(res.error ?? 'Error cargando auditoría');
    setLoading(false);
  }, [filterUserId, filterRole, showError]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-5 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_200px_auto] gap-2">
        <input
          value={filterUserId}
          onChange={(e) => setFilterUserId(e.target.value)}
          placeholder="Filtrar por userId"
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono"
        />
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todos los roles</option>
          <option value="dentista">Dentista</option>
          <option value="tecnico">Técnico</option>
          <option value="admin">Admin</option>
        </select>
        <button onClick={load} className="px-3 py-2 bg-slate-800 rounded-lg text-slate-300 text-xs">Aplicar</button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-500 text-sm">Cargando…</div>
      ) : (
        <div className="divide-y divide-slate-800/60">
          {entries.map((e) => {
            const open = expanded === e.id;
            return (
              <div key={e.id} className="py-3 space-y-2">
                <button
                  onClick={() => setExpanded(open ? null : e.id)}
                  className="w-full flex items-start gap-3 text-left hover:bg-white/5 rounded-lg p-2 -m-2 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{e.userName ?? e.userEmail ?? e.userId}</span>
                      <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        {e.userRole ?? '—'}
                      </span>
                      <span className="text-[10px] text-amber-300">{e.user30dCount ?? 0} en 30d</span>
                      {e.caseNumber && <span className="text-xs text-teal-300">{e.caseNumber}</span>}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      <span className="font-mono">{e.actionName}</span>
                      <span className="mx-2 text-slate-600">·</span>
                      <span>{e.fieldName}</span>
                      <span className="mx-2 text-slate-600">·</span>
                      <span>{new Date(e.createdAt).toLocaleString('es-CL')}</span>
                    </div>
                    <div className="text-xs text-red-300 mt-1 truncate">
                      {e.violatedRules.map((v) => v.ruleName).join(', ')}
                    </div>
                  </div>
                </button>
                {open && (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2 ml-4">
                    <div>
                      <div className="text-[10px] uppercase text-slate-500 font-black">Texto original</div>
                      <div className="text-xs text-white whitespace-pre-wrap break-words mt-1">{e.originalText}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-500 font-black">Texto normalizado</div>
                      <code className="text-xs text-slate-400 whitespace-pre-wrap break-words block mt-1">{e.normalizedText}</code>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-500 font-black">Reglas violadas</div>
                      <ul className="text-xs text-slate-300 mt-1 space-y-1">
                        {e.violatedRules.map((v, i) => (
                          <li key={i}>
                            <span className="text-amber-300">{v.ruleName}</span>{' '}
                            <span className="text-slate-500">({v.ruleType})</span>:{' '}
                            <code className="text-red-300">{v.matchedText}</code>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {entries.length === 0 && (
            <div className="py-12 text-center text-slate-500 text-sm">Sin intentos registrados</div>
          )}
        </div>
      )}
    </div>
  );
}
