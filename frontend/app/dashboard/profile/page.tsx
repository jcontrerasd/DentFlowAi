'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  User, 
  Mail, 
  Phone, 
  Award, 
  Calendar, 
  Save, 
  Camera, 
  FileText,
  AlertCircle
} from 'lucide-react';
import { useAuth, UserProfile } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { updateUserAction } from '@/lib/db/actions/user';
import { updateOrganizationDetailsAction } from '@/lib/db/actions/organization';
import { getUploadUrlAction, getSignedUrlAction } from '@/lib/db/actions/cases';
import Image from 'next/image';
import SkillMatrixForm, { type SkillMatrixFormHandle } from '@/components/profile/SkillMatrixForm';
import AvailabilityToggle from '@/components/profile/AvailabilityToggle';
import ThemeSelector from '@/components/profile/ThemeSelector';

export default function ProfilePage() {
  const { user, userProfile, updateProfileOptimistically } = useAuth();
  const { showSuccess } = useToast();
  const skillFormRef = useRef<SkillMatrixFormHandle>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    specialty: '',
    registrationNumber: '',
    experienceYears: 0,
    bio: '',
  });

  const DENTIST_SPECIALTIES = [
    'Odontología General',
    'Rehabilitación Oral',
    'Implantología',
    'Ortodoncia',
    'Endodoncia',
    'Periodoncia',
    'Cirugía Maxilofacial',
    'Odontopediatría'
  ];

  const BIO_MAX_LENGTH = 500;

  useEffect(() => {
    if (userProfile) {
      setFormData({
        fullName: userProfile.fullName || '',
        phone: userProfile.phone || '',
        specialty: userProfile.specialty || 'Odontología General',
        registrationNumber: userProfile.registrationNumber || '',
        experienceYears: userProfile.experienceYears || 0,
        bio: userProfile.bio || '',
      });

      if (userProfile.image) {
        getSignedUrlAction(userProfile.image).then(url => setAvatarUrl(url));
      }
    }
  }, [userProfile]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !userProfile) return;

    setUploading(true);
    setError(null);
    try {
      const gcsPath = `users/${userProfile.id}/avatar_${Date.now()}_${file.name}`;
      const uploadUrl = await getUploadUrlAction(gcsPath, file.type);
      
      if (!uploadUrl) throw new Error("No se pudo obtener la URL de subida");

      const res = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type
        }
      });

      if (!res.ok) throw new Error("Error al subir archivo a GCS");

      // Actualizar usuario en DB
      const result = await updateUserAction(userProfile.id, { image: gcsPath });
      
      if (result.success) {
        updateProfileOptimistically({ image: gcsPath });
        const newUrl = await getSignedUrlAction(gcsPath);
        setAvatarUrl(newUrl);
        showSuccess('Perfil actualizado con éxito');
      } else {
        throw new Error(result.error);
      }
    } catch (err: any) {
      setError(err.message || "Error al subir el avatar");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userProfile) return;

    setLoading(true);
    setError(null);
    try {
      const result = await updateUserAction(userProfile.id, formData);
      if (!result.success) throw new Error(result.error);

      if (userProfile?.role === 'tecnico' && skillFormRef.current) {
        const skillsResult = await skillFormRef.current.save();
        if (!skillsResult.success) throw new Error(skillsResult.error);
      }

      updateProfileOptimistically({ ...formData });
      showSuccess('Perfil actualizado con éxito');
    } catch (err: any) {
      setError(err.message || "Error al actualizar el perfil");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl serif-font text-foreground mb-2">Mi Perfil</h1>
          <p className="text-faint text-sm">Gestiona tu información profesional y personal.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:items-stretch">
        {/* Lado Izquierdo: Avatar y Rol */}
        <div className="flex flex-col gap-6 lg:h-full lg:min-h-0">
          <section className="bg-surface shadow-sm border border-divider p-8 rounded-[2rem] border border-divider text-center relative overflow-hidden shadow-2xl lg:flex lg:flex-1 lg:flex-col lg:min-h-0">
            <div className="relative w-32 h-32 mx-auto mb-6 group">
              <div className="w-full h-full rounded-full bg-surface-2 border-2 border-divider flex items-center justify-center text-4xl text-primary font-bold overflow-hidden shadow-2xl">
                {avatarUrl ? (
                  <Image src={avatarUrl} alt="Avatar" width={128} height={128} className="w-full h-full object-cover" unoptimized />
                ) : (
                  userProfile?.fullName?.[0] || 'U'
                )}
              </div>
              <label className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-full cursor-pointer">
                <Camera className="text-foreground w-8 h-8" />
                <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={uploading} />
              </label>
              {uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full">
                  <div className="w-6 h-6 border-2 border-primary/30 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <h3 className="text-xl font-bold text-foreground uppercase tracking-tight">{userProfile?.fullName}</h3>
            <p className="text-primary text-[10px] font-bold uppercase tracking-wider mt-1 bg-primary-hl inline-block px-3 py-1 rounded-full border border-primary/20">
              {userProfile?.role}
            </p>
            <div className="hidden w-full min-h-0 flex-1 lg:flex" aria-hidden />
            <div className="mt-8 border-t border-divider pt-6 text-left lg:mt-0 space-y-3">
               <div className="flex items-center gap-3 text-xs text-muted">
                  <Mail className="w-3.5 h-3.5 text-faint" />
                  <span>{userProfile?.email}</span>
               </div>
               <div className="flex items-center gap-3 text-xs text-muted">
                  <Calendar className="w-3.5 h-3.5 text-faint" />
                  <span>Miembro desde {new Date((userProfile as any)?.createdAt || '').toLocaleDateString()}</span>
               </div>
            </div>
          </section>

          {error && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-error-hl border border-error/20 p-4 rounded-2xl flex items-center gap-3">
              <AlertCircle className="text-error w-5 h-5 flex-shrink-0" />
              <p className="text-error text-xs font-bold uppercase tracking-widest">{error}</p>
            </motion.div>
          )}
        </div>

        {/* Lado Derecho: Formulario Personalizado */}
        <div className="lg:col-span-2 flex min-h-0 flex-col lg:h-full">
          <form
            onSubmit={handleSubmit}
            className="bg-surface shadow-sm border border-divider flex min-h-0 flex-1 flex-col rounded-[2.5rem] border border-divider p-8 shadow-2xl"
          >
            <div className="space-y-8 lg:min-h-0 lg:flex-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-faint ml-1">Nombre Completo</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                  <input 
                    className="w-full bg-surface border border-divider rounded-xl pl-12 pr-4 py-3 text-sm text-foreground focus:border-primary/30 focus:outline-none transition-all"
                    value={formData.fullName}
                    onChange={e => setFormData({...formData, fullName: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-faint ml-1">Teléfono</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                  <input 
                    className="w-full bg-surface border border-divider rounded-xl pl-12 pr-4 py-3 text-sm text-foreground focus:border-primary/30 focus:outline-none transition-all"
                    value={formData.phone}
                    onChange={e => setFormData({...formData, phone: e.target.value})}
                  />
                </div>
              </div>

              {userProfile?.role === 'dentista' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-faint ml-1">Especialidad</label>
                    <div className="relative">
                      <Award className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
                      <select 
                        className="w-full bg-surface border border-divider rounded-xl pl-12 pr-4 py-3 text-sm text-foreground focus:border-primary/30 focus:outline-none transition-all appearance-none"
                        value={formData.specialty}
                        onChange={e => setFormData({...formData, specialty: e.target.value})}
                      >
                        {DENTIST_SPECIALTIES.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-faint ml-1">Nº Registro / Licencia</label>
                    <div className="relative">
                      <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                      <input 
                        className="w-full bg-surface border border-divider rounded-xl pl-12 pr-4 py-3 text-sm text-foreground focus:border-primary/30 focus:outline-none transition-all"
                        value={formData.registrationNumber}
                        onChange={e => setFormData({...formData, registrationNumber: e.target.value})}
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-faint ml-1">Años de experiencia</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                  <input 
                    type="number"
                    className="w-full bg-surface border border-divider rounded-xl pl-12 pr-4 py-3 text-sm text-foreground focus:border-primary/30 focus:outline-none transition-all"
                    value={formData.experienceYears}
                    onChange={e => setFormData({...formData, experienceYears: parseInt(e.target.value) || 0})}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-faint">Bio / Descripción Profesional</label>
                <span className={`text-[9px] font-bold ${formData.bio.length > BIO_MAX_LENGTH ? 'text-error' : 'text-faint'}`}>
                  {formData.bio.length} / {BIO_MAX_LENGTH}
                </span>
              </div>
              <textarea 
                className={`w-full bg-surface border rounded-2xl p-4 text-sm text-foreground focus:outline-none transition-all min-h-[120px] ${formData.bio.length > BIO_MAX_LENGTH ? 'border-error/30 focus:border-error/30' : 'border-divider focus:border-primary/30'}`}
                placeholder="Cuéntanos un poco sobre tu trayectoria..."
                value={formData.bio}
                onChange={e => setFormData({...formData, bio: e.target.value})}
              />
            </div>
            </div>

            <div className="mt-auto flex justify-end pt-6">
              <button 
                type="submit"
                disabled={loading || formData.bio.length > BIO_MAX_LENGTH}
                className="bg-primary hover:bg-primary text-inverse px-10 py-4 rounded-2xl font-bold uppercase tracking-wider text-[11px] flex items-center gap-3 transition-all shadow-xl shadow-sm disabled:opacity-50"
              >
                {loading ? <div className="w-4 h-4 border-2 border-border border-t-white rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
                Guardar Cambios
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Apariencia — selector de tema (light / dark / system) */}
      <div className="max-w-4xl mx-auto mt-6">
        <ThemeSelector />
      </div>

      {/* S1-06: Secciones exclusivas para técnicos */}
      {userProfile?.role === 'tecnico' && (
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h2 className="text-2xl serif-font text-foreground mb-1">Panel de Técnico</h2>
            <p className="text-faint text-sm">Gestiona tu disponibilidad y declara tus habilidades técnicas para recibir invitaciones de trabajo.</p>
          </div>

          {/* Disponibilidad */}
          <AvailabilityToggle
            initialValue={(userProfile as any).isAvailable ?? true}
            suspendedUntil={(userProfile as any).suspendedUntil ?? null}
          />

          {/* Skill Matrix */}
          <div className="bg-surface shadow-sm border border-divider p-8 rounded-[2rem] border border-divider shadow-2xl space-y-6">
            <div>
              <h3 className="text-sm font-black text-foreground uppercase tracking-widest mb-1">Mis Habilidades Técnicas</h3>
              <p className="text-[11px] text-faint">
                Declara tus niveles de competencia por tipo de trabajo (0 = no aplico, 7 = experto). El sistema los usa para enviarte invitaciones acordes a tu perfil.
              </p>
            </div>
            <SkillMatrixForm
              ref={skillFormRef}
              hideButton
              initialCad={(userProfile as any)?.organization?.technicalCapabilities?.includes?.('CAD')}
              initialCam={(userProfile as any)?.organization?.technicalCapabilities?.includes?.('CAM')}
            />
          </div>
        </div>
      )}
    </div>
  );
}
