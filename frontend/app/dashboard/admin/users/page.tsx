'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  ShieldAlert,
  Trash2,
  Lock,
  UserCheck,
  UserX,
  Search,
  RefreshCcw,
  Briefcase,
  UserPlus,
  ArrowLeft,
  ShieldCheck,
  ClipboardCheck,
} from 'lucide-react';
import Link from 'next/link';
import ResetNoResponseModal from '@/components/admin/technicians/ResetNoResponseModal';
import {
  listAllUsersAdmin,
  toggleUserStatusAdmin,
  deleteUserAdmin,
  changeUserPasswordAdmin,
  createCoAdminAction,
  createCalidadUserAction,
} from '@/lib/db/actions/admin';
import { useAuth } from '@/context/AuthContext';

export default function AdminUsersPage() {
  const { userProfile, user } = useAuth();
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
    type: 'toggle' | 'delete' | 'password';
    userData: any;
  }>({ show: false, type: 'toggle', userData: null });
  const [resetModal, setResetModal] = useState<{ show: boolean; userId: string; userName: string }>({ show: false, userId: '', userName: '' });

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
      alert(`¡Admin creado con éxito!\nNombre: ${res.data.name}\nEmail: ${res.data.email}`);
      setShowCreateAdmin(false);
      setAdminPassword('');
      fetchUsers();
    } else {
      alert(res.error || 'Error al crear administrador.');
    }
  };

  const handleCreateCalidad = async () => {
    if (!calidadForm.fullName || !calidadForm.email || !calidadForm.password) return;
    const res = await createCalidadUserAction(calidadForm);
    if (res.success && res.data) {
      alert(`¡Revisor de Calidad creado!\nNombre: ${res.data.name}\nEmail: ${res.data.email}`);
      setShowCreateCalidad(false);
      setCalidadForm({ fullName: '', email: '', password: '' });
      fetchUsers();
    } else {
      alert(res.error || 'Error al crear revisor de Calidad.');
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
        // Optimistic delete
        setUsers(prev => prev.filter(u => u.id !== userData.id));
      }

      if (res?.success) {
        await fetchUsers(); // Recargar datos reales
        setActionModal({ show: false, type: 'toggle', userData: null });
      } else {
        alert("Error: " + (res?.error || "No se pudo completar la acción"));
      }
    } catch (error) {
       console.error("Error executing action:", error);
       alert("Error de conexión con el servidor");
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
                          onClick={() => setActionModal({ show: true, type: 'toggle', userData: u })}
                          className={`p-2 rounded-lg transition-colors ${u.isActive ? 'text-faint hover:text-error hover:bg-error/10' : 'text-primary hover:opacity-90/10'}`}
                          title={u.isActive ? 'Bloquear' : 'Activar'}
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
        {actionModal.show && actionModal.type !== 'password' && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/60">
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

        {/* Modal de Password */}
        {actionModal.show && actionModal.type === 'password' && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/60">
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
                      alert('Contraseña actualizada');
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
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/60">
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
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/60">
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
      </AnimatePresence>
    </div>
  );
}
