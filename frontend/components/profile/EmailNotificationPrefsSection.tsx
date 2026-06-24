'use client';

import { useState, useTransition, useEffect } from 'react';
import { useToast } from '@/context/ToastContext';
import { getEmailNotificationPrefsAction, updateEmailNotificationPrefsAction } from '@/lib/db/actions/userPreferences';
import type { EmailNotifCategory, EmailNotificationPrefs } from '@/lib/services/notifications';

// ─── Configuración de categorías por rol ─────────────────────────────────────

type CategoryDef = {
  key: EmailNotifCategory;
  label: string;
  description: string;
  tooltip: string;
};

const CATEGORIES_BY_ROLE: Record<string, CategoryDef[]> = {
  dentista: [
    {
      key: 'actividad_caso',
      label: 'Actividad del caso',
      description: 'Entregas, plazos y avances del técnico',
      tooltip:
        'Recibes este email cuando:\n· Un técnico acepta el trabajo\n· El técnico confirma que inició el diseño\n· Hay un diseño listo para que lo revises\n· El plazo para revisar está por vencer o ya venció',
    },
    {
      key: 'resolucion',
      label: 'Resolución',
      description: 'Confirmación al aprobar un trabajo',
      tooltip:
        'Recibes este email cuando:\n· Apruebas un diseño y el técnico queda notificado del cierre',
    },
    {
      key: 'gestion_busqueda',
      label: 'Búsqueda de técnico',
      description: 'Aviso cuando tu caso lleva tiempo sin asignar',
      tooltip:
        'Recibes este email cuando:\n· Tu caso lleva tiempo esperando que un técnico esté disponible y queremos saber si sigues necesitándolo',
    },
  ],
  tecnico: [
    {
      key: 'nuevas_asignaciones',
      label: 'Nuevas asignaciones',
      description: 'Cuando Fauchard te asigna un caso',
      tooltip:
        'Recibes este email cuando:\n· Fauchard te asigna un caso nuevo para que lo aceptes o rechaces dentro del plazo',
    },
    {
      key: 'progreso_caso',
      label: 'Progreso del caso',
      description: 'Cambios solicitados, aprobación y certificación de Calidad',
      tooltip:
        'Recibes este email cuando:\n· El solicitante pide cambios en tu diseño\n· Aprobaron tu trabajo\n· Calidad certificó tu entrega\n· Calidad pidió ajustes a tu entrega antes de certificarla',
    },
    {
      key: 'disponibilidad',
      label: 'Disponibilidad',
      description: 'Sanciones, pausas automáticas y recordatorios',
      tooltip:
        'Recibes este email cuando:\n· Tus no-respuestas empiezan a afectar tu prioridad\n· Tu disponibilidad quedó pausada automáticamente\n· Llevas tiempo activo sin actividad y te mandamos un recordatorio\n· Un administrador corrigió tu historial de respuestas',
    },
  ],
  calidad: [
    {
      key: 'entregas_pendientes',
      label: 'Entregas pendientes',
      description: 'Diseños por certificar o casos derivados',
      tooltip:
        'Recibes este email cuando:\n· Un técnico entregó un diseño que necesitas certificar\n· Otro revisor de Calidad te derivó un caso para que lo atiendas',
    },
    {
      key: 'plazos_revision',
      label: 'Plazos de revisión',
      description: 'Alertas de SLA por vencer o vencido',
      tooltip:
        'Recibes este email cuando:\n· El tiempo para certificar una entrega está por vencer\n· El plazo de revisión ya venció sin que hayas certificado ni pedido ajustes',
    },
    {
      key: 'calificacion_pendiente',
      label: 'Calificación pendiente',
      description: 'Casos cerrados que aún falta calificar',
      tooltip:
        'Recibes este email cuando:\n· Un caso se cerró exitosamente y todavía falta que califiques al técnico que lo realizó',
    },
  ],
  admin: [
    {
      key: 'alertas_operativas',
      label: 'Alertas operativas',
      description: 'Fallos de asignación que requieren intervención',
      tooltip:
        'Recibes este email cuando:\n· Un caso no encontró técnicos disponibles y requiere intervención manual del administrador',
    },
  ],
};

// ─── Componente toggle individual ─────────────────────────────────────────────

function CategoryToggle({
  def,
  value,
  onChange,
  disabled,
}: {
  def: CategoryDef;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  const tooltipLines = def.tooltip.split('\n');

  return (
    <div className="flex items-start gap-3 py-3">
      {/* Toggle */}
      <button
        type="button"
        role="switch"
        aria-checked={value}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={[
          'relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
          value ? 'bg-primary' : 'bg-surface-off border border-divider',
          disabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200',
            value ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </button>

      {/* Texto */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">{def.label}</span>

          {/* Botón "?" con tooltip */}
          <span className="relative group/tt inline-flex items-center">
            <button
              type="button"
              tabIndex={-1}
              className="flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-semibold border border-divider text-faint hover:text-primary hover:border-primary transition-colors"
              aria-label={`Más información sobre ${def.label}`}
            >
              ?
            </button>
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tt:block w-72 p-3 bg-surface-2 text-foreground text-[11px] rounded-md shadow-md border border-divider z-[100] pointer-events-none">
              {tooltipLines.map((line, i) =>
                line.startsWith('·') ? (
                  <span key={i} className="block pl-2 text-faint">{line}</span>
                ) : (
                  <span key={i} className="block font-medium mb-1">{line}</span>
                )
              )}
            </span>
          </span>
        </div>
        <p className="text-xs text-faint mt-0.5">{def.description}</p>
      </div>

      {/* Estado */}
      <span className={`text-xs shrink-0 mt-0.5 ${value ? 'text-primary' : 'text-faint'}`}>
        {value ? 'Activo' : 'Silenciado'}
      </span>
    </div>
  );
}

// ─── Sección principal ────────────────────────────────────────────────────────

export function EmailNotificationPrefsSection({ role }: { role: string }) {
  const categories = CATEGORIES_BY_ROLE[role] ?? [];
  const { showError } = useToast();
  const [isPending, startTransition] = useTransition();
  const [prefs, setPrefs] = useState<EmailNotificationPrefs>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getEmailNotificationPrefsAction().then((res) => {
      if (res.success) setPrefs(res.data ?? {});
      setLoaded(true);
    });
  }, []);

  if (categories.length === 0) return null;
  if (!loaded) return null;

  function handleChange(key: EmailNotifCategory, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    startTransition(async () => {
      const res = await updateEmailNotificationPrefsAction(next);
      if (!res.success) {
        setPrefs(prefs);
        showError('No se pudo guardar la preferencia. Intenta de nuevo.');
      }
    });
  }

  return (
    <div className="rounded-xl border border-divider bg-surface p-5 space-y-1">
      <h3 className="text-sm font-semibold text-foreground mb-1">Notificaciones por email</h3>
      <p className="text-xs text-faint mb-3">
        Elige qué tipos de email quieres recibir. Siempre puedes reactivarlos cuando quieras.
      </p>
      <div className="divide-y divide-divider">
        {categories.map((def) => (
          <CategoryToggle
            key={def.key}
            def={def}
            value={prefs[def.key] !== false}
            onChange={(v) => handleChange(def.key, v)}
            disabled={isPending}
          />
        ))}
      </div>
    </div>
  );
}
