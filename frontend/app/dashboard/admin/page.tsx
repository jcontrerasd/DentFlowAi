'use client';

import { motion } from 'framer-motion';
import {
  ShieldAlert,
  Settings2,
  ChevronRight,
  ListChecks,
  Shield,
  Users,
  LayoutGrid,
  DollarSign,
  ToggleLeft,
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

type SectionCard = {
  href: string;
  title: string;
  desc: string;
  icon: typeof Settings2;
  accent: string; // hover bg
  border: string; // hover border
  chip: string;   // icon chip bg
  chipText: string;
  chevron: string; // chevron hover color (literal, no interpolation)
  glow: string;
};

const SECTIONS: { group: string; cards: SectionCard[] }[] = [
  {
    group: 'Usuarios y accesos',
    cards: [
      {
        href: '/dashboard/admin/users',
        title: 'Control de Usuarios',
        desc: 'Gestiona accesos, roles, contraseñas, co-admins y reseteo de no-respuestas de técnicos.',
        icon: Users,
        accent: 'hover:bg-primary/5',
        border: 'hover:border-primary/30',
        chip: 'bg-primary-hl',
        chipText: 'text-primary',
        chevron: 'group-hover:text-primary',
        glow: 'bg-primary/5 group-hover:bg-primary-hl',
      },
    ],
  },
  {
    group: 'Motor Fauchard',
    cards: [
      {
        href: '/dashboard/admin/fauchard',
        title: 'Motor Fauchard',
        desc: 'Configuración (pesos, asignación, plazos), monitoreo y equidad, y simulador. Todo dentro del mismo hub.',
        icon: Settings2,
        accent: 'hover:bg-primary/5',
        border: 'hover:border-primary/30',
        chip: 'bg-primary-hl',
        chipText: 'text-primary',
        chevron: 'group-hover:text-primary',
        glow: 'bg-primary/5 group-hover:bg-primary-hl',
      },
    ],
  },
  {
    group: 'Catálogos y contenido',
    cards: [
      {
        href: '/dashboard/admin/catalogos',
        title: 'Catálogos UI',
        desc: 'Listas del wizard de casos: colores VITA, restauraciones, materiales, urgencias y motivos de rechazo.',
        icon: ListChecks,
        accent: 'hover:bg-warning-hl',
        border: 'hover:border-warning/20',
        chip: 'bg-warning-hl',
        chipText: 'text-warning',
        chevron: 'group-hover:text-warning',
        glow: 'bg-warning-hl group-hover:bg-warning-hl',
      },
      {
        href: '/dashboard/admin/prices',
        title: 'Precios de lista',
        desc: 'Crear, editar y bloquear tarifas por combinación de dimensiones. Cola de combinaciones pendientes.',
        icon: DollarSign,
        accent: 'hover:bg-success-hl',
        border: 'hover:border-success/30',
        chip: 'bg-success-hl',
        chipText: 'text-success',
        chevron: 'group-hover:text-success',
        glow: 'bg-success-hl group-hover:bg-success-hl',
      },
      {
        href: '/dashboard/admin/contactguard',
        title: 'ContactGuard',
        desc: 'Reglas anti-desintermediación, couriers permitidos y auditoría de intentos de comunicación indebida.',
        icon: Shield,
        accent: 'hover:bg-error-hl',
        border: 'hover:border-error/30',
        chip: 'bg-error-hl',
        chipText: 'text-error',
        chevron: 'group-hover:text-error',
        glow: 'bg-error-hl group-hover:bg-error-hl',
      },
    ],
  },
  {
    group: 'Sistema',
    cards: [
      {
        href: '/dashboard/admin/feature-flags',
        title: 'Feature Flags',
        desc: 'Activa o desactiva funciones del sistema en segundos, con historial de quién cambió qué y cuándo.',
        icon: ToggleLeft,
        accent: 'hover:bg-primary/5',
        border: 'hover:border-primary/30',
        chip: 'bg-primary-hl',
        chipText: 'text-primary',
        chevron: 'group-hover:text-primary',
        glow: 'bg-primary/5 group-hover:bg-primary-hl',
      },
    ],
  },
];

export default function AdminPage() {
  const { userProfile, user } = useAuth();

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

  return (
    <div className="space-y-12 pb-20 font-sans">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl serif-font text-foreground flex items-center gap-3">
          <LayoutGrid className="text-primary w-8 h-8" /> Panel de administración.
        </h1>
        <p className="text-faint text-sm">Accesos directos a las áreas de gestión del sistema.</p>
      </div>

      {/* Secciones agrupadas */}
      <div className="space-y-10">
        {SECTIONS.map((section) => (
          <section key={section.group} className="space-y-4">
            <h2 className="text-[10px] uppercase tracking-widest text-faint font-black ml-1">{section.group}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {section.cards.map((card) => {
                const Icon = card.icon;
                return (
                  <Link key={card.href} href={card.href}>
                    <motion.div
                      whileHover={{ y: -5 }}
                      className={`bg-surface/40 border border-divider rounded-[2.5rem] p-8 ${card.accent} ${card.border} transition-all group h-full relative overflow-hidden`}
                    >
                      <div className={`absolute -right-4 -bottom-4 w-32 h-32 rounded-full blur-3xl transition-all ${card.glow}`} />
                      <div className={`w-12 h-12 ${card.chip} rounded-2xl flex items-center justify-center ${card.chipText} mb-6 group-hover:scale-110 transition-transform`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xl font-black text-foreground uppercase tracking-tighter">{card.title}</h3>
                        <ChevronRight className={`w-5 h-5 text-faint ${card.chevron} transform group-hover:translate-x-1 transition-all`} />
                      </div>
                      <p className="text-faint text-xs leading-relaxed font-medium">{card.desc}</p>
                    </motion.div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
