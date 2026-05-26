'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, AlertCircle } from 'lucide-react';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

interface ToastContextValue {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const push = useCallback((message: string, type: 'success' | 'error') => {
    const id = ++nextId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  const showSuccess = useCallback((message: string) => push(message, 'success'), [push]);
  const showError = useCallback((message: string) => push(message, 'error'), [push]);

  return (
    <ToastContext.Provider value={{ showSuccess, showError }}>
      {children}
      {mounted &&
        createPortal(
          <div className="fixed top-0 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pt-4 pointer-events-none">
            <AnimatePresence mode="popLayout">
              {toasts.map(t => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: -15, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -15, scale: 0.95, transition: { duration: 0.2 } }}
                  className={`px-5 py-2 rounded-full font-medium text-[13px] shadow-lg border flex items-center gap-2.5 pointer-events-auto backdrop-blur-md ${
                    t.type === 'success'
                      ? 'bg-teal-500/20 border-teal-500/30 text-teal-300'
                      : 'bg-rose-500/20 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {t.type === 'success' ? (
                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span>{t.message}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
