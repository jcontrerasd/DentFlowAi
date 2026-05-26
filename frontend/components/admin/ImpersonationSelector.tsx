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
          ? 'bg-error-hl border-error/20 text-error shadow-lg shadow-sm' 
          : 'bg-surface border-divider text-muted hover:text-foreground hover:border-divider'
        }`}
      >
        <ShieldAlert className={`w-4 h-4 ${isSimulating ? 'animate-pulse' : ''}`} />
        <span className="text-[10px] font-bold uppercase tracking-wider hidden lg:block">
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
              className="absolute right-0 mt-3 w-80 bg-surface border border-divider rounded-[2rem] shadow-2xl z-50 overflow-hidden backdrop-blur-xl"
            >
              {/* Encabezado */}
              <div className="p-5 bg-gradient-to-b from-slate-800/50 to-transparent border-b border-divider">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-primary">Elegir Identidad</h3>
                    <button onClick={() => setIsOpen(false)} className="text-faint hover:text-foreground transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                
                {/* Selector de Rol (Tabs) */}
                <div className="p-1 flex gap-1 bg-background/50 rounded-xl">
                    <button 
                    onClick={() => { setRoleMode('dentista'); setSearch(''); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all ${roleMode === 'dentista' ? 'bg-primary text-inverse shadow-lg shadow-sm' : 'text-faint hover:text-muted'}`}
                    >
                    <GraduationCap className="w-3.5 h-3.5" /> Dentista
                    </button>
                    <button 
                    onClick={() => { setRoleMode('tecnico'); setSearch(''); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all ${roleMode === 'tecnico' ? 'bg-orange-500 text-foreground shadow-lg shadow-orange-500/20' : 'text-faint hover:text-muted'}`}
                    >
                    <Microscope className="w-3.5 h-3.5" /> Técnico
                    </button>
                </div>
              </div>

              {/* Buscador */}
              <div className="px-4 py-3 bg-surface">
                 <div className="relative">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                   <input 
                     type="text" 
                     placeholder={`Buscar ${roleMode}...`}
                     className="w-full bg-background border border-divider rounded-xl py-2.5 pl-10 pr-4 text-xs text-foreground focus:outline-none focus:border-primary/30 transition-all"
                     value={search}
                     onChange={(e) => setSearch(e.target.value)}
                   />
                 </div>
              </div>

              {/* Lista de Usuarios */}
              <div className="max-h-64 overflow-y-auto p-2 custom-scrollbar bg-surface">
                {loadingUsers ? (
                  <div className="py-12 flex flex-col items-center gap-3">
                    <div className="w-6 h-6 border-2 border-primary/20 border-t-teal-500 rounded-full animate-spin" />
                    <span className="text-[9px] text-faint font-bold uppercase tracking-widest">Consultando DB...</span>
                  </div>
                ) : filteredUsers.length > 0 ? (
                  <div className="space-y-1">
                    {filteredUsers.map(u => (
                      <button
                        key={u.id}
                        onClick={() => startSimulation(u.id)}
                        className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-surface-off text-left transition-all group relative overflow-hidden"
                      >
                         <div className={`w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center text-muted group-hover:scale-110 transition-transform ${u.role === 'tecnico' ? 'group-hover:text-orange-400' : 'group-hover:text-primary'}`}>
                           <User className="w-5 h-5" />
                         </div>
                         <div className="flex-1 min-w-0">
                           <p className="text-[11px] font-bold text-foreground truncate group-hover:text-primary transition-colors">{u.fullName}</p>
                           <p className="text-[9px] text-faint truncate">{u.organizationName || 'Sin Organización'}</p>
                         </div>
                         <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <UserPlus className="w-4 h-4 text-muted" />
                         </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="py-10 text-center">
                     <p className="text-faint text-[10px] font-bold uppercase tracking-wider mb-1">Sin Resultados</p>
                     <p className="text-[9px] text-faint">Intenta con otro nombre</p>
                  </div>
                )}
              </div>

              {/* Footer / Reset */}
              {isSimulating && (
                <div className="p-4 bg-error border-t border-error/20">
                  <button 
                    onClick={() => {
                        stopSimulation();
                        setIsOpen(false);
                    }}
                    className="w-full py-3 bg-error hover:bg-error text-inverse text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all active:scale-95 shadow-xl shadow-sm"
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
