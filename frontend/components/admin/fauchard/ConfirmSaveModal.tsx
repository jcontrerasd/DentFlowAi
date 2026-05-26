'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, Save } from 'lucide-react';
import Button from '@/components/ui/Button';
import FocusTrap from '@/components/ui/FocusTrap';

interface ConfirmSaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  isLoading?: boolean;
}

export default function ConfirmSaveModal({
  isOpen,
  onClose,
  onConfirm,
  title = '¿Confirmar cambios?',
  description = 'Estás a punto de modificar parámetros críticos del algoritmo de selección. Estos cambios afectarán la asignación de casos en tiempo real.',
  isLoading = false
}: ConfirmSaveModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-surface border border-divider rounded-[2.5rem] shadow-2xl overflow-hidden"
          >
            <FocusTrap onEscape={onClose}>
              <div className="p-8">
                <div className="flex items-start justify-between mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-warning-hl border border-warning/20 flex items-center justify-center text-warning">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 text-faint hover:text-foreground transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3 mb-8">
                  <h3 className="text-xl font-black text-foreground uppercase tracking-tighter">
                    {title}
                  </h3>
                  <p className="text-sm text-muted leading-relaxed font-medium">
                    {description}
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <Button
                    onClick={onConfirm}
                    loading={isLoading}
                    variant="primary"
                    className="w-full bg-primary hover:opacity-90 text-inverse font-bold uppercase tracking-wider text-[10px] h-12 rounded-2xl"
                    icon={<Save className="w-4 h-4" />}
                  >
                    Confirmar y Aplicar
                  </Button>
                  <Button
                    onClick={onClose}
                    disabled={isLoading}
                    variant="secondary"
                    className="w-full bg-surface-2 hover:bg-surface-off text-foreground font-bold uppercase tracking-wider text-[10px] h-12 rounded-2xl border-none"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>

              {/* Bottom Decoration */}
              <div className="h-1.5 w-full bg-gradient-to-r from-teal-500 via-emerald-500 to-teal-500" />
            </FocusTrap>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
