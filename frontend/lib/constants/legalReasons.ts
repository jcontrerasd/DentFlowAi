export const DELETION_REINSTATEMENT_REASONS = [
  { code: 'user_withdrew_written', label: 'El usuario retiró su solicitud por escrito (adjuntar respaldo)' },
  { code: 'user_withdrew_verbal',  label: 'El usuario retiró su solicitud verbalmente (adjuntar respaldo)' },
  { code: 'administrative_error',  label: 'Error administrativo — solicitud creada por error' },
  { code: 'legal_hold',            label: 'Retención por obligación legal — no se puede eliminar aún' },
  { code: 'other',                 label: 'Otro motivo (especificar en nota)' },
] as const;

export type DeletionReinstateReasonCode = typeof DELETION_REINSTATEMENT_REASONS[number]['code'];
