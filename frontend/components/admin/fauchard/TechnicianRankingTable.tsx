'use client';

import { useState } from 'react';
import {
  User,
  Trophy,
  Clock,
  Search,
  Activity,
  Medal,
  TrendingUp
} from 'lucide-react';

interface TechnicianRankingTableProps {
  data: any[];
  days: number;
}

function leagueColor(league: string): string {
  const l = (league ?? '').toLowerCase();
  if (l === 'elite') return 'text-primary';
  if (l === 'oro') return 'text-warning';
  if (l === 'plata') return 'text-muted';
  return 'text-orange-600';
}

export default function TechnicianRankingTable({ data, days }: TechnicianRankingTableProps) {
  const [filter, setFilter] = useState('');
  const [leagueFilter, setLeagueFilter] = useState('all');

  const filtered = data.filter(t => {
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

      <div className="rounded-[2.5rem] border border-divider overflow-x-auto bg-surface/20">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface border-b border-divider text-[9px] font-bold uppercase tracking-wider text-faint">
              <th className="px-6 py-5">Técnico</th>
              <th className="px-6 py-5">Score Prom.</th>
              <th className="px-6 py-5">{`Desempeño (${days}d)`}</th>
              <th className="px-6 py-5">Tasa Resp.</th>
              <th className="px-6 py-5">Últ. Asig.</th>
              <th className="px-6 py-5 text-center">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {filtered.map((t) => (
              <tr key={t.technicianId} className="hover:bg-surface-2/30 transition-colors group">
                <td className="px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-8 h-8 rounded-xl bg-surface-2 border border-divider flex items-center justify-center text-muted">
                        <User className="w-4 h-4" />
                      </div>
                      <span
                        className={`absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-full bg-surface border border-divider flex items-center justify-center ${leagueColor(t.leagueLevel)}`}
                        title={`Categoría: ${t.leagueLevel}`}
                      >
                        <Medal className="w-2.5 h-2.5" />
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-black text-foreground uppercase tracking-tight">{t.fullName}</span>
                      <span className="flex items-center gap-1.5">
                        <span className={`text-[9px] font-bold uppercase tracking-wider ${leagueColor(t.leagueLevel)}`}>
                          {t.leagueLevel}
                        </span>
                        {t.leagueInTransition && (
                          <span className="inline-flex items-center gap-0.5 text-[8px] font-bold uppercase tracking-wider text-warning" title="En período de transición tras ascender">
                            <TrendingUp className="w-2.5 h-2.5" /> Transición
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-5">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-3 h-3 text-primary" />
                    {t.avgScore != null
                      ? <span className="text-xs font-mono font-bold text-foreground">{t.avgScore.toFixed(3)}</span>
                      : <span className="text-xs font-mono text-faint">—</span>
                    }
                  </div>
                </td>
                <td className="px-6 py-5">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-[10px] font-medium text-muted">
                      <span>Asig: <b className="text-foreground">{t.assignmentsCount}</b></span>
                      <span className="w-1 h-1 bg-surface-off rounded-full" />
                      <span>Acept: <b className="text-primary">{t.acceptedCount}</b></span>
                      <span className="w-1 h-1 bg-surface-off rounded-full" />
                      <span>Exp: <b className="text-warning">{t.expiredCount}</b></span>
                    </div>
                    <div className="w-20 h-1 bg-surface-2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${t.acceptRate * 100}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-6 py-5">
                  <span className={`text-[10px] font-mono font-bold ${t.technicianResponseRate > 0.8 ? 'text-primary' : t.technicianResponseRate > 0.5 ? 'text-warning' : 'text-error'}`}>
                    {(t.technicianResponseRate * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="px-6 py-5">
                  <div className="flex items-center gap-1.5 text-[10px] font-medium text-faint">
                    <Clock className="w-3 h-3" />
                    {t.daysWithoutAssignment === 999 ? 'Nunca' : `hace ${t.daysWithoutAssignment}d`}
                  </div>
                </td>
                <td className="px-6 py-5">
                  <div className="flex items-center justify-center">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-semibold ${
                      t.isAvailable
                        ? 'bg-primary-hl text-primary border-primary/20'
                        : 'bg-error-hl text-error border-error/30'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${t.isAvailable ? 'bg-primary' : 'bg-error'}`} />
                      {t.isAvailable ? 'Disponible' : 'No disponible'}
                    </span>
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
