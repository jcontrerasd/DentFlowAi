'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings2, Activity, FlaskConical } from 'lucide-react';
import { motion } from 'framer-motion';

export default function FauchardNav({ className }: { className?: string }) {
  const pathname = usePathname();

  // Demo guiada (guided-demo) queda descolgada del menú: accesible por URL directa.
  // sandbox-diagram redirige a /simulate (eliminado en favor del funnel workspace).
  const links = [
    { href: '/dashboard/admin/fauchard', label: 'Configuración', icon: Settings2 },
    { href: '/dashboard/admin/fauchard/monitor', label: 'Monitoreo y Equidad', icon: Activity },
    { href: '/dashboard/admin/fauchard/simulate', label: 'Simulador', icon: FlaskConical },
  ];

  return (
    <nav
      className={`flex items-center gap-0.5 p-0.5 bg-surface/60 border border-divider/80 rounded-2xl self-start overflow-hidden backdrop-blur-md ${className ?? ''}`}
    >
      {links.map((link) => {
        const Icon = link.icon;
        const isActive = pathname === link.href;
        return (
          <Link key={link.href} href={link.href}>
            <div className={`
              flex items-center gap-2 px-3 py-1.5 rounded-full transition-all duration-300 relative
              ${isActive ? 'text-foreground' : 'text-faint hover:text-muted'}
            `}>
              {isActive && (
                <motion.div
                  layoutId="activeSubNav"
                  className="absolute inset-0 bg-surface-2 border border-divider rounded-full"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
              <Icon className={`w-3.5 h-3.5 shrink-0 relative z-10 ${isActive ? 'text-primary' : ''}`} />
              <span className="text-[9px] font-bold uppercase tracking-wider relative z-10 whitespace-nowrap">
                {link.label}
              </span>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
