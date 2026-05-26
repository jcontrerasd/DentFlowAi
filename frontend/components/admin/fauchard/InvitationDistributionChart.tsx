'use client';

import { motion } from 'framer-motion';

interface InvitationDistributionChartProps {
  data: {
    fullName: string;
    leagueLevel: string;
    invitationsCount: number;
    quotedCount: number;
    acceptedCount: number;
  }[];
}

const LEAGUE_COLORS: Record<string, string> = {
  bronce: 'bg-[#CD7F32]',
  plata: 'bg-[#C0C0C0]',
  oro: 'bg-[#FFD700]',
  elite: 'bg-[#E0E0FF]',
};

export default function InvitationDistributionChart({ data }: InvitationDistributionChartProps) {
  const maxInvs = Math.max(...data.map(d => d.invitationsCount), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Distribución de Invitaciones</h3>
        <div className="flex gap-4">
          {Object.entries(LEAGUE_COLORS).map(([league, color]) => (
            <div key={league} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${color}`} />
              <span className="text-[9px] font-bold uppercase text-faint tracking-tighter">{league}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {data.length === 0 ? (
          <div className="py-12 text-center text-faint text-sm italic border border-dashed border-divider rounded-3xl">
            No hay datos suficientes para el período seleccionado.
          </div>
        ) : (
          data.slice(0, 15).map((tech, i) => {
            const percentage = (tech.invitationsCount / maxInvs) * 100;
            const responseRate = tech.invitationsCount > 0 ? (tech.quotedCount / tech.invitationsCount) * 100 : 0;
            
            return (
              <div key={tech.fullName} className="space-y-1.5 group">
                <div className="flex justify-between items-end px-1">
                  <span className="text-[11px] font-bold text-muted group-hover:text-foreground transition-colors">
                    {tech.fullName}
                  </span>
                  <div className="flex gap-3 text-[10px] font-mono">
                    <span className="text-faint">Invitaciones: <span className="text-foreground">{tech.invitationsCount}</span></span>
                    <span className="text-faint">Resp: <span className="text-primary">{responseRate.toFixed(0)}%</span></span>
                  </div>
                </div>
                
                <div className="h-2 w-full bg-surface rounded-full overflow-hidden border border-divider/50">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.8, delay: i * 0.05, ease: "easeOut" }}
                    className={`h-full ${LEAGUE_COLORS[tech.leagueLevel.toLowerCase()] || 'bg-primary'} relative`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/20" />
                  </motion.div>
                </div>
              </div>
            );
          })
        )}
        {data.length > 15 && (
          <p className="text-center text-[10px] text-faint font-bold uppercase tracking-widest pt-2">
            + {data.length - 15} técnicos adicionales
          </p>
        )}
      </div>
    </div>
  );
}
