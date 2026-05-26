'use client';

import { useState } from 'react';
import { toggleTechnicianAvailabilityAdminAction } from '@/lib/db/actions/fauchard';
import { 
  User, 
  Trophy, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  ExternalLink,
  Search,
  Filter,
  Activity
} from 'lucide-react';
import { motion } from 'framer-motion';

interface TechnicianRankingTableProps {
  data: any[];
}

export default function TechnicianRankingTable({ data }: TechnicianRankingTableProps) {
  const [techs, setTechs] = useState(data);
  const [filter, setFilter] = useState('');
  const [leagueFilter, setLeagueFilter] = useState('all');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleToggleAvailability = async (id: string, current: boolean) => {
    setProcessingId(id);
    const res = await toggleTechnicianAvailabilityAdminAction(id, !current);
    if (res.success) {
      setTechs(prev => prev.map(t => t.technicianId === id ? { ...t, isAvailable: !current } : t));
    }
    setProcessingId(null);
  };

  const filtered = techs.filter(t => {
    const matchesSearch = t.fullName.toLowerCase().includes(filter.toLowerCase());
    const matchesLeague = leagueFilter === 'all' || t.leagueLevel.toLowerCase() === leagueFilter;
    return matchesSearch && matchesLeague;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Ranking de Técnicos</h3>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-faint" />
            <input
              type="text"
              placeholder="Buscar técnico..."
              className="w-full bg-surface border border-divider rounded-xl pl-9 pr-4 py-2 text-[11px] text-foreground focus:outline-none focus:border-primary/30"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <select 
            className="bg-surface border border-divider rounded-xl px-3 py-2 text-[11px] font-bold text-muted outline-none uppercase tracking-widest"
            value={leagueFilter}
            onChange={(e) => setLeagueFilter(e.target.value)}
          >
            <option value="all">Todas las Categorías</option>
            <option value="bronce">Bronce</option>
            <option value="plata">Plata</option>
            <option value="oro">Oro</option>
            <option value="elite">Élite</option>
          </select>
        </div>
      </div>

      <div className="rounded-[2.5rem] border border-divider overflow-hidden bg-surface/20">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface border-b border-divider text-[9px] font-bold uppercase tracking-wider text-faint">
              <th className="px-6 py-5">Técnico</th>
              <th className="px-6 py-5">Score Actual</th>
              <th className="px-6 py-5">Desempeño (30d)</th>
              <th className="px-6 py-5">Tasa Resp.</th>
              <th className="px-6 py-5">Últ. Inv.</th>
              <th className="px-6 py-5 text-center">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {filtered.map((t) => (
              <tr key={t.technicianId} className="hover:bg-surface-2/30 transition-colors group">
                <td className="px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-surface-2 border border-divider flex items-center justify-center text-muted">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-black text-foreground uppercase tracking-tight">{t.fullName}</span>
                      <span className={`text-[9px] font-bold uppercase tracking-wider ${
                        t.leagueLevel.toLowerCase() === 'elite' ? 'text-indigo-400' :
                        t.leagueLevel.toLowerCase() === 'oro' ? 'text-warning' :
                        t.leagueLevel.toLowerCase() === 'plata' ? 'text-muted' : 'text-orange-600'
                      }`}>
                        {t.leagueLevel}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-5">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-3 h-3 text-primary" />
                    <span className="text-xs font-mono font-bold text-foreground">{t.currentScore.toFixed(3)}</span>
                  </div>
                </td>
                <td className="px-6 py-5">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-[10px] font-medium text-muted">
                      <span>Inv: <b className="text-foreground">{t.invitationsCount}</b></span>
                      <span className="w-1 h-1 bg-surface-off rounded-full" />
                      <span>Gan: <b className="text-primary">{t.acceptedCount}</b></span>
                    </div>
                    <div className="w-20 h-1 bg-surface-2 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary" 
                        style={{ width: `${t.winRate * 100}%` }} 
                      />
                    </div>
                  </div>
                </td>
                <td className="px-6 py-5">
                  <span className={`text-[10px] font-mono font-bold ${t.responseRate > 0.8 ? 'text-primary' : t.responseRate > 0.5 ? 'text-warning' : 'text-error'}`}>
                    {(t.responseRate * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="px-6 py-5">
                  <div className="flex items-center gap-1.5 text-[10px] font-medium text-faint">
                    <Clock className="w-3 h-3" />
                    {t.daysWithoutInvitation === 999 ? 'Nunca' : `${t.daysWithoutInvitation}d ago`}
                  </div>
                </td>
                <td className="px-6 py-5">
                  <div className="flex items-center justify-center">
                    <button
                      onClick={() => handleToggleAvailability(t.technicianId, t.isAvailable)}
                      disabled={processingId === t.technicianId}
                      className={`
                        relative w-12 h-6 rounded-full transition-all duration-300 flex items-center px-1
                        ${t.isAvailable ? 'bg-primary-hl border border-primary/30' : 'bg-error/20 border border-error/20'}
                        ${processingId === t.technicianId ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
                      `}
                    >
                      <motion.div
                        animate={{ x: t.isAvailable ? 24 : 0 }}
                        className={`w-4 h-4 rounded-full shadow-lg ${t.isAvailable ? 'bg-primary' : 'bg-error'}`}
                      />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
