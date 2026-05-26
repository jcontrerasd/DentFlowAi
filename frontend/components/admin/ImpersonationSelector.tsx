'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getUsersByRoleAction } from '@/lib/db/actions/user';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Search, X, ChevronDown, ShieldAlert, GraduationCap, Microscope, UserPlus } from 'lucide-react';

export default function ImpersonationSelector() {
  const { user, userProfile, isSimulating, startSimulation, stopSimulation, simulatedProfile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [roleMode, setRoleMode] = useState<'dentista' | 'tecnico'>('dentista');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  // Solo mostrar para el dueño o administradores maestros
  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
        const results = await getUsersByRoleAction(roleMode);
        setAvailableUsers(results);
    } catch (e) {
        setAvailableUsers([]);
    } finally {
        setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchUsers();
  }, [isOpen, roleMode]);

  const isMasterAdmin = user?.email === 'jaime.contreras.d@gmail.com' || userProfile?.role === 'admin';
  if (!isMasterAdmin) return null;

  const filteredUsers = availableUsers.filter(u => 
    u.fullName?.toLowerCase().includes(search.toLowerCase()) || 
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative">
      {/* Botón Principal / Trigger */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${
          isSimulating 
          ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 shadow-lg shadow-rose-900/20' 
          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
        }`}
      >
        <ShieldAlert className={`w-4 h-4 ${isSimulating ? 'animate-pulse' : ''}`} />
        <span className="text-[10px] font-black uppercase tracking-widest hidden lg:block">
          {isSimulating ? `Mimetizado: ${simulatedProfile?.fullName || 'Usuario'}` : 'Simulación Maestro'}
        </span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop para cerrar */}
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            
            {/* Popover */}
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-3 w-80 bg-slate-900 border border-slate-800 rounded-[2rem] shadow-2xl z-50 overflow-hidden backdrop-blur-xl"
            >
              {/* Encabezado */}
              <div className="p-5 bg-gradient-to-b from-slate-800/50 to-transparent border-b border-white/5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-teal-500">Elegir Identidad</h3>
                    <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-white transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                
                {/* Selector de Rol (Tabs) */}
                <div className="p-1 flex gap-1 bg-slate-950/50 rounded-xl">
                    <button 
                    onClick={() => { setRoleMode('dentista'); setSearch(''); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all ${roleMode === 'dentista' ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                    <GraduationCap className="w-3.5 h-3.5" /> Dentista
                    </button>
                    <button 
                    onClick={() => { setRoleMode('tecnico'); setSearch(''); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all ${roleMode === 'tecnico' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                    <Microscope className="w-3.5 h-3.5" /> Técnico
                    </button>
                </div>
              </div>

              {/* Buscador */}
              <div className="px-4 py-3 bg-slate-900">
                 <div className="relative">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                   <input 
                     type="text" 
                     placeholder={`Buscar ${roleMode}...`}
                     className="w-full bg-slate-950 border border-white/5 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white focus:outline-none focus:border-teal-500/50 transition-all"
                     value={search}
                     onChange={(e) => setSearch(e.target.value)}
                   />
                 </div>
              </div>

              {/* Lista de Usuarios */}
              <div className="max-h-64 overflow-y-auto p-2 custom-scrollbar bg-slate-900">
                {loadingUsers ? (
                  <div className="py-12 flex flex-col items-center gap-3">
                    <div className="w-6 h-6 border-2 border-teal-500/20 border-t-teal-500 rounded-full animate-spin" />
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Consultando DB...</span>
                  </div>
                ) : filteredUsers.length > 0 ? (
                  <div className="space-y-1">
                    {filteredUsers.map(u => (
                      <button
                        key={u.id}
                        onClick={() => startSimulation(u.id)}
                        className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-white/5 text-left transition-all group relative overflow-hidden"
                      >
                         <div className={`w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 group-hover:scale-110 transition-transform ${u.role === 'tecnico' ? 'group-hover:text-orange-400' : 'group-hover:text-teal-400'}`}>
                           <User className="w-5 h-5" />
                         </div>
                         <div className="flex-1 min-w-0">
                           <p className="text-[11px] font-bold text-white truncate group-hover:text-teal-400 transition-colors">{u.fullName}</p>
                           <p className="text-[9px] text-slate-500 truncate">{u.organizationName || 'Sin Organización'}</p>
                         </div>
                         <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <UserPlus className="w-4 h-4 text-slate-400" />
                         </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="py-10 text-center">
                     <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest mb-1">Sin Resultados</p>
                     <p className="text-[9px] text-slate-700">Intenta con otro nombre</p>
                  </div>
                )}
              </div>

              {/* Footer / Reset */}
              {isSimulating && (
                <div className="p-4 bg-rose-500/5 border-t border-rose-500/10">
                  <button 
                    onClick={() => {
                        stopSimulation();
                        setIsOpen(false);
                    }}
                    className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 shadow-xl shadow-rose-900/20"
                  >
                    Detener Simulación
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
