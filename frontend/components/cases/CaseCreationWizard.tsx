'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Stethoscope,
  Upload,
  ArrowRight,
  Save,
  CheckCircle2,
  Trash2,
  Palette,
  ChevronLeft,
  DollarSign,
  AlertTriangle,
  X,
} from 'lucide-react';
import { TeethSelector } from './TeethSelector';
import {
  SERVICE_TYPES,
  WORK_CATEGORY_LABELS,
  WORK_TYPE_LABELS,
  type ServiceType,
} from '@/lib/constants/dental';
import { resolveScenario } from '@/lib/fauchard/caseWorkType';
import {
  listVitaShadesAction,
  listRestorationTypesAction,
  listDentalMaterialsAction,
  listUrgencyLevelsAction,
  type CatalogOption,
} from '@/lib/db/actions/catalogs';
import { resolveListPriceAction } from '@/lib/db/actions/priceRules';
import { formatUchQuoteClp } from '@/lib/uchQuoteDisplay';
import { defaultDesiredDeliveryLocal, isDesiredDeliveryValid } from '@/lib/desiredDelivery';
import { DesiredDeliveryPicker } from './DesiredDeliveryPicker';
import STLThumbnail from './STLThumbnail';


export interface CaseFormData {
  internalName: string;
  patientIdAnon: string;
  urgency: string;
  teeth: number[];
  restorationType: string;
  material: string;
  shade: string;
  notesOclusal: string;
  notesEsthetic: string;
  doctorNotes: string;
  /** Fecha/hora de entrega deseada (valor local yyyy-MM-ddTHH:mm). */
  desiredDeliveryAt: string;
  /** Tipo de servicio del caso (siempre solo_diseno). */
  serviceType: ServiceType;
  /** v5.13 — ¿El caso reemplaza dientes ausentes (pónticos)? */
  replacesMissingTeeth: boolean | null;
}

export interface CaseFiles {
  superior: File | null;
  inferior: File | null;
  bite: File | null;
  lateralDerecho: File | null;
  lateralIzquierdo: File | null;
  complementary: File[];
}

const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_FILE_EXTENSIONS = ['stl', 'ply', 'obj', 'jpg', 'jpeg', 'png'];
const THREE_D_EXTENSIONS = ['stl', 'ply', 'obj'];

/** Slots de escaneo 3D del wizard, en orden de presentación. */
export const SCAN_SLOTS = ['superior', 'inferior', 'bite', 'lateralDerecho', 'lateralIzquierdo'] as const;
const SCAN_SLOT_LABELS: Record<(typeof SCAN_SLOTS)[number], string> = {
  superior: 'Arcada Superior',
  inferior: 'Arcada Inferior',
  bite: 'Registro Mordida',
  lateralDerecho: 'Lateral Derecho',
  lateralIzquierdo: 'Lateral Izquierdo',
};

const isThreeDFile = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return THREE_D_EXTENSIONS.includes(ext);
};


const isAllowedExtension = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return ALLOWED_FILE_EXTENSIONS.includes(ext);
};

interface CaseCreationWizardProps {
  onComplete: (data: CaseFormData, files: CaseFiles, thumbnails: Record<string, string>) => Promise<void>;
  loading: boolean;
  /** Progreso de subida 0-100; null/undefined mientras no hay subida en curso. */
  uploadProgress?: number | null;
  initialData?: Partial<CaseFormData>;
}


const DRAFT_KEY = 'df_case_wizard_draft';

export const CaseCreationWizard: React.FC<CaseCreationWizardProps> = ({ onComplete, loading, uploadProgress, initialData }) => {
  const [step, setStep] = useState(1);

  const getInitialFormData = (): CaseFormData => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem(DRAFT_KEY);
        if (saved) return { ...JSON.parse(saved), ...initialData };
      } catch {}
    }
    const initialServiceType: ServiceType = SERVICE_TYPES.SOLO_DISENO;
    return {
      internalName: initialData?.internalName || '',
      patientIdAnon: initialData?.patientIdAnon || '',
      urgency: initialData?.urgency || 'Normal',
      teeth: initialData?.teeth || [],
      restorationType: initialData?.restorationType || '',
      material: initialData?.material || '',
      shade: initialData?.shade || '',
      notesOclusal: initialData?.notesOclusal || '',
      notesEsthetic: initialData?.notesEsthetic || '',
      doctorNotes: initialData?.doctorNotes || '',
      desiredDeliveryAt: initialData?.desiredDeliveryAt || defaultDesiredDeliveryLocal(),
      serviceType: initialServiceType,
      replacesMissingTeeth: initialData?.replacesMissingTeeth ?? null,
    };
  };

  const [formData, setFormDataRaw] = useState<CaseFormData>(getInitialFormData);

  const setFormData = (updater: CaseFormData | ((prev: CaseFormData) => CaseFormData)) => {
    setFormDataRaw((prev) => {
      const next = typeof updater === 'function' ? (updater as (p: CaseFormData) => CaseFormData)(prev) : updater;
      return { ...next };
    });
  };

  // Persistir en sessionStorage al cambiar
  useEffect(() => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(formData)); } catch {}
  }, [formData]);

  const [files, setFiles] = useState<CaseFiles>({
    superior: null,
    inferior: null,
    bite: null,
    lateralDerecho: null,
    lateralIzquierdo: null,
    complementary: [],
  });
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState<string | null>(null);

  // Catálogos UI cargados desde DB (vita_shade, restoration_type, dental_material, urgency_level)
  const [vitaShades, setVitaShades] = useState<CatalogOption[]>([]);
  const [restorationTypes, setRestorationTypes] = useState<CatalogOption[]>([]);
  const [dentalMaterials, setDentalMaterials] = useState<CatalogOption[]>([]);
  const [urgencyLevels, setUrgencyLevels] = useState<CatalogOption[]>([]);
  const [listPriceSale, setListPriceSale] = useState<number | null>(null);
  const [listPriceLoading, setListPriceLoading] = useState(false);
  const [listPriceChecked, setListPriceChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [shades, restorations, materials, urgencies] = await Promise.all([
        listVitaShadesAction(),
        listRestorationTypesAction(),
        listDentalMaterialsAction(),
        listUrgencyLevelsAction(),
      ]);
      if (cancelled) return;
      setVitaShades(shades);
      setRestorationTypes(restorations);
      setDentalMaterials(materials);
      setUrgencyLevels(urgencies);
      // Defaults para selects que requieren valor (validación de step 1/3).
      setFormDataRaw((prev) => ({
        ...prev,
        restorationType: prev.restorationType || restorations[0]?.code || '',
        shade: prev.shade || shades[0]?.code || '',
      }));
    })();
    return () => { cancelled = true; };
  }, []);

  // Resolver precio de lista cuando las 4 dimensiones están definidas (paso 3+).
  useEffect(() => {
    const { restorationType, material, shade, urgency } = formData;
    if (!restorationType || !material || !shade || !urgency) {
      setListPriceSale(null);
      setListPriceChecked(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setListPriceLoading(true);
      const res = await resolveListPriceAction({
        restorationType,
        material,
        shade,
        urgency,
      });
      if (cancelled) return;
      setListPriceLoading(false);
      setListPriceChecked(true);
      if (res.success) {
        setListPriceSale(res.data?.salePrice ?? null);
      } else {
        setListPriceSale(null);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [formData.restorationType, formData.material, formData.shade, formData.urgency]);


  const handleFileChange = (key: keyof CaseFiles, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];

      if (!isAllowedExtension(selectedFile.name)) {
        setFileError('Extension no permitida. Usa .stl, .ply, .obj, .jpg, .jpeg o .png.');
        e.currentTarget.value = '';
        return;
      }

      if (selectedFile.size > MAX_UPLOAD_SIZE_BYTES) {
        setFileError('Archivo demasiado grande. El limite por archivo es 20MB.');
        e.currentTarget.value = '';
        return;
      }

      const scanSlots = SCAN_SLOTS.filter(k => k !== key);
      const isDupeInScans = scanSlots.some(k => {
        const f = files[k];
        return f && f.name === selectedFile.name && f.size === selectedFile.size;
      });
      const isDupeInComplementary = files.complementary.some(
        f => f.name === selectedFile.name && f.size === selectedFile.size,
      );
      if (isDupeInScans || isDupeInComplementary) {
        setFileError(`${selectedFile.name}: este archivo ya fue agregado.`);
        e.currentTarget.value = '';
        return;
      }

      setFileError(null);
      setFiles(prev => ({ ...prev, [key]: selectedFile }));
    }
  };

  const removeFile = (key: keyof CaseFiles) => {
    setFiles(prev => ({ ...prev, [key]: null }));
    setThumbnails(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const ALLOWED_COMPLEMENTARY_EXTS_WIZ = ['jpg', 'jpeg', 'png', 'pdf', 'docx', 'stl', 'ply', 'obj'];
  const MAX_COMPLEMENTARY_WIZ = 10;

  const handleComplementaryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files ?? []);
    e.target.value = '';
    const errors: string[] = [];
    const valid: File[] = [];
    for (const f of incoming) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_COMPLEMENTARY_EXTS_WIZ.includes(ext)) { errors.push(`${f.name}: formato no permitido`); continue; }
      if (f.size > MAX_UPLOAD_SIZE_BYTES) { errors.push(`${f.name}: supera 20 MB`); continue; }
      const isDupeComp = files.complementary.some(existing => existing.name === f.name && existing.size === f.size);
      const isDupeScan = SCAN_SLOTS.some(k => {
        const s = files[k]; return s && s.name === f.name && s.size === f.size;
      });
      if (isDupeComp || isDupeScan) { errors.push(`${f.name}: ya está en la lista`); continue; }
      valid.push(f);
    }
    if (errors.length > 0) setFileError(errors[0]);
    setFiles(prev => {
      const next = [...prev.complementary, ...valid].slice(0, MAX_COMPLEMENTARY_WIZ);
      return { ...prev, complementary: next };
    });
  };

  const removeComplementary = (idx: number) => {
    setFiles(prev => ({ ...prev, complementary: prev.complementary.filter((_, i) => i !== idx) }));
  };

  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => setStep(s => s - 1);

  const restorationLabel = useMemo(
    () => restorationTypes.find((r) => r.code === formData.restorationType)?.label ?? '',
    [restorationTypes, formData.restorationType],
  );

  const draftClassification = useMemo(() => {
    if (!restorationLabel || formData.teeth.length === 0) return null;
    const resolved = resolveScenario({
      restorationLabel,
      teeth: formData.teeth,
      replacesMissingTeeth: formData.replacesMissingTeeth,
    });
    return {
      ...resolved,
      categoryLabel: WORK_CATEGORY_LABELS[resolved.category],
      workTypeLabel: WORK_TYPE_LABELS[resolved.workType] ?? resolved.workType,
    };
  }, [restorationLabel, formData.teeth, formData.replacesMissingTeeth]);

  const isStepValid = () => {
    if (step === 1) {
      return formData.internalName.trim().length > 0
        && formData.patientIdAnon.trim().length > 0
        && isDesiredDeliveryValid(formData.desiredDeliveryAt);
    }
    if (step === 2) {
      return formData.teeth.length > 0
        && formData.restorationType.length > 0
        && formData.replacesMissingTeeth !== null;
    }
    if (step === 3) return formData.material.length > 0;
    if (step === 4) {
      return files.superior !== null;
    }
    return true;
  };

  return (
    <div className="w-full">
      {/* Progress Bar */}
      <div className="flex gap-1.5 mb-8">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className="flex-1 flex flex-col gap-1.5">
            <div className={`h-1.5 rounded-full transition-all duration-500 ${s <= step ? 'bg-primary shadow-[0_0_8px_rgba(45,212,191,0.4)]' : 'bg-surface-2 dark:bg-surface-2'}`} />
            <span className={`text-[11px] uppercase font-black tracking-widest ${s === step ? 'text-primary' : 'text-muted'}`}>
              {s === 1 ? 'Paciente' : s === 2 ? 'Clínica' : s === 3 ? 'Estética' : 'Archivos'}
            </span>
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-primary-hl rounded-xl text-primary">
                <FileText size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold dark:text-foreground">Identificación del Caso</h2>
                <p className="text-sm text-muted">Datos internos y de anonimización</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted px-1">Nombre Interno</label>
                <input
                  type="text"
                  placeholder="Ej: Juan Perez - Rehabilitación 4.6"
                  className="w-full bg-surface dark:bg-surface border border-slate-200 dark:border-divider rounded-xl px-4 py-3 placeholder:text-muted"
                  value={formData.internalName}
                  onChange={e => setFormData({ ...formData, internalName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted px-1">ID Paciente (Uso Interno)</label>
                <input
                  type="text"
                  placeholder="Código de ficha interna"
                  className="w-full bg-surface dark:bg-surface border border-slate-200 dark:border-divider rounded-xl px-4 py-3 placeholder:text-muted"
                  value={formData.patientIdAnon}
                  onChange={e => setFormData({ ...formData, patientIdAnon: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted px-1">
                Fecha y hora de entrega deseada
              </label>
              <DesiredDeliveryPicker
                value={formData.desiredDeliveryAt}
                onChange={(desiredDeliveryAt) => setFormData({ ...formData, desiredDeliveryAt })}
              />
              <p className="text-xs text-muted px-1">Indica cuándo necesitas recibir el diseño. Debe ser una fecha futura.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted px-1">Prioridad</label>
              <div className="flex gap-3">
                {urgencyLevels.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setFormData({ ...formData, urgency: p.label })}
                    className={`flex-1 py-3 rounded-xl border text-sm font-semibold capitalize transition-all ${
                      formData.urgency === p.label
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-transparent border-slate-200 dark:border-divider text-muted'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-6 flex justify-end">
              <button
                onClick={nextStep}
                disabled={!isStepValid()}
                className="bg-primary/20 border border-primary/30 px-8 py-3 rounded-xl text-primary font-bold uppercase tracking-wider text-xs flex items-center gap-2 hover:bg-primary/30 transition-all disabled:opacity-50"
              >
                Continuar <ArrowRight size={16} className="font-black" />
              </button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-primary-hl rounded-lg text-primary">
                <Stethoscope size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold dark:text-foreground leading-tight">Odontograma</h2>
                <p className="text-xs text-muted">Seleccione las piezas y el tipo de trabajo</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted px-1">Selección de Piezas (FDI)</label>
              <TeethSelector
                selectedTeeth={formData.teeth}
                onChange={teeth => setFormData({...formData, teeth})}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted px-1">Restauración</label>
                <select
                  className="w-full bg-surface dark:bg-surface border border-slate-200 dark:border-divider rounded-xl px-4 py-2.5 appearance-none"
                  value={formData.restorationType}
                  onChange={e => {
                    const code = e.target.value;
                    const label = restorationTypes.find((r) => r.code === code)?.label ?? '';
                    setFormData({
                      ...formData,
                      restorationType: code,
                      replacesMissingTeeth: label === 'Puente' ? true : formData.replacesMissingTeeth,
                    });
                  }}
                >
                  {restorationTypes.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted px-1">
                ¿El caso reemplaza dientes ausentes (pónticos)?
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, replacesMissingTeeth: true })}
                  className={`flex-1 py-2.5 rounded-xl border text-xs font-bold uppercase tracking-wider transition-colors ${
                    formData.replacesMissingTeeth === true
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-surface border-divider text-muted'
                  }`}
                >
                  Sí
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, replacesMissingTeeth: false })}
                  className={`flex-1 py-2.5 rounded-xl border text-xs font-bold uppercase tracking-wider transition-colors ${
                    formData.replacesMissingTeeth === false
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-surface border-divider text-muted'
                  }`}
                >
                  No
                </button>
              </div>
              <p className="text-xs text-muted px-1">
                Distingue coronas múltiples de puentes. Se sugiere automáticamente «Sí» para restauración Puente.
              </p>
            </div>

            {draftClassification && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                <p className="text-xs font-black uppercase tracking-widest text-primary">Clasificación prevista</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-foreground">
                  <span className="text-muted">Categoría</span>
                  <span className="font-medium">{draftClassification.categoryLabel}</span>
                  <span className="text-muted">Tipo de trabajo</span>
                  <span className="font-medium">{draftClassification.workTypeLabel}</span>
                  <span className="text-muted">Complejidad</span>
                  <span className="font-medium capitalize">{draftClassification.caseComplexity}</span>
                </div>
              </div>
            )}

            <div className="pt-3 flex justify-between">
              <button onClick={prevStep} className="flex items-center gap-2 text-muted font-bold hover:text-primary transition-colors">
                <ChevronLeft size={20} /> Atrás
              </button>
              <button
                onClick={nextStep}
                disabled={!isStepValid()}
                className="bg-primary/20 border border-primary/30 px-6 py-2.5 rounded-xl text-primary font-bold uppercase tracking-wider text-xs flex items-center gap-2 hover:bg-primary/30 transition-all disabled:opacity-50"
              >
                Configurar Estética <ArrowRight size={16} className="font-black" />
              </button>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-primary-hl rounded-xl text-primary">
                <Palette size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold dark:text-foreground">Estética y Materiales</h2>
                <p className="text-sm text-muted">Defina el acabado y notas técnicas</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted px-1">Material Sugerido</label>
                <select
                  className="w-full bg-surface dark:bg-surface border border-slate-200 dark:border-divider rounded-xl px-4 py-3 appearance-none"
                  value={formData.material}
                  onChange={e => setFormData({ ...formData, material: e.target.value })}
                >
                  <option value="">Seleccione material...</option>
                  {dentalMaterials.map(m => <option key={m.code} value={m.code}>{m.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted px-1">Color</label>
                <select
                  className="w-full bg-surface dark:bg-surface border border-slate-200 dark:border-divider rounded-xl px-4 py-3 appearance-none"
                  value={formData.shade}
                  onChange={e => setFormData({ ...formData, shade: e.target.value })}
                >
                  {vitaShades.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
                </select>
              </div>
            </div>

            {/* Precio de lista */}
            {(listPriceLoading || listPriceChecked) && (
              <div className={`rounded-xl border p-4 ${
                listPriceSale != null
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-warning/30 bg-warning-hl'
              }`}>
                {listPriceLoading ? (
                  <p className="text-sm text-muted">Calculando precio...</p>
                ) : listPriceSale != null ? (
                  <div className="flex items-center gap-3">
                    <DollarSign size={20} className="text-primary" />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted">Precio de referencia</p>
                      <p className="text-xl font-bold text-primary">{formatUchQuoteClp(listPriceSale)}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 text-warning">
                    <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                    <p className="text-sm leading-snug">
                      No hay tarifa para esta combinación. Podrás guardar el borrador, pero no podrás publicar hasta que exista una regla de precio.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted px-1">Notas Oclusales</label>
                  <input
                    type="text"
                    placeholder="Puntos de contacto, guía, etc."
                    className="w-full bg-surface dark:bg-surface border border-slate-200 dark:border-divider rounded-xl px-4 py-2 text-sm"
                    value={formData.notesOclusal}
                    onChange={e => setFormData({ ...formData, notesOclusal: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted px-1">Detalle Estético</label>
                  <input
                    type="text"
                    placeholder="Translucidez, mamelones, etc."
                    className="w-full bg-surface dark:bg-surface border border-slate-200 dark:border-divider rounded-xl px-4 py-2 text-sm"
                    value={formData.notesEsthetic}
                    onChange={e => setFormData({ ...formData, notesEsthetic: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted px-1">Instrucciones Especiales</label>
                <textarea
                  placeholder="Instrucciones adicionales para el técnico..."
                  rows={3}
                  className="w-full bg-surface dark:bg-surface border border-slate-200 dark:border-divider rounded-xl px-4 py-3"
                  value={formData.doctorNotes}
                  onChange={e => setFormData({ ...formData, doctorNotes: e.target.value })}
                />
              </div>
            </div>

            <div className="pt-6 flex justify-between">
              <button onClick={prevStep} className="flex items-center gap-2 text-muted font-bold hover:text-primary transition-colors">
                <ChevronLeft size={20} /> Atrás
              </button>
              <button
                onClick={nextStep}
                className="bg-primary/20 border border-primary/30 px-8 py-3 rounded-xl text-primary font-bold uppercase tracking-wider text-xs flex items-center gap-2 hover:bg-primary/30 transition-all"
              >
                Subir Escaneos <Upload size={16} className="font-black" />
              </button>
            </div>
          </motion.div>
        )}

        {step === 4 && (
          <motion.div
            key="step4"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-primary-hl rounded-xl text-primary">
                <Upload size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold dark:text-foreground">Archivos de Escaneo (CAD)</h2>
                <p className="text-sm text-muted">Cargue los archivos STL, PLY u OBJ del paciente</p>
              </div>
            </div>

            {(
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {SCAN_SLOTS.map(key => (
                  <div key={key} className="relative">
                    <label className="text-xs font-bold uppercase tracking-widest text-muted mb-2 block text-center">
                      {SCAN_SLOT_LABELS[key]}
                    </label>
                    <div className={`
                      h-40 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-4 transition-all
                      ${files[key] ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-divider hover:border-primary/50'}
                    `}>
                      <input
                        type="file"
                        className="hidden"
                        id={`file-${key}`}
                        accept=".stl,.ply,.obj,.jpg,.jpeg,.png"
                        onChange={e => handleFileChange(key, e)}
                      />
                      <label htmlFor={`file-${key}`} className="cursor-pointer flex flex-col items-center">
                        {files[key] ? (
                          <>
                            <CheckCircle2 size={32} className="text-primary mb-2" />
                            <span className="text-xs font-medium dark:text-foreground truncate max-w-full italic px-2">
                              {files[key]?.name}
                            </span>
                          </>
                        ) : (
                          <>
                            <Upload size={32} className="text-muted mb-2" />
                            <span className="text-xs font-semibold text-muted">Subir .STL / .PLY / .OBJ</span>
                          </>
                        )}
                      </label>
                      {files[key] && (
                        <button
                          onClick={() => removeFile(key)}
                          className="absolute top-8 right-2 inline-flex items-center justify-center w-9 h-9 rounded-xl bg-error-hl border border-error/20 text-error hover:bg-error hover:text-inverse transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Generadores de Miniaturas Silenciosos */}
            <div className="hidden pointer-events-none absolute" style={{ width: 1, height: 1, overflow: 'hidden' }}>
              {SCAN_SLOTS.map(key => {
                const file = files[key];
                if (file && isThreeDFile(file.name) && !thumbnails[key]) {
                  const tempUrl = URL.createObjectURL(file);
                  return (
                    <div key={`thumb-gen-${key}`}>
                      <STLThumbnail
                        url={tempUrl}
                        onGenerated={(dataUrl) => {
                          setThumbnails(prev => ({ ...prev, [key]: dataUrl }));
                          URL.revokeObjectURL(tempUrl);
                        }}
                      />
                    </div>
                  );
                }
                return null;
              })}
            </div>


            {/* Documentación complementaria */}
            <div className="border border-divider rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold dark:text-foreground">Documentación complementaria</p>
                  <p className="text-xs text-muted mt-0.5">Imágenes de referencia, radiografías, PDFs u otros (JPG, PNG, PDF, DOCX · máx. 20 MB · hasta 10 archivos)</p>
                </div>
                <span className="text-xs text-muted">{files.complementary.length}/10</span>
              </div>
              {files.complementary.length < MAX_COMPLEMENTARY_WIZ && (
                <label className="flex items-center gap-2 cursor-pointer text-xs text-primary font-semibold hover:underline">
                  <Upload size={14} />
                  Agregar archivos
                  <input type="file" className="hidden" multiple accept=".jpg,.jpeg,.png,.pdf,.docx,.stl,.ply,.obj" onChange={handleComplementaryChange} />
                </label>
              )}
              {files.complementary.length > 0 && (
                <ul className="space-y-1">
                  {files.complementary.map((f, i) => (
                    <li key={i} className="flex items-center justify-between text-xs bg-white/5 rounded-lg px-3 py-1.5">
                      <span className="truncate max-w-[80%] dark:text-foreground">{f.name}</span>
                      <button type="button" onClick={() => removeComplementary(i)} className="text-error hover:text-error/70 transition-colors ml-2">
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {fileError && (
              <div className="rounded-xl border border-error/20 bg-error-hl px-4 py-3 text-sm font-medium text-error">
                {fileError}
              </div>
            )}

            {loading && typeof uploadProgress === 'number' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted">
                  <span>Subiendo archivos...</span>
                  <span className="text-primary">{Math.round(uploadProgress)}%</span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-[width] duration-200 ease-out"
                    style={{ width: `${Math.min(100, Math.max(0, uploadProgress))}%` }}
                  />
                </div>
              </div>
            )}

            <div className="pt-6 flex justify-between items-center">
              <button onClick={prevStep} className="flex items-center gap-2 text-muted font-bold hover:text-primary transition-colors">
                <ChevronLeft size={20} /> Atrás
              </button>
              <button
                onClick={() => {
                  try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
                  onComplete(formData, files, thumbnails);
                }}
                disabled={loading || !isStepValid()}
                className="bg-primary/20 border border-primary/30 px-8 py-3.5 rounded-xl text-primary font-bold uppercase tracking-wider text-xs flex items-center gap-2 hover:bg-primary/30 transition-all disabled:opacity-50 shadow-xl shadow-sm"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-primary/30 border-t-teal-500 rounded-full animate-spin" />
                ) : (
                  <Save size={16} className="font-black" />
                )}
                {loading
                  ? (typeof uploadProgress === 'number' ? `Guardando... ${Math.round(uploadProgress)}%` : 'Guardando...')
                  : (initialData ? 'Guardar Cambios' : 'Guardar Caso')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
