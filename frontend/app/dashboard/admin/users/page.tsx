'use client';

import { useState, useEffect, useRef } from 'react';
import SkillMatrixForm, { type SkillMatrixFormHandle } from '@/components/profile/SkillMatrixForm';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, ShieldAlert, Trash2, Lock, UserCheck, UserX, Search, RefreshCcw,
  Briefcase, UserPlus, ArrowLeft, ShieldCheck, ClipboardCheck, Pencil,
  User, Phone, Award, Calendar, FileText, Globe, MapPin, Building2, Fingerprint, Save,
} from 'lucide-react';
import { SUPPORTED_COUNTRIES, REGIONS_BY_COUNTRY } from '@/lib/constants/addressData';
import Link from 'next/link';
import ResetNoResponseModal from '@/components/admin/technicians/ResetNoResponseModal';
import {
  listAllUsersAdmin,
  toggleUserStatusAdmin,
  deleteUserAdmin,
  changeUserPasswordAdmin,
  createCoAdminAction,
  createCalidadUserAction,
  getUserForEditAdmin,
  updateUserProfileAdmin,
  updateUserOrgAdmin,
  reactivateUserWithJustificationAdmin,
  getLegalEvidenceUploadUrlAction,
} from '@/lib/db/actions/admin';
import { DELETION_REINSTATEMENT_REASONS } from '@/lib/constants/legalReasons';
import { AlertTriangle, UploadCloud, FileCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

export default function AdminUsersPage() {
  const { userProfile, user } = useAuth();
  const { showSuccess, showError } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCreateCalidad, setShowCreateCalidad] = useState(false);
  const [calidadForm, setCalidadForm] = useState({ fullName: '', email: '', password: '' });
  const [processing, setProcessing] = useState(false);
  const [actionModal, setActionModal] = useState<{
    show: boolean;
    type: 'toggle' | 'delete' | 'password' | 'edit' | 'reactivate_deletion';
    userData: any;
  }>({ show: false, type: 'toggle', userData: null });
  const [justificationForm, setJustificationForm] = useState({
    reasonCode: '',
    reasonNote: '',
    evidenceFile: null as File | null,
    uploading: false,
    uploadProgress: 0,
    uploadedGcsPath: '',
    uploadedFilename: '',
  });
  const [resetModal, setResetModal] = useState<{ show: boolean; userId: string; userName: string }>({ show: false, userId: '', userName: '' });
  const [editForm, setEditForm] = useState({
    fullName: '', phone: '', specialty: '', registrationNumber: '',
    experienceYears: '', bio: '', country: '', region: '', comuna: '',
    address: '', addressNumber: '', addressOffice: '', role: '',
    isActive: true, isAvailable: true,
  });
  const [orgForm, setOrgForm] = useState({ name: '', giro: '', legalAddress: '', rut: '' });
  const skillFormRef = useRef<SkillMatrixFormHandle>(null);

  const fetchUsers = async () => {
    setLoading(true);
    const data = await listAllUsersAdmin();
    setUsers(data);
    setLoading(false);
  };

  const handleCreateAdmin = async () => {
    if (!adminPassword) return;
    const res = await createCoAdminAction(adminPassword);
    if (res.success && res.data) {
      showSuccess(`Admin creado — ${res.data.name} (${res.data.email})`);
      setShowCreateAdmin(false);
      setAdminPassword('');
      fetchUsers();
    } else {
      showError(res.error || 'Error al crear administrador.');
    }
  };

  const handleCreateCalidad = async () => {
    if (!calidadForm.fullName || !calidadForm.email || !calidadForm.password) return;
    const res = await createCalidadUserAction(calidadForm);
    if (res.success && res.data) {
      showSuccess(`Revisor de Calidad creado — ${res.data.name} (${res.data.email})`);
      setShowCreateCalidad(false);
      setCalidadForm({ fullName: '', email: '', password: '' });
      fetchUsers();
    } else {
      showError(res.error || 'Error al crear revisor de Calidad.');
    }
  };

  const openEditModal = async (u: any) => {
    const res = await getUserForEditAdmin(u.id);
    if (!res.success || !res.data) {
      showError('No se pudo cargar el perfil del usuario.');
      return;
    }
    const d = res.data;
    setEditForm({
      fullName: d.fullName || '',
      phone: (d as any).phone || '',
      specialty: (d as any).specialty || '',
      registrationNumber: (d as any).registrationNumber || '',
      experienceYears: (d as any).experienceYears != null ? String((d as any).experienceYears) : '',
      bio: (d as any).bio || '',
      country: d.country || '',
      region: d.region || '',
      comuna: d.comuna || '',
      address: d.address || '',
      addressNumber: d.addressNumber || '',
      addressOffice: d.addressOffice || '',
      role: d.role || '',
      isActive: d.isActive ?? true,
      isAvailable: d.isAvailable ?? true,
    });
    setOrgForm({
      name: (d as any).organizationName || '',
      giro: (d as any).organizationGiro || '',
      legalAddress: (d as any).organizationLegalAddress || '',
      rut: (d as any).organizationRut || '',
    });
    setActionModal({ show: true, type: 'edit', userData: { ...u, organizationId: (d as any).organizationId } });
  };

  const handleUpdateUser = async () => {
    if (!actionModal.userData || processing) return;
    setProcessing(true);
    try {
      const res = await updateUserProfileAdmin(actionModal.userData.id, {
        ...editForm,
        experienceYears: editForm.experienceYears ? parseInt(editForm.experienceYears) : null,
      });
      if (!res.success) {
        showError(res.error || 'No se pudo actualizar el usuario.');
        return;
      }
      if (actionModal.userData.organizationId && (orgForm.name || orgForm.giro || orgForm.legalAddress)) {
        await updateUserOrgAdmin(actionModal.userData.id, { name: orgForm.name, giro: orgForm.giro, legalAddress: orgForm.legalAddress });
      }
      if (editForm.role === 'tecnico' && skillFormRef.current) {
        const skillRes = await skillFormRef.current.save();
        if (!skillRes.success) {
          showError('Error al guardar habilidades: ' + skillRes.error);
          return;
        }
      }
      await fetchUsers();
      setActionModal({ show: false, type: 'toggle', userData: null });
    } catch {
      showError('Error de conexión con el servidor');
    } finally {
      setProcessing(false);
    }
  };

  const handleReactivateWithJustification = async () => {
    if (!actionModal.userData || processing) return;
    const { reasonCode, reasonNote, evidenceFile } = justificationForm;
    if (!reasonCode) { showError('Debes seleccionar un motivo.'); return; }
    if (reasonCode === 'other' && !reasonNote.trim()) { showError('El motivo "Otro" requiere una nota.'); return; }

    setProcessing(true);
    try {
      let gcsPath = justificationForm.uploadedGcsPath;
      let filename = justificationForm.uploadedFilename;

      if (evidenceFile && !gcsPath) {
        setJustificationForm(f => ({ ...f, uploading: true }));
        const urlRes = await getLegalEvidenceUploadUrlAction({
          userId: actionModal.userData.id,
          filename: evidenceFile.name,
          contentType: evidenceFile.type,
        });
        if (!urlRes.success || !urlRes.url) {
          showError(urlRes.error || 'Error al obtener URL de subida.');
          setJustificationForm(f => ({ ...f, uploading: false }));
          setProcessing(false);
          return;
        }
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', urlRes.url!);
          xhr.setRequestHeader('Content-Type', evidenceFile.type);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setJustificationForm(f => ({ ...f, uploadProgress: Math.round((e.loaded / e.total) * 100) }));
          };
          xhr.onload = () => xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`));
          xhr.onerror = () => reject(new Error('Network error durante upload'));
          xhr.send(evidenceFile);
        });
        gcsPath = urlRes.gcsPath!;
        filename = evidenceFile.name;
        setJustificationForm(f => ({ ...f, uploading: false, uploadedGcsPath: gcsPath, uploadedFilename: filename }));
      }

      const res = await reactivateUserWithJustificationAdmin({
        userId: actionModal.userData.id,
        reasonCode: reasonCode as any,
        reasonNote: reasonNote || undefined,
        evidenceGcsPath: gcsPath || undefined,
        evidenceFilename: filename || undefined,
      });

      if (res.success) {
        showSuccess('Usuario reactivado con justificación registrada.');
        await fetchUsers();
        setActionModal({ show: false, type: 'toggle', userData: null });
      } else {
        showError(res.error || 'No se pudo reactivar al usuario.');
      }
    } catch {
      showError('Error de conexión con el servidor.');
    } finally {
      setProcessing(false);
    }
  };

  const executeAction = async () => {
    if (!actionModal.userData || processing) return;

    setProcessing(true);
    const { type, userData } = actionModal;

    try {
      let res: any;
      if (type === 'toggle') {
        res = await toggleUserStatusAdmin(userData.id, !userData.isActive);
      } else if (type === 'delete') {
        res = await deleteUserAdmin(userData.id);
      }

      if (res?.success) {
        if (type === 'delete') {
          setUsers(prev => prev.filter(u => u.id !== userData.id));
        }
        await fetchUsers(); // Recargar datos reales
        setActionModal({ show: false, type: 'toggle', userData: null });
      } else {
        showError(res?.error || "No se pudo completar la acción");
      }
    } catch (error) {
       console.error("Error executing action:", error);
       showError("Error de conexión con el servidor");
    } finally {
      setProcessing(false);
      setActionModal({ show: false, type: 'toggle', userData: null });
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

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

  const filteredUsers = users.filter(u => {
    const search = searchTerm.toLowerCase();
    const name = String(u.fullName || '').toLowerCase();
    const email = String(u.email || '').toLowerCase();
    const org = String(u.organizationName || '').toLowerCase();
    return name.includes(search) || email.includes(search) || org.includes(search);
  });

  return (
    <div className="space-y-8 pb-20 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/admin"
            className="p-2.5 bg-surface border border-divider rounded-xl text-muted hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl serif-font text-foreground mb-2 flex items-center gap-3">
              <Users className="text-primary w-8 h-8" /> Control de Usuarios.
            </h1>
            <p className="text-faint text-sm">Gestiona accesos, roles y seguridad de las cuentas.</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowCreateCalidad(true)}
            className="flex items-center gap-2 px-6 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
          >
            <ClipboardCheck className="w-4 h-4" />
            Nuevo Revisor Calidad
          </button>
          <button
            onClick={() => setShowCreateAdmin(true)}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary text-inverse rounded-xl text-xs font-bold uppercase tracking-wider shadow-xl shadow-sm transition-all"
          >
            <UserPlus className="w-4 h-4" />
            Nuevo Administrador
          </button>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
            <input
              type="text"
              placeholder="Buscar por nombre, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-surface border border-divider rounded-xl pl-11 pr-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/30 transition-all w-[240px]"
            />
          </div>
          <button
            onClick={fetchUsers}
            className="p-2.5 bg-surface border border-divider rounded-xl text-muted hover:text-primary transition-colors"
          >
            <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-10 h-10 border-4 border-primary/20 border-t-teal-500 rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <div className="bg-surface/40 border border-divider rounded-[2rem] overflow-hidden backdrop-blur-sm">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-divider text-[10px] uppercase tracking-widest text-faint font-black">
                  <th className="px-8 py-5">Usuario</th>
                  <th className="px-6 py-5">Rol / Organización</th>
                  <th className="px-6 py-5">Estado / Onboarding</th>
                  <th className="px-6 py-5">Creado</th>
                  <th className="px-8 py-5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-primary/5 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex flex-col">
                        <span className="text-foreground font-bold text-sm tracking-tight">{u.fullName || 'Sin Nombre'}</span>
                        <span className="text-faint text-xs">{u.email}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md inline-block w-max ${
                          u.role === 'admin' ? 'bg-error-hl text-error' :
                          u.role === 'dentista' ? 'bg-primary-hl text-primary' :
                          u.role === 'calidad' ? 'bg-amber-500/10 text-amber-400' :
                          'bg-orange-500/10 text-orange-400'
                        }`}>
                          {u.role === 'calidad' ? 'Control Calidad' : u.role}
                        </span>
                        <span className="text-muted text-[10px] uppercase font-bold flex items-center gap-1">
                          <Briefcase className="w-3 h-3" /> {u.organizationName || 'Sin Org'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${u.isActive ? 'bg-primary' : 'bg-error animate-pulse'}`} />
                          <span className={`text-[11px] font-bold uppercase ${u.isActive ? 'text-foreground' : 'text-error'}`}>
                            {u.isActive ? 'Activo' : 'Bloqueado'}
                          </span>
                        </div>
                        {!u.isActive && u.deletionRequestedAt && (
                          <span
                            title={`Solicitud: ${new Date(u.deletionRequestedAt).toLocaleDateString('es-CL')}`}
                            className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 w-fit"
                          >
                            Elim. solicitada
                          </span>
                        )}
                        <div className="w-24 h-1 bg-surface-2 rounded-full overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${u.onboardingStep || 0}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-faint text-xs">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEditModal(u)}
                          className="p-2 text-faint hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                          title="Editar perfil"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (!u.isActive && u.deletionRequestedAt) {
                              setJustificationForm({ reasonCode: '', reasonNote: '', evidenceFile: null, uploading: false, uploadProgress: 0, uploadedGcsPath: '', uploadedFilename: '' });
                              setActionModal({ show: true, type: 'reactivate_deletion', userData: u });
                            } else {
                              setActionModal({ show: true, type: 'toggle', userData: u });
                            }
                          }}
                          className={`p-2 rounded-lg transition-colors ${u.isActive ? 'text-faint hover:text-error hover:bg-error/10' : 'text-primary hover:opacity-90/10'}`}
                          title={u.isActive ? 'Bloquear' : (u.deletionRequestedAt ? 'Reactivar (solicitud de eliminación)' : 'Activar')}
                        >
                          {u.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => setActionModal({ show: true, type: 'password', userData: u })}
                          className="p-2 text-faint hover:text-foreground hover:bg-surface-2 rounded-lg transition-colors"
                          title="Cambiar Contraseña"
                        >
                          <Lock className="w-4 h-4" />
                        </button>
                        {u.role === 'tecnico' && (
                          <button
                            onClick={() => setResetModal({ show: true, userId: u.id, userName: u.fullName || u.email })}
                            className="p-2 text-faint hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                            title="Resetear no-respuestas"
                          >
                            <ShieldCheck className="w-4 h-4" />
                          </button>
                        )}
                        {u.role === 'admin' ? (
                          <span
                            className="p-2 text-faint/40 cursor-not-allowed"
                            title="Un usuario administrador no se puede eliminar"
                            aria-disabled="true"
                          >
                            <Trash2 className="w-4 h-4" />
                          </span>
                        ) : (
                          <button
                            onClick={() => setActionModal({ show: true, type: 'delete', userData: u })}
                            className="p-2 text-faint hover:text-error hover:bg-error rounded-lg transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ResetNoResponseModal
        isOpen={resetModal.show}
        onClose={() => setResetModal({ show: false, userId: '', userName: '' })}
        userId={resetModal.userId}
        userName={resetModal.userName}
      />

      {/* Modals */}
      <AnimatePresence>
        {/* Modal de Acción (Toggle/Delete) */}
        {actionModal.show && actionModal.type !== 'password' && actionModal.type !== 'edit' && (
          <div key="modal-action" className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/60">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`w-full max-w-md bg-surface border-2 rounded-[2.5rem] p-10 shadow-2xl ${
                actionModal.type === 'delete' ? 'border-error/20' : 'border-primary/30'
              }`}
            >
              <div className="flex items-center gap-4 mb-6">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                  actionModal.type === 'delete' ? 'bg-error-hl text-error' : 'bg-primary-hl text-primary'
                }`}>
                  {actionModal.type === 'delete' ? <Trash2 className="w-7 h-7" /> : <ShieldAlert className="w-7 h-7" />}
                </div>
                <h3 className="text-2xl serif-font text-foreground">¿Estás seguro?</h3>
              </div>

              <p className="text-muted text-sm mb-8 leading-relaxed">
                {actionModal.type === 'delete' ? (
                  <>Estás a punto de eliminar a <span className="text-foreground font-bold">{actionModal.userData.fullName}</span>.
                  Esta acción es irreversible y borrará sus archivos en la nube.</>
                ) : (
                  <>Vas a {actionModal.userData.isActive ? 'BLOQUEAR' : 'ACTIVAR'} el acceso de
                  <span className="text-foreground font-bold"> {actionModal.userData.fullName}</span> al sistema.</>
                )}
              </p>

              <div className="flex flex-col gap-3">
                <button
                  onClick={executeAction}
                  disabled={processing}
                  className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
                    actionModal.type === 'delete' ? 'bg-error hover:bg-error text-inverse shadow-sm' : 'bg-primary hover:bg-primary text-inverse shadow-sm'
                  } shadow-xl flex items-center justify-center gap-2`}
                >
                  {processing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-border border-t-white rounded-full animate-spin" />
                      Procesando...
                    </>
                  ) : 'Confirmar Acción'}
                </button>
                <button
                  onClick={() => setActionModal({ show: false, type: 'toggle', userData: null })}
                  disabled={processing}
                  className="w-full py-4 text-faint font-black text-xs uppercase tracking-widest hover:text-foreground transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Modal de Reactivación con Justificación Legal */}
        {actionModal.show && actionModal.type === 'reactivate_deletion' && (
          <div key="modal-reactivate" className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/60">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-surface border-2 border-amber-500/30 rounded-[2.5rem] p-10 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-start gap-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-300 text-sm font-bold">Reactivar con justificación</p>
                  <p className="text-amber-400/70 text-xs mt-1">
                    {actionModal.userData?.fullName} solicitó eliminar su cuenta el{' '}
                    {actionModal.userData?.deletionRequestedAt
                      ? new Date(actionModal.userData.deletionRequestedAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
                      : '—'}.
                    Esta acción queda registrada en el log de cumplimiento legal (Ley 21.719).
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-faint uppercase tracking-wider mb-2">Motivo de reactivación *</label>
                <select
                  value={justificationForm.reasonCode}
                  onChange={(e) => setJustificationForm(f => ({ ...f, reasonCode: e.target.value }))}
                  className="w-full bg-surface-2 border border-divider rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:border-amber-400/40"
                >
                  <option value="">Selecciona un motivo...</option>
                  {DELETION_REINSTATEMENT_REASONS.map(r => (
                    <option key={r.code} value={r.code}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-faint uppercase tracking-wider mb-2">
                  Nota adicional {justificationForm.reasonCode === 'other' ? '*' : '(opcional)'}
                </label>
                <textarea
                  value={justificationForm.reasonNote}
                  onChange={(e) => setJustificationForm(f => ({ ...f, reasonNote: e.target.value }))}
                  rows={3}
                  className="w-full bg-surface-2 border border-divider rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:border-amber-400/40 resize-none"
                  placeholder="Describe el contexto o acuerdo con el usuario..."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-faint uppercase tracking-wider mb-2">Respaldo documental (opcional)</label>
                {justificationForm.uploadedGcsPath ? (
                  <div className="flex items-center gap-3 p-3 bg-surface-2 border border-divider rounded-xl">
                    <FileCheck className="w-4 h-4 text-primary" />
                    <span className="text-xs text-foreground truncate">{justificationForm.uploadedFilename}</span>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-divider rounded-xl cursor-pointer hover:border-amber-400/40 transition-colors">
                    <UploadCloud className="w-6 h-6 text-faint" />
                    <span className="text-xs text-faint">PDF, JPEG o PNG · máx 20 MB</span>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (f.size > 20 * 1024 * 1024) { showError('El archivo supera el límite de 20 MB.'); return; }
                        setJustificationForm(prev => ({ ...prev, evidenceFile: f }));
                      }}
                    />
                    {justificationForm.evidenceFile && (
                      <span className="text-xs text-primary font-bold">{justificationForm.evidenceFile.name}</span>
                    )}
                  </label>
                )}
                {justificationForm.uploading && (
                  <div className="mt-2">
                    <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 transition-all duration-200" style={{ width: `${justificationForm.uploadProgress}%` }} />
                    </div>
                    <p className="text-[10px] text-faint mt-1">{justificationForm.uploadProgress}% subido...</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setActionModal({ show: false, type: 'toggle', userData: null })}
                  className="flex-1 py-3 border border-divider rounded-2xl text-sm text-muted hover:text-foreground transition-colors"
                  disabled={processing}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleReactivateWithJustification}
                  disabled={processing || !justificationForm.reasonCode}
                  className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-white rounded-2xl text-sm font-bold disabled:opacity-50 disabled:pointer-events-none transition-colors"
                >
                  {processing ? 'Guardando...' : 'Reactivar y registrar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Modal de Password */}
        {actionModal.show && actionModal.type === 'password' && (
          <div key="modal-password" className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/60">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-surface border border-divider rounded-[2.5rem] p-10 shadow-2xl"
            >
              <h3 className="text-2xl serif-font text-foreground mb-2">Resetear Contraseña</h3>
              <p className="text-faint text-xs mb-8 uppercase tracking-widest font-bold">Usuario: {actionModal.userData.fullName}</p>

              <div className="space-y-6">
                <div>
                  <label className="text-[10px] text-faint font-bold uppercase tracking-wider mb-2 block">Nueva Contraseña</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-background border border-divider rounded-xl px-4 py-3 text-foreground outline-none focus:border-primary/30"
                    placeholder="••••••••"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button onClick={() => setActionModal({ show: false, type: 'toggle', userData: null })} className="flex-1 py-3 text-faint font-black text-[10px] uppercase tracking-widest">Cancelar</button>
                  <button onClick={async () => {
                    const res = await changeUserPasswordAdmin(actionModal.userData.id, newPassword);
                    if (res.success) {
                      showSuccess('Contraseña actualizada');
                      setActionModal({ show: false, type: 'toggle', userData: null });
                      setNewPassword('');
                    }
                  }} className="flex-1 py-3 bg-primary text-inverse rounded-xl font-black text-[10px] uppercase tracking-widest">Actualizar</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
        {showCreateAdmin && (
          <div key="modal-create-admin" className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/60">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-surface border border-divider rounded-[2.5rem] p-10 shadow-2xl"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-primary-hl rounded-2xl flex items-center justify-center text-primary">
                  <UserPlus className="w-6 h-6" />
                </div>
                <h3 className="text-2xl serif-font text-foreground">Nuevo Co-Admin</h3>
              </div>

              <div className="space-y-6">
                <div className="p-4 bg-background rounded-2xl border border-divider text-muted text-xs leading-relaxed">
                  Se creará una cuenta con nombre secuencial (ej. Admin002) y rol de administrador completo,
                  clonando los datos de tu organización.
                </div>

                <div>
                  <label className="text-[10px] text-faint font-bold uppercase tracking-wider mb-2 block ml-1">Establecer Contraseña</label>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full bg-background border border-divider rounded-xl px-4 py-3 text-foreground outline-none focus:border-primary/30"
                    placeholder="Contraseña del nuevo Admin"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button onClick={() => setShowCreateAdmin(false)} className="flex-1 py-3 text-faint font-black text-[10px] uppercase tracking-widest">Cerrar</button>
                  <button onClick={handleCreateAdmin} className="flex-1 py-3 bg-primary text-inverse rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-sm transition-all">Crear Admin</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showCreateCalidad && (
          <div key="modal-create-calidad" className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/60">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-surface border border-amber-500/20 rounded-[2.5rem] p-10 shadow-2xl"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-400">
                  <ClipboardCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl serif-font text-foreground">Nuevo Revisor de Calidad</h3>
                  <p className="text-faint text-xs mt-0.5">Rol: Control de Calidad</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-background rounded-2xl border border-divider text-muted text-xs leading-relaxed">
                  Este usuario revisará las entregas de los técnicos antes de enviarlas al dentista.
                  Fauchard lo asignará automáticamente a los casos de manera equitativa.
                </div>

                <div>
                  <label className="text-[10px] text-faint font-bold uppercase tracking-wider mb-2 block ml-1">Nombre Completo</label>
                  <input
                    type="text"
                    value={calidadForm.fullName}
                    onChange={(e) => setCalidadForm(f => ({ ...f, fullName: e.target.value }))}
                    className="w-full bg-background border border-divider rounded-xl px-4 py-3 text-foreground outline-none focus:border-amber-500/30"
                    placeholder="Ej: Ana García"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-faint font-bold uppercase tracking-wider mb-2 block ml-1">Email</label>
                  <input
                    type="email"
                    value={calidadForm.email}
                    onChange={(e) => setCalidadForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full bg-background border border-divider rounded-xl px-4 py-3 text-foreground outline-none focus:border-amber-500/30"
                    placeholder="revisor@clinica.com"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-faint font-bold uppercase tracking-wider mb-2 block ml-1">Contraseña Inicial</label>
                  <input
                    type="password"
                    value={calidadForm.password}
                    onChange={(e) => setCalidadForm(f => ({ ...f, password: e.target.value }))}
                    className="w-full bg-background border border-divider rounded-xl px-4 py-3 text-foreground outline-none focus:border-amber-500/30"
                    placeholder="••••••••"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => { setShowCreateCalidad(false); setCalidadForm({ fullName: '', email: '', password: '' }); }}
                    className="flex-1 py-3 text-faint font-black text-[10px] uppercase tracking-widest"
                  >
                    Cerrar
                  </button>
                  <button
                    onClick={handleCreateCalidad}
                    disabled={!calidadForm.fullName || !calidadForm.email || !calidadForm.password}
                    className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-black rounded-xl font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-40 disabled:pointer-events-none"
                  >
                    Crear Revisor
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
        {/* Modal de Edición de Perfil */}
        {actionModal.show && actionModal.type === 'edit' && (
          <div key="modal-edit" className="fixed inset-0 z-[100] overflow-y-auto backdrop-blur-md bg-black/60 p-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl mx-auto bg-surface border border-primary/20 rounded-[2.5rem] p-10 shadow-2xl my-6"
            >
              {/* Header */}
              <div className="flex items-center gap-4 mb-8 flex-shrink-0">
                <div className="w-12 h-12 bg-primary-hl rounded-2xl flex items-center justify-center text-primary">
                  <Pencil className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl serif-font text-foreground">Editar Perfil</h3>
                  <p className="text-faint text-xs mt-0.5">{actionModal.userData?.email}</p>
                </div>
              </div>

              <div className="space-y-8">

                {/* Controles admin (no están en el perfil propio) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-background rounded-2xl border border-divider">
                  <div>
                    <label className="text-[10px] text-faint font-bold uppercase tracking-wider mb-2 block ml-1">Rol</label>
                    <select
                      value={editForm.role}
                      onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                      className="w-full bg-surface border border-divider rounded-xl px-4 py-3 text-foreground outline-none focus:border-primary/30 text-sm"
                    >
                      <option value="dentista">Dentista</option>
                      <option value="tecnico">Técnico</option>
                      <option value="calidad">Control de Calidad</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </div>
                  <div className="flex flex-col justify-center gap-3">
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setEditForm(f => ({ ...f, isActive: !f.isActive }))}
                        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${editForm.isActive ? 'bg-primary' : 'bg-surface-2'}`}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${editForm.isActive ? 'translate-x-5' : ''}`} />
                      </button>
                      <label className="text-[10px] text-faint font-bold uppercase tracking-wider">Activo</label>
                    </div>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setEditForm(f => ({ ...f, isAvailable: !f.isAvailable }))}
                        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${editForm.isAvailable ? 'bg-primary' : 'bg-surface-2'}`}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${editForm.isAvailable ? 'translate-x-5' : ''}`} />
                      </button>
                      <label className="text-[10px] text-faint font-bold uppercase tracking-wider">Disponible</label>
                    </div>
                  </div>
                </div>

                {/* Igual que el perfil — Datos personales */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-faint ml-1">Nombre Completo</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                      <input className="w-full bg-surface border border-divider rounded-xl pl-12 pr-4 py-3 text-sm text-foreground focus:border-primary/30 focus:outline-none transition-all"
                        value={editForm.fullName} onChange={e => setEditForm(f => ({ ...f, fullName: e.target.value }))} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-faint ml-1">Teléfono</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                      <input type="tel" placeholder="+56 9 XXXX XXXX"
                        className="w-full bg-surface border border-divider rounded-xl pl-12 pr-4 py-3 text-sm text-foreground focus:border-primary/30 focus:outline-none transition-all"
                        value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
                    </div>
                  </div>

                  {/* Especialidad — dentistas: SELECT igual que perfil */}
                  {editForm.role === 'dentista' && (
                    <>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-faint ml-1">Especialidad</label>
                        <div className="relative">
                          <Award className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
                          <select className="w-full bg-surface border border-divider rounded-xl pl-12 pr-4 py-3 text-sm text-foreground focus:border-primary/30 focus:outline-none transition-all appearance-none"
                            value={editForm.specialty} onChange={e => setEditForm(f => ({ ...f, specialty: e.target.value }))}>
                            {['Odontología General','Rehabilitación Oral','Implantología','Ortodoncia','Endodoncia','Periodoncia','Cirugía Maxilofacial','Odontopediatría'].map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-faint ml-1">Nº Registro / Licencia</label>
                        <div className="relative">
                          <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                          <input className="w-full bg-surface border border-divider rounded-xl pl-12 pr-4 py-3 text-sm text-foreground focus:border-primary/30 focus:outline-none transition-all"
                            value={editForm.registrationNumber} onChange={e => setEditForm(f => ({ ...f, registrationNumber: e.target.value }))} />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Años de experiencia — técnicos */}
                  {editForm.role === 'tecnico' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-faint ml-1">Años de Experiencia</label>
                      <div className="relative">
                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                        <input type="number" min="0"
                          className="w-full bg-surface border border-divider rounded-xl pl-12 pr-4 py-3 text-sm text-foreground focus:border-primary/30 focus:outline-none transition-all"
                          value={editForm.experienceYears} onChange={e => setEditForm(f => ({ ...f, experienceYears: e.target.value }))} />
                      </div>
                    </div>
                  )}

                  {/* País */}
                  <div className="col-span-full space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-faint ml-1">País</label>
                    <div className="relative">
                      <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
                      <select className="w-full bg-surface border border-divider rounded-xl pl-12 pr-4 py-3 text-sm text-foreground focus:border-primary/30 focus:outline-none transition-all appearance-none"
                        value={editForm.country} onChange={e => setEditForm(f => ({ ...f, country: e.target.value, region: '', comuna: '' }))}>
                        {SUPPORTED_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Región */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-faint ml-1">Región</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
                      {REGIONS_BY_COUNTRY[editForm.country] ? (
                        <select className="w-full bg-surface border border-divider rounded-xl pl-12 pr-4 py-3 text-sm text-foreground focus:border-primary/30 focus:outline-none transition-all appearance-none"
                          value={editForm.region} onChange={e => setEditForm(f => ({ ...f, region: e.target.value, comuna: '' }))}>
                          <option value="">Selecciona región</option>
                          {REGIONS_BY_COUNTRY[editForm.country].map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
                        </select>
                      ) : (
                        <input placeholder="Región / Estado / Provincia"
                          className="w-full bg-surface border border-divider rounded-xl pl-12 pr-4 py-3 text-sm text-foreground focus:border-primary/30 focus:outline-none transition-all"
                          value={editForm.region} onChange={e => setEditForm(f => ({ ...f, region: e.target.value }))} />
                      )}
                    </div>
                  </div>

                  {/* Comuna */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-faint ml-1">Comuna</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
                      {REGIONS_BY_COUNTRY[editForm.country] && editForm.region ? (
                        <select className="w-full bg-surface border border-divider rounded-xl pl-12 pr-4 py-3 text-sm text-foreground focus:border-primary/30 focus:outline-none transition-all appearance-none"
                          value={editForm.comuna} onChange={e => setEditForm(f => ({ ...f, comuna: e.target.value }))}>
                          <option value="">Selecciona comuna</option>
                          {(REGIONS_BY_COUNTRY[editForm.country].find(r => r.code === editForm.region)?.communes ?? []).map(c => (
                            <option key={c.code} value={c.code}>{c.name}</option>
                          ))}
                        </select>
                      ) : (
                        <input placeholder="Comuna / Ciudad"
                          className="w-full bg-surface border border-divider rounded-xl pl-12 pr-4 py-3 text-sm text-foreground focus:border-primary/30 focus:outline-none transition-all"
                          value={editForm.comuna} onChange={e => setEditForm(f => ({ ...f, comuna: e.target.value }))} />
                      )}
                    </div>
                  </div>

                  {/* Dirección */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-faint ml-1">Dirección</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                      <input placeholder="Av. Providencia"
                        className="w-full bg-surface border border-divider rounded-xl pl-12 pr-4 py-3 text-sm text-foreground focus:border-primary/30 focus:outline-none transition-all"
                        value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} />
                    </div>
                  </div>

                  {/* Número */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-faint ml-1">Número</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                      <input placeholder="1234"
                        className="w-full bg-surface border border-divider rounded-xl pl-12 pr-4 py-3 text-sm text-foreground focus:border-primary/30 focus:outline-none transition-all"
                        value={editForm.addressNumber} onChange={e => setEditForm(f => ({ ...f, addressNumber: e.target.value }))} />
                    </div>
                  </div>

                  {/* Oficina */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-faint ml-1">Oficina / Dpto.</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                      <input placeholder="Opcional"
                        className="w-full bg-surface border border-divider rounded-xl pl-12 pr-4 py-3 text-sm text-foreground focus:border-primary/30 focus:outline-none transition-all"
                        value={editForm.addressOffice} onChange={e => setEditForm(f => ({ ...f, addressOffice: e.target.value }))} />
                    </div>
                  </div>
                </div>

                {/* Bio con contador */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center ml-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-faint">Bio / Descripción Profesional</label>
                    <span className={`text-[9px] font-bold ${editForm.bio.length > 500 ? 'text-error' : 'text-faint'}`}>{editForm.bio.length} / 500</span>
                  </div>
                  <textarea
                    placeholder="Trayectoria profesional..."
                    rows={4}
                    className={`w-full bg-surface border rounded-2xl p-4 text-sm text-foreground focus:outline-none transition-all min-h-[100px] resize-none ${editForm.bio.length > 500 ? 'border-error/30' : 'border-divider focus:border-primary/30'}`}
                    value={editForm.bio} onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))} />
                </div>

                {/* Organización — igual que perfil */}
                {actionModal.userData?.organizationId && (
                  <div className="space-y-6 border-t border-divider pt-6">
                    <div className="ml-1">
                      <h3 className="text-sm font-black text-foreground uppercase tracking-widest">
                        {editForm.role === 'tecnico' ? 'Tu Laboratorio' : 'Tu Clínica'}
                      </h3>
                      <p className="text-[11px] text-faint mt-1">Datos de la organización. El RUT no se puede modificar.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-faint ml-1">Organización</label>
                        <div className="relative">
                          <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                          <input className="w-full bg-surface border border-divider rounded-xl pl-12 pr-4 py-3 text-sm text-foreground focus:border-primary/30 focus:outline-none transition-all"
                            value={orgForm.name} onChange={e => setOrgForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-faint ml-1">RUT</label>
                        <div className="relative">
                          <Fingerprint className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                          <input disabled readOnly value={orgForm.rut || '—'}
                            className="w-full bg-surface-2 border border-divider rounded-xl pl-12 pr-4 py-3 text-sm text-muted cursor-not-allowed" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-faint ml-1">Giro</label>
                        <div className="relative">
                          <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                          <input className="w-full bg-surface border border-divider rounded-xl pl-12 pr-4 py-3 text-sm text-foreground focus:border-primary/30 focus:outline-none transition-all"
                            value={orgForm.giro} onChange={e => setOrgForm(f => ({ ...f, giro: e.target.value }))} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-faint ml-1">Dirección Legal</label>
                        <div className="relative">
                          <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                          <input className="w-full bg-surface border border-divider rounded-xl pl-12 pr-4 py-3 text-sm text-foreground focus:border-primary/30 focus:outline-none transition-all"
                            value={orgForm.legalAddress} onChange={e => setOrgForm(f => ({ ...f, legalAddress: e.target.value }))} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Habilidades Técnicas — igual que perfil, solo técnicos */}
                {editForm.role === 'tecnico' && (
                  <div className="space-y-6 border-t border-divider pt-6">
                    <div>
                      <h3 className="text-sm font-black text-foreground uppercase tracking-widest mb-1">Mis Habilidades Técnicas</h3>
                      <p className="text-[11px] text-faint">Declara los niveles de competencia por tipo de trabajo (0 = no aplico, 7 = experto).</p>
                    </div>
                    <SkillMatrixForm ref={skillFormRef} hideButton targetUserId={actionModal.userData?.id} />
                  </div>
                )}

                <p className="text-[10px] text-faint text-center border-t border-divider pt-4">
                  El email y la contraseña se modifican desde sus propios controles en la tabla.
                </p>

                <div className="flex gap-3">
                  <button onClick={() => setActionModal({ show: false, type: 'toggle', userData: null })} disabled={processing}
                    className="flex-1 py-3 text-faint font-black text-[10px] uppercase tracking-widest disabled:opacity-50">
                    Cancelar
                  </button>
                  <button onClick={handleUpdateUser} disabled={processing || !editForm.fullName.trim() || editForm.bio.length > 500}
                    className="flex-1 py-4 bg-primary text-inverse rounded-2xl font-bold text-[11px] uppercase tracking-wider shadow-xl transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-3">
                    {processing
                      ? <><div className="w-4 h-4 border-2 border-border border-t-white rounded-full animate-spin" />Guardando...</>
                      : <><Save className="w-5 h-5" />Guardar Cambios</>}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
