'use client';

import React, { useState, useEffect } from 'react';
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
  ChevronLeft
} from 'lucide-react';
import { TeethSelector } from './TeethSelector';
import {
  SERVICE_TYPES,
  type ServiceType,
} from '@/lib/constants/dental';
import {
  listVitaShadesAction,
  listRestorationTypesAction,
  listDentalMaterialsAction,
  listUrgencyLevelsAction,
  type CatalogOption,
} from '@/lib/db/actions/catalogs';
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
  /** Derivado de serviceType para retrocompatibilidad con el backend. */
  needsFabrication: boolean;
  /** Tipo de servicio: solo diseño, solo fabricación o integral. */
  serviceType: ServiceType;
}

export interface CaseFiles {
  superior: File | null;
  inferior: File | null;
  bite: File | null;
  /** Archivo de diseño que sube el dentista cuando el servicio es solo_fabricacion. */
  designFile: File | null;
}

const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_FILE_EXTENSIONS = ['stl', 'ply', 'obj', 'jpg', 'jpeg', 'png'];
const THREE_D_EXTENSIONS = ['stl', 'ply', 'obj'];

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
  initialData?: Partial<CaseFormData>;
}


const DRAFT_KEY = 'df_case_wizard_draft';

export const CaseCreationWizard: React.FC<CaseCreationWizardProps> = ({ onComplete, loading, initialData }) => {
  const [step, setStep] = useState(1);

  const getInitialFormData = (): CaseFormData => {
    if (typeof window !== 'undefined') {
      try {
        const saved = sessionStorage.getItem(DRAFT_KEY);
        if (saved) return { ...JSON.parse(saved), ...initialData };
      } catch {}
    }
    const initialServiceType: ServiceType = (initialData?.serviceType as ServiceType | undefined)
      ?? (initialData?.needsFabrication ? SERVICE_TYPES.INTEGRAL : SERVICE_TYPES.SOLO_DISENO);
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
      needsFabrication: initialServiceType !== SERVICE_TYPES.SOLO_DISENO,
      serviceType: initialServiceType,
    };
  };

  const [formData, setFormDataRaw] = useState<CaseFormData>(getInitialFormData);

  /** Garantiza coherencia needsFabrication ⇄ serviceType al cambiar el tipo. */
  const setFormData = (updater: CaseFormData | ((prev: CaseFormData) => CaseFormData)) => {
    setFormDataRaw((prev) => {
      const next = typeof updater === 'function' ? (updater as (p: CaseFormData) => CaseFormData)(prev) : updater;
      return {
        ...next,
        needsFabrication: next.serviceType !== SERVICE_TYPES.SOLO_DISENO,
      };
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
    designFile: null,
  });
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState<string | null>(null);

  // Catálogos UI cargados desde DB (vita_shade, restoration_type, dental_material, urgency_level)
  const [vitaShades, setVitaShades] = useState<CatalogOption[]>([]);
  const [restorationTypes, setRestorationTypes] = useState<CatalogOption[]>([]);
  const [dentalMaterials, setDentalMaterials] = useState<CatalogOption[]>([]);
  const [urgencyLevels, setUrgencyLevels] = useState<CatalogOption[]>([]);

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


  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => setStep(s => s - 1);

  const isStepValid = () => {
    if (step === 1) return formData.internalName.trim().length > 0 && formData.patientIdAnon.trim().length > 0 && formData.restorationType.length > 0;
    if (step === 2) return formData.teeth.length > 0;
    if (step === 3) return formData.material.length > 0;
    if (step === 4) {
      return formData.serviceType === SERVICE_TYPES.SOLO_FABRICACION
        ? files.designFile !== null
        : files.superior !== null;
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
            <span className={`text-[9px] uppercase font-black tracking-widest ${s === step ? 'text-primary' : 'text-faint'}`}>
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
                <p className="text-sm text-faint">Datos internos y de anonimización</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-faint px-1">Nombre Interno</label>
                <input
                  type="text"
                  placeholder="Ej: Juan Perez - Rehabilitación 4.6"
                  className="w-full bg-surface dark:bg-surface border border-slate-200 dark:border-divider rounded-xl px-4 py-3 placeholder:text-muted"
                  value={formData.internalName}
                  onChange={e => setFormData({ ...formData, internalName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-faint px-1">ID Paciente (Uso Interno)</label>
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
              <label className="text-xs font-bold uppercase tracking-wider text-faint px-1">Prioridad</label>
              <div className="flex gap-3">
                {urgencyLevels.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setFormData({ ...formData, urgency: p.label })}
                    className={`flex-1 py-3 rounded-xl border text-sm font-semibold capitalize transition-all ${
                      formData.urgency === p.label
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-transparent border-slate-200 dark:border-divider text-faint'
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
                className="bg-primary/20 border border-primary/30 px-8 py-3 rounded-xl text-primary font-bold uppercase tracking-wider text-[10px] flex items-center gap-2 hover:bg-primary/30 transition-all disabled:opacity-50"
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
            className="space-y-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-primary-hl rounded-xl text-primary">
                <Stethoscope size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold dark:text-foreground">Odontograma</h2>
                <p className="text-sm text-faint">Seleccione las piezas y el tipo de trabajo</p>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-xs font-bold uppercase tracking-wider text-faint px-1">Selección de Piezas (FDI)</label>
              <TeethSelector 
                selectedTeeth={formData.teeth} 
                onChange={teeth => setFormData({...formData, teeth})} 
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-faint px-1">Restauración</label>
                <select
                  className="w-full bg-surface dark:bg-surface border border-slate-200 dark:border-divider rounded-xl px-4 py-3 appearance-none"
                  value={formData.restorationType}
                  onChange={e => setFormData({ ...formData, restorationType: e.target.value })}
                >
                  {restorationTypes.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
                </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-faint px-1">Tipo de Servicio</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { id: SERVICE_TYPES.SOLO_DISENO, title: 'Solo diseño', desc: 'Recibo un archivo digital' },
                    { id: SERVICE_TYPES.SOLO_FABRICACION, title: 'Solo fabricación', desc: 'Yo aporto el diseño' },
                    { id: SERVICE_TYPES.INTEGRAL, title: 'Diseño + Fabricación', desc: 'El laboratorio hace todo' },
                  ].map((opt) => {
                    const selected = formData.serviceType === opt.id;
                    return (
                      <button
                        type="button"
                        key={opt.id}
                        onClick={() => setFormData({ ...formData, serviceType: opt.id })}
                        className={`text-left rounded-xl border px-4 py-3 transition-all ${
                          selected
                            ? 'bg-primary/10 border-primary'
                            : 'bg-surface dark:bg-surface border-slate-200 dark:border-divider hover:border-primary/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            selected ? 'bg-primary border-primary' : 'bg-white dark:bg-surface-2 border-slate-300'
                          }`}>
                            {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <span className={`text-sm font-semibold ${selected ? 'text-primary' : 'text-faint dark:text-muted'}`}>
                            {opt.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-faint mt-1.5 leading-snug">{opt.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="pt-6 flex justify-between">
              <button onClick={prevStep} className="flex items-center gap-2 text-faint font-bold hover:text-primary transition-colors">
                <ChevronLeft size={20} /> Atrás
              </button>
              <button
                onClick={nextStep}
                disabled={!isStepValid()}
                className="bg-primary/20 border border-primary/30 px-8 py-3 rounded-xl text-primary font-bold uppercase tracking-wider text-[10px] flex items-center gap-2 hover:bg-primary/30 transition-all disabled:opacity-50"
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
                <p className="text-sm text-faint">Defina el acabado y notas técnicas</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-faint px-1">Material Sugerido</label>
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
                <label className="text-xs font-bold uppercase tracking-wider text-faint px-1">Color</label>
                <select
                  className="w-full bg-surface dark:bg-surface border border-slate-200 dark:border-divider rounded-xl px-4 py-3 appearance-none"
                  value={formData.shade}
                  onChange={e => setFormData({ ...formData, shade: e.target.value })}
                >
                  {vitaShades.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-faint px-1">Notas Oclusales</label>
                  <input
                    type="text"
                    placeholder="Puntos de contacto, guía, etc."
                    className="w-full bg-surface dark:bg-surface border border-slate-200 dark:border-divider rounded-xl px-4 py-2 text-sm"
                    value={formData.notesOclusal}
                    onChange={e => setFormData({ ...formData, notesOclusal: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-faint px-1">Detalle Estético</label>
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
                <label className="text-xs font-bold uppercase tracking-wider text-faint px-1">Instrucciones Especiales</label>
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
              <button onClick={prevStep} className="flex items-center gap-2 text-faint font-bold hover:text-primary transition-colors">
                <ChevronLeft size={20} /> Atrás
              </button>
              <button
                onClick={nextStep}
                className="bg-primary/20 border border-primary/30 px-8 py-3 rounded-xl text-primary font-bold uppercase tracking-wider text-[10px] flex items-center gap-2 hover:bg-primary/30 transition-all"
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
                <h2 className="text-xl font-bold dark:text-foreground">
                  {formData.serviceType === SERVICE_TYPES.SOLO_FABRICACION ? 'Archivo de Diseño' : 'Archivos de Escaneo (CAD)'}
                </h2>
                <p className="text-sm text-faint">
                  {formData.serviceType === SERVICE_TYPES.SOLO_FABRICACION
                    ? 'Cargue el archivo de diseño que el laboratorio fabricará'
                    : 'Cargue los archivos STL o PLY del paciente'}
                </p>
              </div>
            </div>

            {formData.serviceType === SERVICE_TYPES.SOLO_FABRICACION ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:max-w-md md:mx-auto">
                <div className="relative md:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted mb-2 block text-center">
                    Diseño (STL / PLY / OBJ)
                  </label>
                  <div className={`
                    h-40 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-4 transition-all
                    ${files.designFile ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-divider hover:border-primary/50'}
                  `}>
                    <input
                      type="file"
                      className="hidden"
                      id="file-designFile"
                      accept=".stl,.ply,.obj"
                      onChange={e => handleFileChange('designFile', e)}
                    />
                    <label htmlFor="file-designFile" className="cursor-pointer flex flex-col items-center">
                      {files.designFile ? (
                        <>
                          <CheckCircle2 size={32} className="text-primary mb-2" />
                          <span className="text-[10px] font-medium dark:text-foreground truncate max-w-full italic px-2">
                            {files.designFile.name}
                          </span>
                        </>
                      ) : (
                        <>
                          <Upload size={32} className="text-muted dark:text-faint mb-2" />
                          <span className="text-xs font-semibold text-muted">Subir .STL / .PLY / .OBJ</span>
                        </>
                      )}
                    </label>
                    {files.designFile && (
                      <button
                        onClick={() => removeFile('designFile')}
                        className="absolute top-8 right-2 inline-flex items-center justify-center w-9 h-9 rounded-xl bg-error-hl border border-error/20 text-error hover:bg-error hover:text-inverse transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(['superior', 'inferior', 'bite'] as const).map(key => (
                  <div key={key} className="relative">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted mb-2 block text-center">
                      {key === 'bite' ? 'Registro Mordida' : `Arcada ${key}`}
                    </label>
                    <div className={`
                      h-40 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-4 transition-all
                      ${files[key] ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-divider hover:border-primary/50'}
                    `}>
                      <input
                        type="file"
                        className="hidden"
                        id={`file-${key}`}
                        accept=".stl,.ply,.obj"
                        onChange={e => handleFileChange(key, e)}
                      />
                      <label htmlFor={`file-${key}`} className="cursor-pointer flex flex-col items-center">
                        {files[key] ? (
                          <>
                            <CheckCircle2 size={32} className="text-primary mb-2" />
                            <span className="text-[10px] font-medium dark:text-foreground truncate max-w-full italic px-2">
                              {files[key]?.name}
                            </span>
                          </>
                        ) : (
                          <>
                            <Upload size={32} className="text-muted dark:text-faint mb-2" />
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
              {(formData.serviceType === SERVICE_TYPES.SOLO_FABRICACION
                ? (['designFile'] as const)
                : (['superior', 'inferior', 'bite'] as const)
              ).map(key => {
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


            {fileError && (
              <div className="rounded-xl border border-error/20 bg-error-hl px-4 py-3 text-sm font-medium text-error">
                {fileError}
              </div>
            )}

            <div className="pt-6 flex justify-between items-center">
              <button onClick={prevStep} className="flex items-center gap-2 text-faint font-bold hover:text-primary transition-colors">
                <ChevronLeft size={20} /> Atrás
              </button>
              <button
                onClick={() => {
                  try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
                  onComplete(formData, files, thumbnails);
                }}
                disabled={loading || !isStepValid()}
                className="bg-primary/20 border border-primary/30 px-8 py-3.5 rounded-xl text-primary font-bold uppercase tracking-wider text-[10px] flex items-center gap-2 hover:bg-primary/30 transition-all disabled:opacity-50 shadow-xl shadow-sm"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-primary/30 border-t-teal-500 rounded-full animate-spin" />
                ) : (
                  <Save size={16} className="font-black" />
                )}
                {loading ? (initialData ? 'Guardando...' : 'Publicando...') : (initialData ? 'Guardar Cambios' : 'Guardar Caso')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
