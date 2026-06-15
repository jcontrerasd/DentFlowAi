'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Plus,
  Save,
  X,
  Pencil,
  Lock,
  Unlock,
  AlertTriangle,
  DollarSign,
  History,
  Trash2,
  Search,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  Info,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import {
  listPriceRulesAction,
  createPriceRuleAction,
  updatePriceRuleAction,
  setPriceRuleActiveAction,
  deletePriceRuleAction,
  listPendingPriceRequestsAction,
  resolvePendingPriceRequestAction,
  dismissPendingPriceRequestAction,
  type PriceRuleDisplay,
  type PendingPriceRequestDisplay,
} from '@/lib/db/actions/priceRules';
import { filterPriceRules, WILDCARD_FILTER, type PriceRuleSearchQuery } from '@/lib/pricing/priceRuleSearch';
import {
  sortPriceRules,
  togglePriceRuleSort,
  DEFAULT_PRICE_RULE_SORT,
  type PriceRuleSortField,
  type PriceRuleSortState,
} from '@/lib/pricing/priceRuleSort';
import {
  listRestorationTypesAction,
  listDentalMaterialsAction,
  listVitaShadesAction,
  listUrgencyLevelsAction,
  type CatalogOption,
} from '@/lib/db/actions/catalogs';
import { computeSalePrice, resolveListPriceFromRules } from '@/lib/pricing/resolveListPrice';
import {
  validatePriceRuleDimensions,
  normalizeDimensionsOnChange,
  cascadeFieldState,
  formToDimensionInput,
  getPriceRuleHierarchyHints,
  isLegacyInvalidRule,
  type PriceRuleDimensionField,
} from '@/lib/pricing/priceRuleDimensions';
import { formatUchQuoteClp } from '@/lib/uchQuoteDisplay';
import ConfirmSaveModal from '@/components/admin/fauchard/ConfirmSaveModal';
import PriceRuleChangeLog from '@/components/admin/PriceRuleChangeLog';

const WILDCARD = '';

type TabId = 'rules' | 'history';

type RuleFormState = {
  restorationTypeId: string;
  materialId: string;
  shadeId: string;
  urgencyId: string;
  cost: string;
  feePercent: string;
};

type PendingMutation =
  | { kind: 'save' }
  | { kind: 'toggle'; rule: PriceRuleDisplay; nextActive: boolean }
  | { kind: 'delete'; rule: PriceRuleDisplay };

const ALL_FILTER = '';

const emptyForm = (): RuleFormState => ({
  restorationTypeId: WILDCARD,
  materialId: WILDCARD,
  shadeId: WILDCARD,
  urgencyId: WILDCARD,
  cost: '',
  feePercent: '0.15',
});

function dimLabel(label: string | null): string {
  return label ?? '*';
}

export default function AdminPricesPage() {
  const { userProfile } = useAuth();
  const router = useRouter();
  const { showSuccess, showError } = useToast();

  const [activeTab, setActiveTab] = useState<TabId>('rules');
  const [historyRuleId, setHistoryRuleId] = useState<string | null>(null);

  const [rules, setRules] = useState<PriceRuleDisplay[]>([]);
  const [pending, setPending] = useState<PendingPriceRequestDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [restorations, setRestorations] = useState<CatalogOption[]>([]);
  const [materials, setMaterials] = useState<CatalogOption[]>([]);
  const [shades, setShades] = useState<CatalogOption[]>([]);
  const [urgencies, setUrgencies] = useState<CatalogOption[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleFormState>(emptyForm());

  const [resolveModalId, setResolveModalId] = useState<string | null>(null);
  const [resolveCost, setResolveCost] = useState('');
  const [resolveFee, setResolveFee] = useState('0.15');
  const [resolveReason, setResolveReason] = useState('');

  const [reasonModalOpen, setReasonModalOpen] = useState(false);
  const [changeReason, setChangeReason] = useState('');
  const [pendingMutation, setPendingMutation] = useState<PendingMutation | null>(null);
  const [mutationLoading, setMutationLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState<PriceRuleSearchQuery>({ text: '' });
  const [sortState, setSortState] = useState<PriceRuleSortState>(DEFAULT_PRICE_RULE_SORT);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDims, setPreviewDims] = useState({
    restorationTypeId: '',
    urgencyId: '',
    materialId: '',
    shadeId: '',
  });

  useEffect(() => {
    if (userProfile && userProfile.role !== 'admin') router.replace('/dashboard');
  }, [userProfile, router]);

  const load = useCallback(async () => {
    setLoading(true);
    const [rulesRes, pendingRes, rests, mats, shadeList, urgs] = await Promise.all([
      listPriceRulesAction(),
      listPendingPriceRequestsAction(),
      listRestorationTypesAction(),
      listDentalMaterialsAction(),
      listVitaShadesAction(),
      listUrgencyLevelsAction(),
    ]);
    if (rulesRes.success && rulesRes.data) setRules(rulesRes.data);
    else showError(rulesRes.error ?? 'Error cargando reglas');
    if (pendingRes.success && pendingRes.data) setPending(pendingRes.data);
    setRestorations(rests);
    setMaterials(mats);
    setShades(shadeList);
    setUrgencies(urgs);
    setLoading(false);
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  const filteredRules = useMemo(
    () => filterPriceRules(rules, searchQuery),
    [rules, searchQuery],
  );

  const displayedRules = useMemo(
    () => sortPriceRules(filteredRules, sortState),
    [filteredRules, sortState],
  );

  const handleSortColumn = (field: PriceRuleSortField) => {
    setSortState((prev) => togglePriceRuleSort(prev, field));
  };

  const editingRule = useMemo(
    () => (editingId ? rules.find((r) => r.id === editingId) : null),
    [rules, editingId],
  );

  const previewSale = useMemo(() => {
    const cost = parseFloat(form.cost);
    const fee = parseFloat(form.feePercent);
    if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(fee)) return null;
    return computeSalePrice(cost, fee);
  }, [form.cost, form.feePercent]);

  const cascadeState = useMemo(() => cascadeFieldState(form), [form]);

  const dimensionInput = useMemo(() => formToDimensionInput(form), [form]);

  const hierarchyHints = useMemo(
    () => getPriceRuleHierarchyHints(dimensionInput, rules, editingId ?? undefined),
    [dimensionInput, rules, editingId],
  );

  const handleDimensionChange = (field: PriceRuleDimensionField, value: string) => {
    setForm((prev) => ({
      ...prev,
      ...normalizeDimensionsOnChange(field, value, prev),
    }));
  };

  const previewResolution = useMemo(() => {
    const { restorationTypeId, urgencyId, materialId, shadeId } = previewDims;
    if (!restorationTypeId || !urgencyId || !materialId || !shadeId) return null;

    const ruleRows = rules
      .filter((r) => r.isActive && r.id !== editingId)
      .map((r) => ({
        id: r.id,
        code: r.code,
        restorationTypeId: r.restorationTypeId,
        materialId: r.materialId,
        shadeId: r.shadeId,
        urgencyId: r.urgencyId,
        cost: r.cost,
        feePercent: r.feePercent,
        salePrice: r.salePrice,
        sortOrder: r.sortOrder,
        isActive: r.isActive,
      }));

    const dimValidation = validatePriceRuleDimensions(dimensionInput);
    const draftCost = parseFloat(form.cost);
    const draftFee = parseFloat(form.feePercent);
    if (
      dimValidation.ok &&
      Number.isFinite(draftCost) &&
      draftCost > 0 &&
      Number.isFinite(draftFee) &&
      (!editingId || dimValidation.ok)
    ) {
      const draftSale = computeSalePrice(draftCost, draftFee);
      ruleRows.push({
        id: editingId ?? '__draft__',
        code: editingRule?.code ?? 'borrador',
        restorationTypeId: dimensionInput.restorationTypeId ?? null,
        materialId: dimensionInput.materialId ?? null,
        shadeId: dimensionInput.shadeId ?? null,
        urgencyId: dimensionInput.urgencyId ?? null,
        cost: draftCost,
        feePercent: draftFee,
        salePrice: draftSale,
        sortOrder: editingRule?.sortOrder ?? 0,
        isActive: true,
      });
    }

    return resolveListPriceFromRules(ruleRows, {
      restorationTypeId,
      materialId,
      shadeId,
      urgencyId,
    });
  }, [previewDims, rules, dimensionInput, form.cost, form.feePercent, editingId, editingRule]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (rule: PriceRuleDisplay) => {
    setEditingId(rule.id);
    setForm({
      restorationTypeId: rule.restorationTypeId ?? WILDCARD,
      materialId: rule.materialId ?? WILDCARD,
      shadeId: rule.shadeId ?? WILDCARD,
      urgencyId: rule.urgencyId ?? WILDCARD,
      cost: String(rule.cost),
      feePercent: String(rule.feePercent),
    });
    setFormOpen(true);
  };

  const buildInput = () => ({
    restorationTypeId: form.restorationTypeId || null,
    materialId: form.materialId || null,
    shadeId: form.shadeId || null,
    urgencyId: form.urgencyId || null,
    cost: parseFloat(form.cost),
    feePercent: parseFloat(form.feePercent),
  });

  const requestSave = () => {
    const dimResult = validatePriceRuleDimensions(buildInput());
    if (!dimResult.ok) {
      showError(dimResult.error);
      return;
    }
    const cost = parseFloat(form.cost);
    const fee = parseFloat(form.feePercent);
    if (!Number.isFinite(cost) || cost <= 0) {
      showError('El costo debe ser mayor a 0');
      return;
    }
    if (!Number.isFinite(fee) || fee < 0 || fee > 0.5) {
      showError('El fee debe estar entre 0% y 50%');
      return;
    }
    setPendingMutation({ kind: 'save' });
    setChangeReason('');
    setReasonModalOpen(true);
  };

  const requestToggle = (rule: PriceRuleDisplay) => {
    setPendingMutation({ kind: 'toggle', rule, nextActive: !rule.isActive });
    setChangeReason('');
    setReasonModalOpen(true);
  };

  const requestDelete = (rule: PriceRuleDisplay) => {
    setPendingMutation({ kind: 'delete', rule });
    setChangeReason('');
    setReasonModalOpen(true);
  };

  const clearSearch = () => {
    setSearchQuery({ text: '' });
  };

  const closeReasonModal = () => {
    setReasonModalOpen(false);
    setPendingMutation(null);
    setChangeReason('');
  };

  const executeMutation = async () => {
    if (!pendingMutation) return;
    setMutationLoading(true);
    try {
      if (pendingMutation.kind === 'save') {
        const input = buildInput();
        const res = editingId
          ? await updatePriceRuleAction(editingId, input, changeReason)
          : await createPriceRuleAction(input, changeReason);
        if (res.success) {
          showSuccess(editingId ? 'Regla actualizada' : 'Regla creada');
          setFormOpen(false);
          setEditingId(null);
          closeReasonModal();
          load();
        } else {
          showError(res.error ?? 'Error guardando');
        }
      } else if (pendingMutation.kind === 'toggle') {
        const res = await setPriceRuleActiveAction(
          pendingMutation.rule.id,
          pendingMutation.nextActive,
          changeReason,
        );
        if (res.success) {
          showSuccess(pendingMutation.nextActive ? 'Tarifa desbloqueada' : 'Tarifa bloqueada');
          closeReasonModal();
          load();
        } else {
          showError(res.error ?? 'Error al cambiar estado');
        }
      } else if (pendingMutation.kind === 'delete') {
        const res = await deletePriceRuleAction(pendingMutation.rule.id, changeReason);
        if (res.success) {
          showSuccess('Regla eliminada');
          closeReasonModal();
          load();
        } else {
          showError(res.error ?? 'Error eliminando regla');
        }
      }
    } finally {
      setMutationLoading(false);
    }
  };

  const handleResolvePending = async () => {
    if (!resolveModalId) return;
    const cost = parseFloat(resolveCost);
    const feePercent = parseFloat(resolveFee);
    const res = await resolvePendingPriceRequestAction(
      resolveModalId,
      { cost, feePercent },
      resolveReason,
    );
    if (res.success) {
      showSuccess('Precio definido y regla creada');
      setResolveModalId(null);
      setResolveCost('');
      setResolveFee('0.15');
      setResolveReason('');
      load();
    } else {
      showError(res.error ?? 'Error resolviendo');
    }
  };

  const handleDismiss = async (id: string) => {
    const res = await dismissPendingPriceRequestAction(id);
    if (res.success) load();
    else showError(res.error ?? 'Error');
  };

  const openRuleHistory = (ruleId: string) => {
    setHistoryRuleId(ruleId);
    setActiveTab('history');
  };

  const reasonModalTitle = useMemo(() => {
    if (!pendingMutation) return 'Confirmar cambio';
    if (pendingMutation.kind === 'save') {
      return editingId ? 'Confirmar edición de tarifa' : 'Confirmar nueva tarifa';
    }
    if (pendingMutation.kind === 'delete') {
      return 'Confirmar eliminación de tarifa';
    }
    return pendingMutation.nextActive ? 'Confirmar desbloqueo' : 'Confirmar bloqueo';
  }, [pendingMutation, editingId]);

  const reasonModalDescription = useMemo(() => {
    if (!pendingMutation) return '';
    if (pendingMutation.kind === 'save') {
      return 'El cambio quedará registrado en el historial de auditoría de precios.';
    }
    if (pendingMutation.kind === 'delete') {
      return `Se eliminará la regla ${pendingMutation.rule.code}. Los casos ya publicados conservan su snapshot de precio.`;
    }
    return pendingMutation.nextActive
      ? 'La tarifa volverá a estar disponible para casos nuevos.'
      : 'La tarifa dejará de aplicarse a casos nuevos. Los casos ya publicados conservan su snapshot.';
  }, [pendingMutation]);

  const renderCascadeDimSelect = (
    label: string,
    field: PriceRuleDimensionField,
    value: string,
    options: CatalogOption[],
    opts?: { required?: boolean; disabled?: boolean; hideWildcard?: boolean },
  ) => (
    <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-widest text-faint font-bold">
        {label}
        {opts?.required ? ' *' : ''}
      </label>
      <select
        value={value}
        disabled={opts?.disabled}
        onChange={(e) => handleDimensionChange(field, e.target.value)}
        className="w-full bg-surface border border-divider rounded-lg px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {!opts?.hideWildcard && <option value={WILDCARD}>Cualquiera (*)</option>}
        {opts?.required && !value && (
          <option value="" disabled>
            Seleccionar…
          </option>
        )}
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </div>
  );

  const renderLabelFilter = (
    label: string,
    value: string | undefined,
    options: CatalogOption[],
    onChange: (v: string) => void,
  ) => (
    <div className="space-y-1 min-w-[120px]">
      <label className="text-[9px] uppercase tracking-widest text-faint font-bold">{label}</label>
      <select
        value={value ?? ALL_FILTER}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface border border-divider rounded-lg px-2 py-1.5 text-xs"
      >
        <option value={ALL_FILTER}>Todas</option>
        <option value={WILDCARD_FILTER}>Comodín (*)</option>
        {options.map((o) => (
          <option key={o.id} value={o.label}>{o.label}</option>
        ))}
      </select>
    </div>
  );

  const renderSortableHeader = (label: string, field: PriceRuleSortField) => {
    const isActive = sortState.field === field;
    return (
      <th className="py-2 pr-3">
        <button
          type="button"
          onClick={() => handleSortColumn(field)}
          className={`inline-flex items-center gap-1 font-bold uppercase tracking-widest transition-colors hover:text-foreground ${
            isActive ? 'text-primary' : 'text-faint'
          }`}
        >
          <span>{label}</span>
          <span className="inline-flex flex-col -space-y-1">
            <ArrowUp
              className={`w-3 h-3 shrink-0 ${
                isActive && sortState.direction === 'asc' ? 'text-primary' : 'opacity-30'
              }`}
            />
            <ArrowDown
              className={`w-3 h-3 shrink-0 ${
                isActive && sortState.direction === 'desc' ? 'text-primary' : 'opacity-30'
              }`}
            />
          </span>
        </button>
      </th>
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-10 space-y-8">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/admin" className="p-2 bg-surface border border-divider rounded-xl text-muted hover:text-primary">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-primary" /> Mantenedor de precios
          </h1>
          <p className="text-xs text-faint">
            Reglas por combinación de dimensiones · auditoría con motivo obligatorio · bloquear impide usar la tarifa en casos nuevos
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-divider">
        <button
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 -mb-px transition-colors ${
            activeTab === 'rules'
              ? 'border-primary text-primary'
              : 'border-transparent text-faint hover:text-foreground'
          }`}
        >
          Reglas
        </button>
        <button
          onClick={() => { setActiveTab('history'); }}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
            activeTab === 'history'
              ? 'border-primary text-primary'
              : 'border-transparent text-faint hover:text-foreground'
          }`}
        >
          <History className="w-3.5 h-3.5" /> Historial
        </button>
      </div>

      {activeTab === 'history' ? (
        <section className="bg-surface/40 border border-divider rounded-3xl p-5">
          <PriceRuleChangeLog
            ruleId={historyRuleId}
            onClearRuleFilter={() => setHistoryRuleId(null)}
          />
        </section>
      ) : (
        <>
          {pending.length > 0 && (
            <section className="bg-warning-hl/40 border-2 border-warning/40 rounded-3xl p-5 space-y-4">
              <div className="flex items-center gap-2 text-warning">
                <AlertTriangle className="w-5 h-5" />
                <h2 className="text-sm font-black uppercase tracking-wider">
                  Combinaciones pendientes ({pending.length})
                </h2>
              </div>
              <p className="text-xs text-muted">
                Casos creados sin precio de lista. Define costo y fee para activar la tarifa.
              </p>
              <div className="space-y-3">
                {pending.map((req) => (
                  <div
                    key={req.id}
                    className="flex flex-wrap items-center justify-between gap-3 bg-background/80 border border-warning/20 rounded-2xl p-4"
                  >
                    <div className="text-sm space-y-1">
                      <p className="font-semibold">
                        {req.restorationLabel} · {req.materialLabel} · {req.shadeLabel} · {req.urgencyLabel}
                      </p>
                      <p className="text-xs text-faint">
                        Caso{' '}
                        <Link
                          href={`/dashboard/cases/${req.caseId}`}
                          className="text-primary hover:underline font-mono"
                        >
                          {req.caseNumber ?? req.caseId.slice(0, 8)}
                        </Link>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setResolveModalId(req.id);
                          setResolveCost('');
                          setResolveFee('0.15');
                          setResolveReason('');
                        }}
                        className="px-4 py-2 bg-primary-hl border border-primary/30 rounded-xl text-primary text-xs font-bold"
                      >
                        Definir precio
                      </button>
                      <button
                        onClick={() => handleDismiss(req.id)}
                        className="px-4 py-2 border border-divider rounded-xl text-muted text-xs font-bold hover:text-foreground"
                      >
                        Descartar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="bg-surface/40 border border-divider rounded-3xl p-5 space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-3">
              <span className="text-[10px] uppercase tracking-widest text-faint font-black">
                {displayedRules.length} de {rules.length} reglas
              </span>
              <button
                onClick={openCreate}
                className="flex items-center gap-2 px-3 py-2 bg-primary-hl border border-primary/30 rounded-xl text-primary text-xs font-bold"
              >
                <Plus className="w-4 h-4" /> Nueva regla
              </button>
            </div>

            <div className="space-y-3 p-4 bg-background/60 border border-divider rounded-2xl">
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-[200px] space-y-1">
                  <label className="text-[9px] uppercase tracking-widest text-faint font-bold">Buscar</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                    <input
                      type="text"
                      value={searchQuery.text ?? ''}
                      onChange={(e) => setSearchQuery((q) => ({ ...q, text: e.target.value }))}
                      placeholder="Código, restauración, material, color, urgencia…"
                      className="w-full bg-surface border border-divider rounded-lg pl-9 pr-3 py-2 text-sm"
                    />
                  </div>
                </div>
                {renderLabelFilter('Restauración', searchQuery.restorationLabel, restorations, (v) =>
                  setSearchQuery((q) => ({ ...q, restorationLabel: v || undefined })))}
                {renderLabelFilter('Material', searchQuery.materialLabel, materials, (v) =>
                  setSearchQuery((q) => ({ ...q, materialLabel: v || undefined })))}
                {renderLabelFilter('Color', searchQuery.shadeLabel, shades, (v) =>
                  setSearchQuery((q) => ({ ...q, shadeLabel: v || undefined })))}
                {renderLabelFilter('Urgencia', searchQuery.urgencyLabel, urgencies, (v) =>
                  setSearchQuery((q) => ({ ...q, urgencyLabel: v || undefined })))}
                {(searchQuery.text || searchQuery.restorationLabel || searchQuery.materialLabel || searchQuery.shadeLabel || searchQuery.urgencyLabel) && (
                  <button
                    onClick={clearSearch}
                    className="px-3 py-2 text-xs font-bold text-muted hover:text-foreground border border-divider rounded-lg"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>

            {formOpen && (
              <div className="bg-background border border-divider rounded-2xl p-4 space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-muted">
                  {editingId ? 'Editar regla' : 'Nueva regla'}
                </h3>
                {editingRule && (
                  <p className="text-xs text-faint">
                    Código: <span className="font-mono font-bold text-primary">{editingRule.code}</span>
                    {editingRule.linkedCaseCount > 0 && (
                      <span className="ml-2 text-warning">
                        · {editingRule.linkedCaseCount} caso(s) vinculado(s)
                      </span>
                    )}
                  </p>
                )}
                <p className="text-[10px] text-faint">
                  Orden de dimensiones: Restauración → Urgencia → Material → Color (sin saltar niveles).
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {renderCascadeDimSelect('Restauración', 'restorationTypeId', form.restorationTypeId, restorations, {
                    required: true,
                    hideWildcard: true,
                  })}
                  {renderCascadeDimSelect('Urgencia', 'urgencyId', form.urgencyId, urgencies, {
                    disabled: cascadeState.urgency.disabled,
                  })}
                  {renderCascadeDimSelect('Material', 'materialId', form.materialId, materials, {
                    disabled: cascadeState.material.disabled,
                  })}
                  {renderCascadeDimSelect('Color', 'shadeId', form.shadeId, shades, {
                    disabled: cascadeState.shade.disabled,
                  })}
                </div>

                {(hierarchyHints.lessSpecific.length > 0 || hierarchyHints.moreSpecific.length > 0) && (
                  <div className="flex gap-2 p-3 rounded-xl bg-primary-hl/30 border border-primary/20 text-xs text-muted">
                    <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      {hierarchyHints.moreSpecific.length > 0 && (
                        <p>
                          {hierarchyHints.moreSpecific.length} regla(s) más específica(s) tendrán prioridad en algunas
                          combinaciones
                          {hierarchyHints.moreSpecific.length <= 3
                            ? `: ${hierarchyHints.moreSpecific.map((h) => h.code).join(', ')}`
                            : ` (ej. ${hierarchyHints.moreSpecific.slice(0, 3).map((h) => h.code).join(', ')}…)`}
                          .
                        </p>
                      )}
                      {hierarchyHints.lessSpecific.length > 0 && (
                        <p>
                          Esta regla reemplazará a {hierarchyHints.lessSpecific.length} regla(s) más general(es) cuando
                          calce
                          {hierarchyHints.lessSpecific.length <= 3
                            ? `: ${hierarchyHints.lessSpecific.map((h) => h.code).join(', ')}`
                            : ` (ej. ${hierarchyHints.lessSpecific.slice(0, 3).map((h) => h.code).join(', ')}…)`}
                          .
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="border border-divider rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setPreviewOpen((o) => !o)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted hover:bg-surface-2"
                  >
                    {previewOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    Probar combinación
                  </button>
                  {previewOpen && (
                    <div className="p-3 border-t border-divider space-y-3 bg-background/50">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase tracking-widest text-faint font-bold">Restauración</label>
                          <select
                            value={previewDims.restorationTypeId}
                            onChange={(e) => setPreviewDims((p) => ({ ...p, restorationTypeId: e.target.value }))}
                            className="w-full bg-surface border border-divider rounded-lg px-2 py-1.5 text-xs"
                          >
                            <option value="">—</option>
                            {restorations.map((o) => (
                              <option key={o.id} value={o.id}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase tracking-widest text-faint font-bold">Urgencia</label>
                          <select
                            value={previewDims.urgencyId}
                            onChange={(e) => setPreviewDims((p) => ({ ...p, urgencyId: e.target.value }))}
                            className="w-full bg-surface border border-divider rounded-lg px-2 py-1.5 text-xs"
                          >
                            <option value="">—</option>
                            {urgencies.map((o) => (
                              <option key={o.id} value={o.id}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase tracking-widest text-faint font-bold">Material</label>
                          <select
                            value={previewDims.materialId}
                            onChange={(e) => setPreviewDims((p) => ({ ...p, materialId: e.target.value }))}
                            className="w-full bg-surface border border-divider rounded-lg px-2 py-1.5 text-xs"
                          >
                            <option value="">—</option>
                            {materials.map((o) => (
                              <option key={o.id} value={o.id}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase tracking-widest text-faint font-bold">Color</label>
                          <select
                            value={previewDims.shadeId}
                            onChange={(e) => setPreviewDims((p) => ({ ...p, shadeId: e.target.value }))}
                            className="w-full bg-surface border border-divider rounded-lg px-2 py-1.5 text-xs"
                          >
                            <option value="">—</option>
                            {shades.map((o) => (
                              <option key={o.id} value={o.id}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {previewResolution ? (
                        <p className="text-sm">
                          Regla ganadora:{' '}
                          <span className="font-mono font-bold text-primary">
                            {previewResolution.ruleCode ?? previewResolution.ruleId.slice(0, 8)}
                          </span>
                          {' · '}
                          <span className="font-semibold text-primary">
                            {formatUchQuoteClp(previewResolution.salePrice)}
                          </span>
                        </p>
                      ) : (
                        <p className="text-xs text-faint">Selecciona las cuatro dimensiones para ver qué regla aplica.</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-widest text-faint font-bold">Costo (CLP)</label>
                    <input
                      type="number"
                      min="1"
                      value={form.cost}
                      onChange={(e) => setForm({ ...form, cost: e.target.value })}
                      className="w-full bg-surface border border-divider rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-widest text-faint font-bold">
                      Fee (decimal, ej. 0.15 = 15%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="0.5"
                      step="0.01"
                      value={form.feePercent}
                      onChange={(e) => setForm({ ...form, feePercent: e.target.value })}
                      className="w-full bg-surface border border-divider rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-widest text-faint font-bold">
                      Precio venta (calculado)
                    </label>
                    <p className="px-3 py-2 text-lg font-bold text-primary">
                      {previewSale != null ? formatUchQuoteClp(previewSale) : '—'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => { setFormOpen(false); setEditingId(null); }}
                    className="px-4 py-2 text-muted text-xs font-bold flex items-center gap-1"
                  >
                    <X className="w-4 h-4" /> Cancelar
                  </button>
                  <button
                    onClick={requestSave}
                    className="px-4 py-2 bg-primary-hl border border-primary/30 rounded-xl text-primary text-xs font-bold flex items-center gap-1"
                  >
                    <Save className="w-4 h-4" /> Guardar
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <p className="text-sm text-faint">Cargando...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] border-b border-divider">
                      {renderSortableHeader('Código', 'code')}
                      {renderSortableHeader('Restauración', 'restoration')}
                      {renderSortableHeader('Material', 'material')}
                      {renderSortableHeader('Color', 'shade')}
                      {renderSortableHeader('Urgencia', 'urgency')}
                      {renderSortableHeader('Costo', 'cost')}
                      {renderSortableHeader('Fee', 'fee')}
                      {renderSortableHeader('Venta', 'sale')}
                      {renderSortableHeader('Estado', 'status')}
                      <th className="py-2 text-[10px] uppercase tracking-widest text-faint font-bold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedRules.map((rule) => (
                      <tr key={rule.id} className={`border-b border-divider/50 ${!rule.isActive ? 'opacity-60' : ''}`}>
                        <td className="py-3 pr-3 font-mono text-xs font-bold text-primary">
                          <span>{rule.code}</span>
                          {isLegacyInvalidRule({
                            restorationTypeId: rule.restorationTypeId,
                            urgencyId: rule.urgencyId,
                            materialId: rule.materialId,
                            shadeId: rule.shadeId,
                          }) && (
                            <span
                              className="ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase bg-warning-hl text-warning"
                              title="Dimensiones fuera del modelo actual (Restauración → Urgencia → Material → Color). Editar para corregir."
                            >
                              Revisar
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-3">{dimLabel(rule.restorationLabel)}</td>
                        <td className="py-3 pr-3">{dimLabel(rule.materialLabel)}</td>
                        <td className="py-3 pr-3">{dimLabel(rule.shadeLabel)}</td>
                        <td className="py-3 pr-3">{dimLabel(rule.urgencyLabel)}</td>
                        <td className="py-3 pr-3 font-mono text-xs">{formatUchQuoteClp(rule.cost)}</td>
                        <td className="py-3 pr-3 font-mono text-xs">{(rule.feePercent * 100).toFixed(1)}%</td>
                        <td className="py-3 pr-3 font-semibold text-primary">{formatUchQuoteClp(rule.salePrice)}</td>
                        <td className="py-3 pr-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              rule.isActive ? 'bg-success-hl text-success' : 'bg-surface-2 text-faint'
                            }`}
                          >
                            {rule.isActive ? 'Activa' : 'Bloqueada'}
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              onClick={() => openEdit(rule)}
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-divider hover:bg-surface-2 text-muted text-xs font-bold"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Editar</span>
                            </button>
                            <button
                              onClick={() => requestToggle(rule)}
                              className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-bold ${
                                rule.isActive
                                  ? 'border-warning/30 text-warning hover:bg-warning-hl'
                                  : 'border-success/30 text-success hover:bg-success-hl'
                              }`}
                            >
                              {rule.isActive ? (
                                <>
                                  <Lock className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">Bloquear</span>
                                </>
                              ) : (
                                <>
                                  <Unlock className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">Desbloquear</span>
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => openRuleHistory(rule.id)}
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-divider hover:bg-surface-2 text-muted text-xs font-bold"
                            >
                              <History className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Historial</span>
                            </button>
                            <button
                              onClick={() => requestDelete(rule)}
                              disabled={rule.linkedCaseCount > 0}
                              title={
                                rule.linkedCaseCount > 0
                                  ? `${rule.linkedCaseCount} caso(s) usan esta regla — solo editar o bloquear`
                                  : 'Eliminar regla'
                              }
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed border-error/30 text-error hover:bg-error-hl"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Eliminar</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {displayedRules.length === 0 && (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-faint">
                          {rules.length === 0 ? 'Sin reglas definidas' : 'Ninguna regla coincide con la búsqueda'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <ConfirmSaveModal
        isOpen={reasonModalOpen}
        onClose={closeReasonModal}
        onConfirm={() => void executeMutation()}
        title={reasonModalTitle}
        description={reasonModalDescription}
        isLoading={mutationLoading}
        requireReason
        reasonValue={changeReason}
        onReasonChange={setChangeReason}
      />

      {resolveModalId && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="bg-surface border border-divider rounded-2xl p-6 w-full max-w-md space-y-4 shadow-xl">
            <h3 className="font-bold">Definir precio para combinación pendiente</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-faint font-bold">Costo (CLP)</label>
                <input
                  type="number"
                  min="1"
                  value={resolveCost}
                  onChange={(e) => setResolveCost(e.target.value)}
                  className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-faint font-bold">Fee (0.15 = 15%)</label>
                <input
                  type="number"
                  min="0"
                  max="0.5"
                  step="0.01"
                  value={resolveFee}
                  onChange={(e) => setResolveFee(e.target.value)}
                  className="w-full bg-background border border-divider rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase text-faint font-bold">Motivo del cambio (obligatorio)</label>
              <textarea
                value={resolveReason}
                onChange={(e) => setResolveReason(e.target.value)}
                rows={3}
                placeholder="Ej: tarifa acordada para nueva combinación solicitada por caso DF-XXXX"
                className="w-full rounded-xl bg-background border border-divider p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setResolveModalId(null);
                  setResolveReason('');
                }}
                className="px-4 py-2 text-muted text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleResolvePending()}
                disabled={!resolveReason.trim()}
                className="px-4 py-2 bg-primary text-inverse rounded-xl text-sm font-bold disabled:opacity-50"
              >
                Crear regla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
