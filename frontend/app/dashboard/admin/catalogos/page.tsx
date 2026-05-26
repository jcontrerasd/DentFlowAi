'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowDown, ArrowUp, Eye, EyeOff, Plus, Save, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import {
  listAllCatalogOptionsAction,
  createCatalogOptionAction,
  updateCatalogOptionAction,
  setCatalogOptionActiveAction,
  reorderCatalogOptionsAction,
  type CatalogOption,
  type CatalogTableKey,
} from '@/lib/db/actions/catalogs';

type TabDef = { key: CatalogTableKey; label: string };

const TABS: TabDef[] = [
  { key: 'vita_shade', label: 'Colores VITA' },
  { key: 'restoration_type', label: 'Restauraciones' },
  { key: 'dental_material', label: 'Materiales' },
  { key: 'urgency_level', label: 'Urgencias' },
];

export default function AdminCatalogosPage() {
  const { userProfile } = useAuth();
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const [activeTab, setActiveTab] = useState<CatalogTableKey>('vita_shade');
  const [rows, setRows] = useState<CatalogOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  useEffect(() => {
    if (userProfile && userProfile.role !== 'admin') router.replace('/dashboard');
  }, [userProfile, router]);

  const load = useCallback(async (key: CatalogTableKey) => {
    setLoading(true);
    const res = await listAllCatalogOptionsAction(key);
    if (res.success && res.data) setRows(res.data);
    else {
      showError(res.error ?? 'Error cargando catálogo');
      setRows([]);
    }
    setLoading(false);
  }, [showError]);

  useEffect(() => { load(activeTab); }, [activeTab, load]);

  const handleCreate = async () => {
    const label = newLabel.trim();
    if (!label) {
      showError('Etiqueta requerida');
      return;
    }
    const res = await createCatalogOptionAction(activeTab, { label });
    if (res.success) {
      showSuccess('Opción creada');
      setNewLabel(''); setNewOpen(false);
      load(activeTab);
    } else {
      showError(res.error ?? 'Error creando');
    }
  };

  const handleSaveLabel = async (id: string) => {
    const label = editLabel.trim();
    if (!label) return;
    const res = await updateCatalogOptionAction(activeTab, id, { label });
    if (res.success) {
      showSuccess('Actualizado');
      setEditingId(null);
      load(activeTab);
    } else {
      showError(res.error ?? 'Error actualizando');
    }
  };

  const handleToggleActive = async (row: CatalogOption) => {
    const res = await setCatalogOptionActiveAction(activeTab, row.id, !row.isActive);
    if (res.success) load(activeTab);
    else showError(res.error ?? 'Error');
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
    const res = await reorderCatalogOptionsAction(activeTab, next.map((r) => r.id));
    if (!res.success) {
      showError(res.error ?? 'Error reordenando');
      load(activeTab);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-10 space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/admin"
          className="p-2 bg-surface border border-divider rounded-xl text-muted hover:text-primary"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tighter">Catálogos UI</h1>
          <p className="text-xs text-faint">Listas desplegables del wizard de creación de casos</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${
              activeTab === t.key
                ? 'bg-primary-hl border-primary/30 text-primary'
                : 'bg-surface border-divider text-muted hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-surface/40 border border-divider rounded-3xl p-5 space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-[10px] uppercase tracking-widest text-faint font-black">
            {rows.length} opciones
          </span>
          <button
            onClick={() => setNewOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 bg-primary-hl border border-primary/30 rounded-xl text-primary text-xs font-bold hover:bg-primary-hl"
          >
            <Plus className="w-4 h-4" /> Agregar opción
          </button>
        </div>

        {newOpen && (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-center bg-background border border-divider rounded-2xl p-3">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Etiqueta visible"
              className="bg-surface border border-divider rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                className="px-3 py-2 bg-primary-hl border border-primary/30 rounded-lg text-primary text-xs font-bold"
              >
                Guardar
              </button>
              <button
                onClick={() => { setNewOpen(false); setNewLabel(''); }}
                className="px-3 py-2 bg-surface-2 rounded-lg text-muted text-xs"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-faint text-sm">Cargando…</div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {rows.map((row, index) => {
              const isEditing = editingId === row.id;
              return (
                <div
                  key={row.id}
                  className={`flex items-center gap-3 py-3 ${row.isActive ? '' : 'opacity-50'}`}
                >
                  <div className="flex flex-col">
                    <button
                      onClick={() => handleMove(index, -1)}
                      disabled={index === 0}
                      className="text-faint hover:text-primary disabled:opacity-30"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleMove(index, 1)}
                      disabled={index === rows.length - 1}
                      className="text-faint hover:text-primary disabled:opacity-30"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="w-8 text-[10px] text-faint font-mono">{row.sortOrder}</span>
                  <span className="w-24 font-mono text-xs text-faint truncate" title="Código opaco (system-generated)">{row.code}</span>
                  <div className="flex-1">
                    {isEditing ? (
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="w-full bg-background border border-primary/30 rounded-lg px-3 py-1.5 text-sm"
                      />
                    ) : (
                      <span className="text-sm">{row.label}</span>
                    )}
                  </div>
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => handleSaveLabel(row.id)}
                        className="p-2 text-primary hover:bg-primary-hl rounded-lg"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-2 text-faint hover:bg-surface-2 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setEditingId(row.id); setEditLabel(row.label); }}
                      className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-muted hover:text-primary font-black"
                    >
                      Editar
                    </button>
                  )}
                  <button
                    onClick={() => handleToggleActive(row)}
                    className={`p-2 rounded-lg ${
                      row.isActive ? 'text-primary hover:bg-primary-hl' : 'text-faint hover:bg-surface-2'
                    }`}
                    title={row.isActive ? 'Desactivar' : 'Activar'}
                  >
                    {row.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>
              );
            })}
            {rows.length === 0 && (
              <div className="py-12 text-center text-faint text-sm">Sin opciones</div>
            )}
          </div>
        )}
      </div>

      <p className="text-[10px] text-faint leading-relaxed">
        Las opciones desactivadas dejan de aparecer en los selectores nuevos, pero los casos legacy que las usaban siguen mostrando el valor guardado.
      </p>
    </div>
  );
}
