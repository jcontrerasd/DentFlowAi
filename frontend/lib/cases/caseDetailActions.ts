import {
  CASE_STATUSES,
  isDraftCaseStatus,
  isTerminalCaseStatus,
  TECH_ARCHIVE_INVITATION_STATUSES,
} from '@/lib/constants/dental';

export type CaseDetailActionKey =
  | 'save'
  | 'publish'
  | 'edit'
  | 'delete'
  | 'archive'
  | 'unarchive'
  | 'createCopy';

export type CaseDetailActionState = {
  visible: boolean;
  enabled: boolean;
  disabledReason?: string;
};

export type CaseDetailActionsMap = Record<CaseDetailActionKey, CaseDetailActionState>;

export type GetCaseDetailActionStateInput = {
  status: string | null | undefined;
  publishedAt?: Date | string | null | undefined;
  role: 'dentista' | 'tecnico' | 'admin' | string;
  isArchivedByUser?: boolean;
  canDelete?: boolean;
  isFormDirty?: boolean;
  /** Modo edición activo (borrador) */
  isEditing?: boolean;
  /** Invitación canónica del técnico en este caso */
  invitationStatus?: string | null;
  assignedTechnicianId?: string | null;
  viewerId?: string | null;
};

function action(
  enabled: boolean,
  disabledReason?: string,
): CaseDetailActionState {
  return { visible: true, enabled, disabledReason: enabled ? undefined : disabledReason };
}

function hidden(): CaseDetailActionState {
  return { visible: false, enabled: false };
}

function dentistActions(input: GetCaseDetailActionStateInput): CaseDetailActionsMap {
  const draft = isDraftCaseStatus(input.status);
  const terminal = isTerminalCaseStatus(input.status);
  const published = input.publishedAt != null && input.publishedAt !== '';

  return {
    save: action(
      draft && !!input.isEditing && !!input.isFormDirty,
      !draft
        ? 'Solo disponible en borrador'
        : !input.isEditing
          ? 'Activa modo edición para guardar'
          : 'No hay cambios por guardar',
    ),
    publish: action(
      draft && !published,
      published
        ? 'Este caso ya fue publicado'
        : draft
          ? undefined
          : 'Solo disponible en borrador',
    ),
    edit: action(draft, 'Solo disponible en borrador'),
    delete: action(
      draft && (input.canDelete ?? true),
      draft ? 'Este caso no puede eliminarse' : 'Solo disponible en borrador',
    ),
    archive: action(
      terminal && !input.isArchivedByUser,
      terminal ? 'Ya archivaste este caso' : 'Solo en casos finalizados',
    ),
    unarchive: action(
      terminal && !!input.isArchivedByUser,
      input.isArchivedByUser ? undefined : 'El caso no está en tu archivo',
    ),
    createCopy: action(terminal, 'Solo en casos finalizados (completado, rechazado o cerrado)'),
  };
}

function technicianCanArchive(input: GetCaseDetailActionStateInput): boolean {
  const inv = input.invitationStatus;
  if (inv && (TECH_ARCHIVE_INVITATION_STATUSES as readonly string[]).includes(inv)) {
    return true;
  }
  if (
    input.status === CASE_STATUSES.COMPLETADO &&
    input.assignedTechnicianId &&
    input.viewerId &&
    input.assignedTechnicianId === input.viewerId
  ) {
    return true;
  }
  return false;
}

/** Superusuario: supervisión y archivo; edición del flujo vía simulación/impersonación. */
function adminActions(input: GetCaseDetailActionStateInput): CaseDetailActionsMap {
  const terminal = isTerminalCaseStatus(input.status);

  return {
    save: hidden(),
    publish: hidden(),
    edit: hidden(),
    delete: hidden(),
    archive: action(
      terminal && !input.isArchivedByUser,
      terminal ? 'Ya archivaste este caso' : 'Solo en casos finalizados',
    ),
    unarchive: action(
      terminal && !!input.isArchivedByUser,
      input.isArchivedByUser ? undefined : 'El caso no está en tu archivo',
    ),
    createCopy: action(terminal, 'Solo en casos finalizados (completado, rechazado o cerrado)'),
  };
}

function technicianActions(input: GetCaseDetailActionStateInput): CaseDetailActionsMap {
  const canArchive = technicianCanArchive(input);

  return {
    save: hidden(),
    publish: hidden(),
    edit: hidden(),
    delete: hidden(),
    archive: action(
      canArchive && !input.isArchivedByUser,
      canArchive ? 'Ya archivaste este caso' : 'Disponible cuando tu participación haya terminado',
    ),
    unarchive: action(
      canArchive && !!input.isArchivedByUser,
      input.isArchivedByUser ? undefined : 'El caso no está en tu archivo',
    ),
    createCopy: hidden(),
  };
}

/** Matriz de botones de gestión en ficha de caso (siempre visible; enabled según reglas). */
export function getCaseDetailActionState(
  input: GetCaseDetailActionStateInput,
): CaseDetailActionsMap {
  if (input.role === 'admin') {
    return adminActions(input);
  }
  if (input.role === 'tecnico') {
    return technicianActions(input);
  }
  if (input.role === 'dentista') {
    return dentistActions(input);
  }
  return dentistActions(input);
}
