'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';

export const CREATE_CASE_PATH = '/dashboard/cases/new';

const buttonClass =
  'px-8 py-4 bg-teal-600 hover:bg-teal-500 text-white rounded-2xl inline-flex items-center gap-3 transition-colors shadow-xl shadow-teal-900/40 relative overflow-hidden group';

/** CTA primario unificado: dashboard y listado de casos. */
export default function CreateCaseLinkButton({
  label = 'Crear Nuevo Caso',
  className = '',
}: {
  label?: string;
  className?: string;
}) {
  return (
    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className={className}>
      <Link href={CREATE_CASE_PATH} className={buttonClass}>
        <span
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"
        />
        <Plus className="w-5 h-5 flex-shrink-0 relative z-10" aria-hidden />
        <span className="font-black uppercase tracking-widest text-[11px] relative z-10">{label}</span>
      </Link>
    </motion.div>
  );
}
