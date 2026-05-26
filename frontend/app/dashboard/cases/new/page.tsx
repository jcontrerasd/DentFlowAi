'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, AlertCircle, ShieldAlert } from 'lucide-react';
import { createClinicalCaseAction, getUploadUrlAction } from '@/lib/db/actions/cases';
import { registerFileAction } from '@/lib/db/actions/files';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { CaseCreationWizard, CaseFormData, CaseFiles } from '@/components/cases/CaseCreationWizard';
import { logError } from '@/lib/logger';
import { isContactGuardError } from '@/lib/contactGuard/clientHelpers';
import { maybeGzipForUpload } from '@/lib/uploadCompression';

export default function NewCasePage() {
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const { showSuccess } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardBlock, setGuardBlock] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('');

  const handleCreateCase = async (formData: CaseFormData, files: CaseFiles, thumbnails: Record<string, string>) => {

    setLoading(true);
    setError(null);
    try {
      // Prioridad absoluta al ID detectado en la sesión o fallback al perfil
      const doctorId = user?.id || (user as any).uid || (user as any).sub;
      const orgId = userProfile?.organization?.id;
      
      if (!doctorId || !orgId) {
        throw new Error('Sesión no disponible o no perteneces a ninguna organización. Por favor, re-inicia sesión.');
      }

      const caseId = crypto.randomUUID();

      // 1. Crear Caso Clínico en PostgreSQL con TODOS los campos clínicos del respaldo
      const newCase = await createClinicalCaseAction({
        id: caseId,
        organizationId: orgId,
        patientIdAnon: formData.patientIdAnon,
        internalName: formData.internalName,
        urgency: formData.urgency,
        restorationType: formData.restorationType,
        material: formData.material,
        shade: formData.shade,
        teeth: formData.teeth,
        needsFabrication: formData.needsFabrication,
        serviceType: formData.serviceType,
        doctorNotes: formData.doctorNotes,
        specialInstructions: formData.doctorNotes || null,
        notesEsthetic: formData.notesEsthetic, // Campo restaurado
        notesOclusal: formData.notesOclusal,   // Campo restaurado
      });

      // 2. Subir archivos a GCS vía Signed URLs.
      //    - solo_fabricacion: el dentista sube un único archivo de diseño (designFile).
      //    - solo_diseno / integral: se suben los scans (superior/inferior/bite).
      const isSoloFabrication = formData.serviceType === 'solo_fabricacion';

      type UploadEntry = {
        key: 'superior' | 'inferior' | 'bite' | 'designFile';
        file: File;
        category: 'scan' | 'design_upload';
        subType: string;
        folder: 'scans' | 'design';
      };

      const uploads: UploadEntry[] = isSoloFabrication
        ? files.designFile
          ? [{ key: 'designFile', file: files.designFile, category: 'design_upload', subType: 'dentist_design', folder: 'design' }]
          : []
        : (['superior', 'inferior', 'bite'] as const)
            .filter((k) => !!files[k])
            .map((k) => ({ key: k, file: files[k] as File, category: 'scan' as const, subType: k, folder: 'scans' as const }));

      for (const entry of uploads) {
        const { key, file, category, subType, folder } = entry;
        const gcsPath = `organizations/${orgId}/cases/${caseId}/${folder}/${subType}_${file.name}`;

        // Comprime con gzip los modelos 3D (STL/PLY/OBJ) antes del PUT.
        const { body: uploadBody, contentEncoding } = await maybeGzipForUpload(file);

        // Generar URL firmada (PUT) — exigirá Content-Encoding si corresponde.
        const uploadUrl = await getUploadUrlAction(
          gcsPath,
          file.type,
          contentEncoding ? { contentEncoding } : undefined,
        );
        if (!uploadUrl) {
          throw new Error(`Error de permisos: No se pudo generar la ruta de subida para ${key}.`);
        }

        // Subida directa via PUT (Arreglado vía CORS anteriormente)
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: uploadBody,
          headers: {
            'Content-Type': file.type,
            ...(contentEncoding ? { 'Content-Encoding': contentEncoding } : {}),
          },
        });

        if (!uploadRes.ok) {
          throw new Error(`Fallo en la subida: El servidor de almacenamiento rechazó el archivo ${key}.`);
        }

        // 3. ¿Tiene miniatura generada?
        let thumbnailPath = null;
        if (thumbnails[key]) {
          setUploadStatus(`Generando miniatura para ${key}...`);
          const thumbBlob = await (await fetch(thumbnails[key])).blob();
          const thumbGcsPath = gcsPath.replace(`/${folder}/`, '/thumbnails/').split('.').slice(0, -1).join('.') + '.webp';

          const thumbUploadUrl = await getUploadUrlAction(thumbGcsPath, 'image/webp');
          if (thumbUploadUrl) {
            await fetch(thumbUploadUrl, {
              method: 'PUT',
              body: thumbBlob,
              headers: { 'Content-Type': 'image/webp' },
            });
            thumbnailPath = thumbGcsPath;
          }
        }

        // 4. Registrar archivo en DB PostgreSQL
        await registerFileAction({
          caseId: caseId,
          organizationId: orgId,
          uploaderId: doctorId,
          filename: file.name,
          category,
          subType,
          size: file.size,
          mimeType: file.type,
          gcsPath: gcsPath,
          thumbnailPath: thumbnailPath || undefined,
        });
      }


      showSuccess(`Caso ${newCase?.caseNumber ?? ''} creado exitosamente`.trim());
      router.push('/dashboard/cases');
    } catch (err: any) {
      // ContactGuard: bloqueo de validación esperado, no es un error de sistema.
      // No se loggea como error ni se muestra en rojo.
      if (isContactGuardError(err?.message)) {
        setError(null);
        setGuardBlock(err.message);
      } else {
        setGuardBlock(null);
        logError('Error creating clinical case', err);
        if (err.message?.includes('fetch')) {
          setError('Error de conexión con el almacenamiento. Por favor verifica tu internet o intenta de nuevo.');
        } else {
          setError(err.message || 'Ocurrió un error al procesar el caso clínico.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-20 px-4">
      <div className="flex items-center justify-between mb-10 pt-8">
        <div>
          <button 
            onClick={() => router.back()}
            className="flex items-center gap-2 text-slate-400 hover:text-teal-400 transition-colors mb-4 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Volver al Panel
          </button>
          <h1 className="text-4xl serif-font dark:text-white">Nuevo Caso</h1>
          <p className="text-slate-500">Inicie el flujo de trabajo CAD/CAM completando el expediente</p>
        </div>
      </div>

      {uploadStatus && !error && !guardBlock && (
        <div className="mb-6 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-teal-500 animate-pulse">
          <div className="w-2 h-2 bg-teal-500 rounded-full" />
          {uploadStatus}
        </div>
      )}

      {error && (

        <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-500 animate-fade-in shadow-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      )}

      {guardBlock && (
        <div className="mb-8 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3 text-amber-300 animate-fade-in shadow-sm">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-black uppercase tracking-widest text-amber-200">Validación de contacto</p>
            <p className="text-sm leading-snug whitespace-pre-line">{guardBlock}</p>
            <p className="text-[11px] text-amber-200/70">Edita los campos marcados y vuelve a intentarlo. Esta detección no es un error del sistema.</p>
          </div>
        </div>
      )}

      <div className="glass-effect p-8 md:p-12 rounded-[2.5rem] border border-slate-200 dark:border-slate-800/30 shadow-2xl">
        <CaseCreationWizard onComplete={handleCreateCase} loading={loading} />
      </div>
    </div>
  );
}
