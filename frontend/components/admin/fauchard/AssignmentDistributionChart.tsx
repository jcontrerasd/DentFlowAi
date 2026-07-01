'use client';

import { motion } from 'framer-motion';

interface AssignmentDistributionChartProps {
  data: {
    fullName: string;
    leagueLevel: string;
    assignmentsCount: number;
    respondedCount: number;
    acceptRate: number;
  }[];
}

const LEAGUE_COLORS: Record<string, string> = {
  bronce: 'bg-[#CD7F32]',
  plata: 'bg-[#C0C0C0]',
  oro: 'bg-[#FFD700]',
  elite: 'bg-[#E0E0FF]',
};

export default function AssignmentDistributionChart({ data }: AssignmentDistributionChartProps) {
  const maxAssign = Math.max(...data.map((d) => d.assignmentsCount), 1);
  const sorted = [...data].sort((a, b) => b.assignmentsCount - a.assignmentsCount);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Distribución de Asignaciones</h3>
        <div className="flex gap-4">
          {Object.entries(LEAGUE_COLORS).map(([league, color]) => (
            <div key={league} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${color}`} />
              <span className="text-[10px] font-bold uppercase text-muted tracking-tighter">{league}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {sorted.length === 0 ? (
          <div className="py-12 text-center text-faint text-sm italic border border-dashed border-divider rounded-3xl">
            No hay datos suficientes para el período seleccionado.
          </div>
        ) : (
          sorted.slice(0, 15).map((tech, i) => {
            const percentage = (tech.assignmentsCount / maxAssign) * 100;
            const responseRate =
              tech.assignmentsCount > 0 ? (tech.respondedCount / tech.assignmentsCount) * 100 : 0;

            return (
              <div key={tech.fullName} className="space-y-1.5 group">
                <div className="flex justify-between items-end px-1">
                  <span className="text-xs font-bold text-foreground group-hover:text-foreground transition-colors">
                    {tech.fullName}
                  </span>
                  <div className="flex gap-3 text-xs font-mono">
                    <span className="text-muted">Asig.: <span className="text-foreground font-bold">{tech.assignmentsCount}</span></span>
                    <span className="text-muted">Resp: <span className="text-primary font-bold">{responseRate.toFixed(0)}%</span></span>
                    <span className="text-muted">Acept: <span className="text-jade font-bold">{(tech.acceptRate * 100).toFixed(0)}%</span></span>
                  </div>
                </div>

                <div className="h-2 w-full bg-surface rounded-full overflow-hidden border border-divider/50">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.8, delay: i * 0.05, ease: 'easeOut' }}
                    className={`h-full ${LEAGUE_COLORS[tech.leagueLevel.toLowerCase()] || 'bg-primary'} relative`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/20" />
                  </motion.div>
                </div>
              </div>
            );
          })
        )}
        {sorted.length > 15 && (
          <p className="text-center text-xs text-muted font-bold uppercase tracking-widest pt-2">
            + {sorted.length - 15} técnicos adicionales
          </p>
        )}
      </div>
    </div>
  );
}
