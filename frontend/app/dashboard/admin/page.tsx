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
  AlertTriangle,
  RefreshCcw,
  Briefcase,
  UserPlus,
  Settings2,
  Activity,
  FlaskConical,
  ChevronRight,
  ListChecks,
  Shield
} from 'lucide-react';
import Link from 'next/link';
import {
  listAllUsersAdmin,
  toggleUserStatusAdmin,
  deleteUserAdmin,
  changeUserPasswordAdmin,
  purgeAllBusinessDataAdmin,
  createCoAdminAction,
  type PurgeReport
} from '@/lib/db/actions/admin';
import { useAuth } from '@/context/AuthContext';

export default function AdminPage() {
  const { userProfile, user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [processing, setProcessing] = useState(false);
  const [purgeState, setPurgeState] = useState<'idle' | 'confirm' | 'running' | 'done'>('idle');
  const [purgeReport, setPurgeReport] = useState<PurgeReport | null>(null);
  const [purgeConfirmInput, setPurgeConfirmInput] = useState('');
  const [actionModal, setActionModal] = useState<{
    show: boolean;
    type: 'toggle' | 'delete' | 'password';
    userData: any;
  }>({ show: false, type: 'toggle', userData: null });

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
      // Cerrar el modal solo si fue exitoso o forzar cierre en caso de error grave si prefieres
      // Por ahora cerramos siempre para desbloquear la UI
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
        <ShieldAlert className="w-16 h-16 text-rose-500 mb-4 animate-pulse" />
        <h1 className="text-2xl font-bold text-white mb-2">Acceso Restringido</h1>
        <p className="text-slate-500">No tienes permisos para ver esta sección.</p>
      </div>
    );
  }

  const handlePurgeData = async () => {
    if (purgeConfirmInput.toUpperCase() !== 'PURGAR') return;
    setPurgeState('running');
    setPurgeReport(null);
    const res = await purgeAllBusinessDataAdmin();
    setPurgeReport(res);
    setPurgeState('done');
    if (res.success) fetchUsers();
  };

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
        <div>
          <h1 className="text-3xl serif-font text-white mb-2 flex items-center gap-3">
            <Users className="text-teal-500 w-8 h-8" /> Control de Usuarios.
          </h1>
          <p className="text-slate-500 text-sm">Gestiona accesos, roles y seguridad global del sistema.</p>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowCreateAdmin(true)}
            className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-teal-900/20 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            Nuevo Administrador
          </button>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              type="text" 
              placeholder="Buscar por nombre, email..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl pl-11 pr-4 py-2.5 text-sm text-white outline-none focus:border-teal-500/50 transition-all w-[240px]"
            />
          </div>
          <button 
            onClick={fetchUsers}
            className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-teal-400 transition-colors"
          >
            <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link href="/dashboard/admin/fauchard">
          <motion.div 
            whileHover={{ y: -5 }}
            className="bg-slate-900/40 border border-slate-800/60 rounded-[2.5rem] p-8 hover:bg-teal-500/5 hover:border-teal-500/30 transition-all group h-full relative overflow-hidden"
          >
            <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-teal-500/5 rounded-full blur-3xl group-hover:bg-teal-500/10 transition-all" />
            <div className="w-12 h-12 bg-teal-500/10 rounded-2xl flex items-center justify-center text-teal-400 mb-6 group-hover:scale-110 transition-transform">
              <Settings2 className="w-6 h-6" />
            </div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">Motor Fauchard</h3>
              <ChevronRight className="w-5 h-5 text-slate-700 group-hover:text-teal-400 transform group-hover:translate-x-1 transition-all" />
            </div>
            <p className="text-slate-500 text-xs leading-relaxed font-medium">
              Configura los pesos del score (calidad, puntualidad, carga), filtros de exclusión y sistema de categorías.
            </p>
          </motion.div>
        </Link>

        <Link href="/dashboard/admin/fauchard/simulate">
          <motion.div
            whileHover={{ y: -5 }}
            className="bg-slate-900/40 border border-slate-800/60 rounded-[2.5rem] p-8 hover:bg-violet-500/5 hover:border-violet-500/30 transition-all group h-full relative overflow-hidden"
          >
            <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-violet-500/5 rounded-full blur-3xl group-hover:bg-violet-500/10 transition-all" />
            <div className="w-12 h-12 bg-violet-500/10 rounded-2xl flex items-center justify-center text-violet-400 mb-6 group-hover:scale-110 transition-transform">
              <FlaskConical className="w-6 h-6" />
            </div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">Simulador de Casos</h3>
              <ChevronRight className="w-5 h-5 text-slate-700 group-hover:text-violet-400 transform group-hover:translate-x-1 transition-all" />
            </div>
            <p className="text-slate-500 text-xs leading-relaxed font-medium">
              Prueba el algoritmo con parámetros personalizados sobre el pool real de técnicos sin afectar datos de producción.
            </p>
          </motion.div>
        </Link>

        <Link href="/dashboard/admin/catalogos">
          <motion.div
            whileHover={{ y: -5 }}
            className="bg-slate-900/40 border border-slate-800/60 rounded-[2.5rem] p-8 hover:bg-amber-500/5 hover:border-amber-500/30 transition-all group h-full relative overflow-hidden"
          >
            <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl group-hover:bg-amber-500/10 transition-all" />
            <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-400 mb-6 group-hover:scale-110 transition-transform">
              <ListChecks className="w-6 h-6" />
            </div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">Catálogos UI</h3>
              <ChevronRight className="w-5 h-5 text-slate-700 group-hover:text-amber-400 transform group-hover:translate-x-1 transition-all" />
            </div>
            <p className="text-slate-500 text-xs leading-relaxed font-medium">
              Administra las listas desplegables del wizard de casos: colores VITA, restauraciones, materiales y niveles de urgencia.
            </p>
          </motion.div>
        </Link>

        <Link href="/dashboard/admin/contactguard">
          <motion.div
            whileHover={{ y: -5 }}
            className="bg-slate-900/40 border border-slate-800/60 rounded-[2.5rem] p-8 hover:bg-rose-500/5 hover:border-rose-500/30 transition-all group h-full relative overflow-hidden"
          >
            <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-rose-500/5 rounded-full blur-3xl group-hover:bg-rose-500/10 transition-all" />
            <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-400 mb-6 group-hover:scale-110 transition-transform">
              <Shield className="w-6 h-6" />
            </div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">ContactGuard</h3>
              <ChevronRight className="w-5 h-5 text-slate-700 group-hover:text-rose-400 transform group-hover:translate-x-1 transition-all" />
            </div>
            <p className="text-slate-500 text-xs leading-relaxed font-medium">
              Reglas anti-desintermediación, couriers permitidos y auditoría de intentos de comunicación indebida.
            </p>
          </motion.div>
        </Link>

        <Link href="/dashboard/admin/fauchard/monitor">
          <motion.div
            whileHover={{ y: -5 }}
            className="bg-slate-900/40 border border-slate-800/60 rounded-[2.5rem] p-8 hover:bg-sky-500/5 hover:border-sky-500/30 transition-all group h-full relative overflow-hidden"
          >
            <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-sky-500/5 rounded-full blur-3xl group-hover:bg-sky-500/10 transition-all" />
            <div className="w-12 h-12 bg-sky-500/10 rounded-2xl flex items-center justify-center text-sky-400 mb-6 group-hover:scale-110 transition-transform">
              <Activity className="w-6 h-6" />
            </div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">Monitor de Equidad</h3>
              <ChevronRight className="w-5 h-5 text-slate-700 group-hover:text-sky-400 transform group-hover:translate-x-1 transition-all" />
            </div>
            <p className="text-slate-500 text-xs leading-relaxed font-medium">
              Métricas de distribución, alertas de concentración y ranking de técnicos por período.
            </p>
          </motion.div>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-10 h-10 border-4 border-teal-500/20 border-t-teal-500 rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-[2rem] overflow-hidden backdrop-blur-sm">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-800/60 text-[10px] uppercase tracking-widest text-slate-500 font-black">
                  <th className="px-8 py-5">Usuario</th>
                  <th className="px-6 py-5">Rol / Organización</th>
                  <th className="px-6 py-5">Estado / Onboarding</th>
                  <th className="px-6 py-5">Creado</th>
                  <th className="px-8 py-5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-teal-500/5 transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex flex-col">
                        <span className="text-white font-bold text-sm tracking-tight">{u.fullName || 'Sin Nombre'}</span>
                        <span className="text-slate-500 text-xs">{u.email}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md inline-block w-max ${
                          u.role === 'admin' ? 'bg-rose-500/10 text-rose-400' : 
                          u.role === 'dentista' ? 'bg-blue-500/10 text-blue-400' : 'bg-orange-500/10 text-orange-400'
                        }`}>
                          {u.role}
                        </span>
                        <span className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1">
                          <Briefcase className="w-3 h-3" /> {u.organizationName || 'Sin Org'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${u.isActive ? 'bg-teal-500' : 'bg-rose-500 animate-pulse'}`} />
                          <span className={`text-[11px] font-bold uppercase ${u.isActive ? 'text-white' : 'text-rose-400'}`}>
                            {u.isActive ? 'Activo' : 'Bloqueado'}
                          </span>
                        </div>
                        <div className="w-24 h-1 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-teal-500" style={{ width: `${u.onboardingStep || 0}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-slate-500 text-xs">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => setActionModal({ show: true, type: 'toggle', userData: u })}
                          className={`p-2 rounded-lg transition-colors ${u.isActive ? 'text-slate-500 hover:text-rose-400 hover:bg-rose-400/10' : 'text-teal-400 hover:bg-teal-400/10'}`}
                          title={u.isActive ? 'Bloquear' : 'Activar'}
                        >
                          {u.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </button>
                        <button 
                          onClick={() => setActionModal({ show: true, type: 'password', userData: u })}
                          className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                          title="Cambiar Contraseña"
                        >
                          <Lock className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setActionModal({ show: true, type: 'delete', userData: u })}
                          className="p-2 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Danger Zone */}
      <div className="mt-12 p-8 border border-dashed border-rose-500/20 rounded-[2.5rem] bg-rose-500/5">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl serif-font text-white">Zona de Alta Peligrosidad</h3>
            <p className="text-rose-400/60 text-sm">Operaciones irreversibles que afectan la integridad de todo el sistema.</p>
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <p className="text-slate-500 text-xs max-w-xl">
            La purga total eliminará todos los casos, bids, archivos y usuarios del sistema. 
            <strong> Se mantendrá únicamente tu perfil de administrador </strong> para no perder el acceso a este panel.
          </p>
          <button
            onClick={() => { setPurgeConfirmInput(''); setPurgeState('confirm'); setShowPurgeConfirm(true); }}
            className="px-8 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-2xl shadow-rose-900/20 transition-all"
          >
            Purgar toda la base de datos
          </button>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {/* Modal de Acción (Toggle/Delete) */}
        {actionModal.show && actionModal.type !== 'password' && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/60">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`w-full max-w-md bg-slate-900 border-2 rounded-[2.5rem] p-10 shadow-2xl ${
                actionModal.type === 'delete' ? 'border-rose-500/30' : 'border-teal-500/30'
              }`}
            >
              <div className="flex items-center gap-4 mb-6">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                  actionModal.type === 'delete' ? 'bg-rose-500/10 text-rose-500' : 'bg-teal-500/10 text-teal-500'
                }`}>
                  {actionModal.type === 'delete' ? <Trash2 className="w-7 h-7" /> : <ShieldAlert className="w-7 h-7" />}
                </div>
                <h3 className="text-2xl serif-font text-white">¿Estás seguro?</h3>
              </div>

              <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                {actionModal.type === 'delete' ? (
                  <>Estás a punto de eliminar a <span className="text-white font-bold">{actionModal.userData.fullName}</span>. 
                  Esta acción es irreversible y borrará sus archivos en la nube.</>
                ) : (
                  <>Vas a {actionModal.userData.isActive ? 'BLOQUEAR' : 'ACTIVAR'} el acceso de 
                  <span className="text-white font-bold"> {actionModal.userData.fullName}</span> al sistema.</>
                )}
              </p>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={executeAction}
                  disabled={processing}
                  className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
                    actionModal.type === 'delete' ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/20' : 'bg-teal-600 hover:bg-teal-500 text-white shadow-teal-900/20'
                  } shadow-xl flex items-center justify-center gap-2`}
                >
                  {processing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Procesando...
                    </>
                  ) : 'Confirmar Acción'}
                </button>
                <button 
                  onClick={() => setActionModal({ show: false, type: 'toggle', userData: null })}
                  disabled={processing}
                  className="w-full py-4 text-slate-500 font-black text-xs uppercase tracking-widest hover:text-white transition-colors disabled:opacity-50"
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
              className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 shadow-2xl"
            >
              <h3 className="text-2xl serif-font text-white mb-2">Resetear Contraseña</h3>
              <p className="text-slate-500 text-xs mb-8 uppercase tracking-widest font-bold">Usuario: {actionModal.userData.fullName}</p>
              
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2 block">Nueva Contraseña</label>
                  <input 
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white outline-none focus:border-teal-500/50"
                    placeholder="••••••••"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button onClick={() => setActionModal({ show: false, type: 'toggle', userData: null })} className="flex-1 py-3 text-slate-500 font-black text-[10px] uppercase tracking-widest">Cancelar</button>
                  <button onClick={async () => {
                    const res = await changeUserPasswordAdmin(actionModal.userData.id, newPassword);
                    if (res.success) {
                      alert('Contraseña actualizada');
                      setActionModal({ show: false, type: 'toggle', userData: null });
                      setNewPassword('');
                    }
                  }} className="flex-1 py-3 bg-teal-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest">Actualizar</button>
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
              className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 shadow-2xl"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-teal-500/20 rounded-2xl flex items-center justify-center text-teal-500">
                  <UserPlus className="w-6 h-6" />
                </div>
                <h3 className="text-2xl serif-font text-white">Nuevo Co-Admin</h3>
              </div>
              
              <div className="space-y-6">
                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-slate-400 text-xs leading-relaxed">
                  Se creará una cuenta con nombre secuencial (ej. Admin002) y rol de administrador completo, 
                  clonando los datos de tu organización.
                </div>
                
                <div>
                  <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2 block ml-1">Establecer Contraseña</label>
                  <input 
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white outline-none focus:border-teal-500/50"
                    placeholder="Contraseña del nuevo Admin"
                  />
                </div>
                
                <div className="flex gap-3 pt-4">
                  <button onClick={() => setShowCreateAdmin(false)} className="flex-1 py-3 text-slate-500 font-black text-[10px] uppercase tracking-widest">Cerrar</button>
                  <button onClick={handleCreateAdmin} className="flex-1 py-3 bg-teal-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-teal-900/20 transition-all">Crear Admin</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showPurgeConfirm && purgeState === 'confirm' && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/60">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-3xl bg-slate-900 border-2 border-rose-500/50 rounded-[2.5rem] p-10 shadow-[0_0_50px_rgba(244,63,94,0.2)] max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-rose-500/20 rounded-2xl flex items-center justify-center text-rose-500">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <h3 className="text-3xl serif-font text-white">¿Estás seguro?</h3>
              </div>

              <div className="space-y-3 text-slate-400 text-sm mb-4 leading-relaxed">
                <p>Estás a punto de ejecutar una <span className="text-white font-bold underline">Purga Total</span> de los datos de negocio. Revisa el alcance exacto antes de continuar:</p>
              </div>

              <PurgeScopeTable />

              <p className="text-rose-400 font-black italic text-sm my-5">Esta acción no se puede deshacer.</p>

              <div className="mb-6">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                  Escribe <span className="text-rose-400">PURGAR</span> para confirmar
                </label>
                <input
                  type="text"
                  value={purgeConfirmInput}
                  onChange={e => setPurgeConfirmInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && purgeConfirmInput.toUpperCase() === 'PURGAR' && handlePurgeData()}
                  placeholder="PURGAR"
                  autoFocus
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white font-black text-sm placeholder:text-slate-600 focus:outline-none focus:border-rose-500 transition-colors"
                />
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={handlePurgeData}
                  disabled={purgeConfirmInput.toUpperCase() !== 'PURGAR'}
                  className="w-full py-4 bg-rose-600 hover:bg-rose-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all"
                >
                  Ejecutar purga
                </button>
                <button
                  onClick={() => { setShowPurgeConfirm(false); setPurgeState('idle'); setPurgeConfirmInput(''); }}
                  className="w-full py-4 text-slate-500 font-black text-xs uppercase tracking-widest hover:text-white transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Modal de progreso / reporte de purga */}
        {(purgeState === 'running' || purgeState === 'done') && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/70">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-[2rem] p-8 shadow-2xl"
            >
              {purgeState === 'running' && (
                <div className="flex flex-col items-center gap-4 py-6">
                  <div className="w-12 h-12 border-2 border-rose-500/30 border-t-rose-400 rounded-full animate-spin" />
                  <p className="text-white font-black text-sm uppercase tracking-widest">Ejecutando purga…</p>
                  <p className="text-slate-500 text-xs text-center">No cierres esta ventana. Eliminando datos y archivos GCS.</p>
                </div>
              )}

              {purgeState === 'done' && purgeReport && (
                <>
                  <div className="flex items-center gap-3 mb-6">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${purgeReport.success ? 'bg-teal-500/20 text-teal-400' : 'bg-rose-500/20 text-rose-400'}`}>
                      {purgeReport.success ? <Activity className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="text-white font-black text-sm">{purgeReport.success ? 'Purga completada' : 'Error durante la purga'}</p>
                      {purgeReport.error && <p className="text-rose-400 text-xs mt-0.5">{purgeReport.error}</p>}
                    </div>
                  </div>

                  {/* Pasos ejecutados */}
                  <div className="space-y-2 mb-6">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Detalle de ejecución</p>
                    {purgeReport.steps.map((step) => (
                      <div key={step.key} className="flex items-center justify-between py-2 px-3 bg-slate-800/60 rounded-xl">
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${step.status === 'done' ? 'bg-teal-400' : 'bg-slate-600'}`} />
                          <span className="text-slate-300 text-xs">{step.label}</span>
                        </div>
                        {step.count !== undefined && (
                          <span className="text-[11px] font-black text-white tabular-nums">{step.count}</span>
                        )}
                        {step.status === 'skipped' && (
                          <span className="text-[10px] text-slate-600 uppercase tracking-wider">vacío</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Resumen de lo preservado */}
                  {purgeReport.success && (
                    <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-4 mb-6">
                      <p className="text-[10px] font-black text-teal-400 uppercase tracking-widest mb-2">Preservado intacto</p>
                      <div className="flex gap-6">
                        <div>
                          <p className="text-2xl font-black text-white tabular-nums">{purgeReport.preserved.users}</p>
                          <p className="text-[10px] text-slate-400">usuarios</p>
                        </div>
                        <div>
                          <p className="text-2xl font-black text-white tabular-nums">{purgeReport.preserved.organizations}</p>
                          <p className="text-[10px] text-slate-400">organizaciones</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => { setPurgeState('idle'); setShowPurgeConfirm(false); setPurgeReport(null); }}
                    className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all"
                  >
                    Cerrar
                  </button>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Inventario completo de tablas + alcance de la purga (28 filas).
// Mantener sincronizado con purgeAllBusinessDataAdmin() en lib/db/actions/admin.ts
// y con schema.ts (FKs y ON DELETE).
// ─────────────────────────────────────────────────────────────

type PurgeMode = 'explicit' | 'cascade' | 'gcs' | 'reset' | 'never';

const PURGE_INVENTORY: { table: string; desc: string; mode: PurgeMode }[] = [
  // Storage
  { table: 'GCS bucket', desc: 'Archivos físicos (STL/imágenes) de todos los casos', mode: 'gcs' },

  // Borrado explícito (DELETE en la action)
  { table: 'clinical_case', desc: 'Casos clínicos (entidad raíz)', mode: 'explicit' },
  { table: 'clinical_case_event', desc: 'Historial de eventos UCH', mode: 'explicit' },
  { table: 'clinical_case_delivery', desc: 'Entregas de diseño / revisiones', mode: 'explicit' },
  { table: 'case_invitation', desc: 'Invitaciones Fauchard + cotizaciones', mode: 'explicit' },
  { table: 'commercial_round', desc: 'Rondas comerciales', mode: 'explicit' },
  { table: 'bid', desc: 'Ofertas legacy', mode: 'explicit' },
  { table: 'review', desc: 'Reseñas dentista ↔ técnico', mode: 'explicit' },
  { table: 'annotation', desc: 'Anotaciones 3D', mode: 'explicit' },
  { table: 'file', desc: 'Registros DB de archivos (FK SET NULL, requiere explícito)', mode: 'explicit' },
  { table: 'contact_guard_audit', desc: 'Auditoría de intentos de bypass (FK SET NULL)', mode: 'explicit' },
  { table: 'audit_log', desc: 'Log genérico de acciones (FK SET NULL)', mode: 'explicit' },

  // Borrado por cascade (no DELETE explícito; FK CASCADE desde clinical_case)
  { table: 'case_user_archive', desc: 'Marcas de archivado por usuario sobre casos', mode: 'cascade' },
  { table: 'clinical_case_hub_read', desc: 'Cursores de lectura del UCH (no leídos)', mode: 'cascade' },

  // Reset parcial de estado operacional (no borra la fila, solo limpia campos derivados)
  { table: 'user (técnicos)', desc: 'Reset de contadores Fauchard: consecutive_no_response=0, suspended_until=null, last_invited_at=null, league_transition_count=0 (leagueLevel se preserva)', mode: 'reset' },

  // Nunca se borra (usuarios, auth, config, catálogos)
  { table: 'user', desc: 'Usuarios (filas + perfil + leagueLevel)', mode: 'never' },
  { table: 'organization', desc: 'Clínicas y laboratorios', mode: 'never' },
  { table: 'accounts', desc: 'Cuentas OAuth (NextAuth)', mode: 'never' },
  { table: 'sessions', desc: 'Sesiones activas (NextAuth)', mode: 'never' },
  { table: 'verificationToken', desc: 'Tokens de verificación de email', mode: 'never' },
  { table: 'technician_skill', desc: 'Matriz de habilidades del técnico', mode: 'never' },
  { table: 'fauchard_config', desc: 'Configuración del motor Fauchard', mode: 'never' },
  { table: 'fauchard_config_log', desc: 'Historial de cambios de config Fauchard', mode: 'never' },
  { table: 'vita_shade', desc: 'Catálogo UI: colores VITA', mode: 'never' },
  { table: 'restoration_type', desc: 'Catálogo UI: tipos de restauración', mode: 'never' },
  { table: 'dental_material', desc: 'Catálogo UI: materiales', mode: 'never' },
  { table: 'urgency_level', desc: 'Catálogo UI: niveles de urgencia', mode: 'never' },
  { table: 'contact_guard_rule', desc: 'Reglas anti-bypass (sistema)', mode: 'never' },
  { table: 'contact_guard_courier_allowlist', desc: 'Allowlist de couriers (sistema)', mode: 'never' },
];

const MODE_META: Record<PurgeMode, { label: string; badge: string; row: string }> = {
  explicit: {
    label: 'Borrado explícito',
    badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    row: 'border-l-2 border-rose-500/60',
  },
  cascade: {
    label: 'Cascade (FK)',
    badge: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    row: 'border-l-2 border-orange-500/60',
  },
  gcs: {
    label: 'Storage (GCS)',
    badge: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40',
    row: 'border-l-2 border-fuchsia-500/60',
  },
  reset: {
    label: 'Reset parcial',
    badge: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    row: 'border-l-2 border-sky-500/60',
  },
  never: {
    label: 'Nunca se borra',
    badge: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
    row: 'border-l-2 border-teal-500/60',
  },
};

function PurgeScopeTable() {
  const counts = PURGE_INVENTORY.reduce<Record<PurgeMode, number>>((acc, r) => {
    acc[r.mode] = (acc[r.mode] || 0) + 1;
    return acc;
  }, { explicit: 0, cascade: 0, gcs: 0, reset: 0, never: 0 });

  return (
    <div className="space-y-3">
      {/* Leyenda */}
      <div className="flex flex-wrap gap-2">
        {(['explicit', 'cascade', 'gcs', 'reset', 'never'] as PurgeMode[]).map(m => (
          <span
            key={m}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest ${MODE_META[m].badge}`}
          >
            {MODE_META[m].label}
            <span className="opacity-70">({counts[m]})</span>
          </span>
        ))}
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-slate-700/60 overflow-hidden">
        <div className="max-h-[55vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-800/95 backdrop-blur z-10">
              <tr className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="px-3 py-2 w-8">#</th>
                <th className="px-3 py-2">Tabla</th>
                <th className="px-3 py-2">Qué es</th>
                <th className="px-3 py-2 w-32">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {PURGE_INVENTORY.map((r, i) => (
                <tr key={r.table} className={`hover:bg-white/[0.03] ${MODE_META[r.mode].row}`}>
                  <td className="px-3 py-2 text-slate-600 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2"><code className="text-white font-bold">{r.table}</code></td>
                  <td className="px-3 py-2 text-slate-400 leading-snug">{r.desc}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest ${MODE_META[r.mode].badge}`}>
                      {MODE_META[r.mode].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 leading-snug">
        <span className="text-rose-300 font-bold">Explícito</span>: la action ejecuta DELETE individual.{' '}
        <span className="text-orange-300 font-bold">Cascade</span>: se borra automáticamente al borrar <code>clinical_case</code> (FK ON DELETE CASCADE).{' '}
        <span className="text-sky-300 font-bold">Reset parcial</span>: la fila se preserva, solo se limpian campos operacionales derivados (contadores Fauchard).{' '}
        <span className="text-teal-300 font-bold">Nunca</span>: usuarios, auth, configuración Fauchard, catálogos UI y reglas del sistema se preservan.
      </p>
    </div>
  );
}
