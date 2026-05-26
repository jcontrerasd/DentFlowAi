'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Archive,
  ArchiveRestore,
  Copy,
  Edit,
  Globe,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import type { CaseDetailActionsMap } from '@/lib/cases/caseDetailActions';

type Props = {
  actions: CaseDetailActionsMap;
  isEditing: boolean;
  publishModalOpen: boolean;
  isDeleting: boolean;
  isCloning: boolean;
  savingChanges: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onPublishClick: () => void;
  onDeleteClick: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onCreateCopy: () => void;
};

function iconBtnClass(
  enabled: boolean,
  accent?: 'teal' | 'red' | 'slate',
  active?: boolean,
) {
  const base =
    'inline-flex items-center justify-center w-11 h-11 rounded-2xl transition-all border disabled:cursor-default';
  if (!enabled) {
    return `${base} opacity-55 border-slate-600/50 text-slate-500 bg-slate-900/30`;
  }
  if (active && accent === 'teal') {
    return `${base} bg-teal-600 border-teal-500 text-white shadow-lg shadow-teal-900/30`;
  }
  if (active && accent === 'red') {
    return `${base} bg-red-600 border-red-500 text-white shadow-lg shadow-red-900/30`;
  }
  if (accent === 'red') {
    return `${base} bg-red-900/20 border-red-500/30 text-red-400 hover:bg-red-600 hover:text-white`;
  }
  if (accent === 'teal') {
    return `${base} bg-teal-600/20 border-teal-500/50 text-teal-400 hover:bg-teal-600 hover:text-white`;
  }
  return `${base} bg-slate-800/60 border-slate-600/50 text-slate-300 hover:border-slate-400 hover:text-white`;
}

function ManagementIconButton({
  icon: Icon,
  tooltip,
  enabled,
  loading,
  onClick,
  accent,
  active,
}: {
  icon: LucideIcon;
  tooltip: string;
  enabled: boolean;
  loading?: boolean;
  onClick: () => void;
  accent?: 'teal' | 'red' | 'slate';
  active?: boolean;
}) {
  const disabled = !enabled || loading;
  return (
    <span
      className={`inline-flex shrink-0${disabled ? ' cursor-default' : ''}`}
      title={tooltip}
    >
      <button
        type="button"
        aria-label={tooltip}
        disabled={disabled}
        onClick={onClick}
        className={`${iconBtnClass(enabled, accent, active)}${disabled ? ' pointer-events-none' : ''}`}
      >
        {loading ? (
          <span className="inline-block w-4 h-4 border-2 border-current/20 border-t-current rounded-full animate-spin" />
        ) : (
          <Icon className="w-5 h-5" strokeWidth={2} />
        )}
      </button>
    </span>
  );
}

function BarSeparator() {
  return <span className="w-px h-8 bg-white/10 mx-0.5 hidden sm:block shrink-0" aria-hidden />;
}

export default function CaseDetailManagementBar({
  actions,
  isEditing,
  publishModalOpen,
  isDeleting,
  isCloning,
  savingChanges,
  onEdit,
  onCancelEdit,
  onSave,
  onPublishClick,
  onDeleteClick,
  onArchive,
  onUnarchive,
  onCreateCopy,
}: Props) {
  const showDraftGroup =
    actions.edit.visible ||
    actions.save.visible ||
    actions.publish.visible ||
    actions.delete.visible;
  const showArchiveGroup =
    actions.archive.visible || actions.unarchive.visible || actions.createCopy.visible;

  return (
    <div
      className="flex items-center gap-1.5 flex-wrap justify-end"
      role="toolbar"
      aria-label="Acciones del Caso"
    >
      {showDraftGroup && (
        <>
          {actions.edit.visible &&
            (isEditing ? (
              <ManagementIconButton
                icon={X}
                tooltip="Cerrar Edición y Descartar Cambios"
                enabled={actions.edit.enabled}
                onClick={onCancelEdit}
              />
            ) : (
              <ManagementIconButton
                icon={Edit}
                tooltip="Modificar Datos del Borrador"
                enabled={actions.edit.enabled}
                onClick={onEdit}
              />
            ))}

          {actions.save.visible && (
            <ManagementIconButton
              icon={Save}
              tooltip="Guardar Cambios"
              enabled={actions.save.enabled}
              loading={savingChanges}
              onClick={onSave}
              accent="teal"
            />
          )}

          {actions.publish.visible && (
            <ManagementIconButton
              icon={Globe}
              tooltip="Publicar Caso"
              enabled={actions.publish.enabled}
              onClick={onPublishClick}
              accent="teal"
              active={publishModalOpen}
            />
          )}

          {actions.delete.visible && (
            <ManagementIconButton
              icon={Trash2}
              tooltip="Eliminar Borrador"
              enabled={actions.delete.enabled}
              onClick={onDeleteClick}
              accent="red"
              active={isDeleting}
            />
          )}
        </>
      )}

      {showDraftGroup && showArchiveGroup && <BarSeparator />}

      {showArchiveGroup && (
        <>
          {actions.archive.visible && (
            <ManagementIconButton
              icon={Archive}
              tooltip="Archivar Caso"
              enabled={actions.archive.enabled}
              onClick={onArchive}
            />
          )}

          {actions.unarchive.visible && (
            <ManagementIconButton
              icon={ArchiveRestore}
              tooltip="Sacar del Archivo"
              enabled={actions.unarchive.enabled}
              onClick={onUnarchive}
            />
          )}

          {actions.createCopy.visible && (
            <ManagementIconButton
              icon={Copy}
              tooltip="Copiar caso"
              enabled={actions.createCopy.enabled}
              loading={isCloning}
              onClick={onCreateCopy}
              accent="teal"
            />
          )}
        </>
      )}
    </div>
  );
}
