'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings2, Activity, FlaskConical } from 'lucide-react';
import { motion } from 'framer-motion';

export default function FauchardNav() {
  const pathname = usePathname();

  const links = [
    { href: '/dashboard/admin/fauchard', label: 'Configuración', icon: Settings2 },
    { href: '/dashboard/admin/fauchard/monitor', label: 'Monitoreo', icon: Activity },
    { href: '/dashboard/admin/fauchard/simulate', label: 'Simulador', icon: FlaskConical },
  ];

  return (
    <nav className="flex items-center gap-1 p-1 bg-surface/60 border border-divider/80 rounded-[2.5rem] self-start overflow-hidden backdrop-blur-md mb-8">
      {links.map((link) => {
        const Icon = link.icon;
        const isActive = pathname === link.href;
        return (
          <Link key={link.href} href={link.href}>
            <div className={`
              flex items-center gap-3 px-6 py-3 rounded-full transition-all duration-300 relative
              ${isActive ? 'text-foreground' : 'text-faint hover:text-muted'}
            `}>
              {isActive && (
                <motion.div
                  layoutId="activeSubNav"
                  className="absolute inset-0 bg-surface-2 border border-divider rounded-full"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
              <Icon className={`w-4 h-4 shrink-0 relative z-10 ${isActive ? 'text-primary' : ''}`} />
              <span className="text-[10px] font-bold uppercase tracking-wider relative z-10 whitespace-nowrap">
                {link.label}
              </span>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
