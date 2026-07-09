export const KEY_LABELS: Record<string, string> = {
  alphaQuality: 'Calidad Histórica (Q)',
  alphaPunctuality: 'Puntualidad (P)',
  alphaExperience: 'Experiencia Especializada (E)',
  alphaBonus: 'Bono de Infrautilización (B)',
  alphaLoad: 'Carga activa (L)',
  alphaNoResponse: 'Penalización por No-respuesta (N)',
  wQualityDays: 'Ventana histórica (días)',
  loadReferenceMin: 'Carga de Trabajo (Min)',
  // Legacy (retirados del panel; se conservan para renderizar auditoría histórica):
  wLoadDays: 'Carga Reciente (días)',
  cMax: 'Techo Índice de Carga (C_max)',
  dBonusMaxDays: 'Bono Infrautilización (días máx)',
  tCooldownMinutes: 'Cooldown asignación (min)',
  dInactivityDays: 'Inactividad Máxima (días)',
  maxAssignmentAttempts: 'Intentos máximos de asignación',
  tQuoteMinutes: 'Tiempo para responder asignación (min)',
  qualityReservedCaseWeight: 'Peso de Casos Reservados (Calidad)',
  tDentistReviewHours: 'Revisión del dentista (h)',
  tNoEligiblePoolHours: 'Espera pool sin elegibles (h)',
  maxPoolCycles: 'Ciclos de espera pool',
  replacementCutoffMinutes: 'Margen de reemplazo (min)',
  noResponseWindowDays: 'Ventana no-respuesta (días)',
  noResponseRehabilitationDays: 'Rehabilitación no-respuesta (días)',
  level1Threshold: 'Umbral Nivel 1',
  level2Threshold: 'Umbral Nivel 2',
  level3Threshold: 'Umbral Nivel 3',
  inactivityAutoOffDays: 'Auto-OFF preventivo (días)',
  inactivityReminderDays: 'Recordatorio de actividad (días)',
  lMinRating: 'Calificación Mínima',
  lCasesEvaluated: 'Ventana de Evaluación (Casos)',
  lMinPunctuality: 'Puntualidad Mínima (%)',
  lCasesCompleted: 'Casos Completados Totales',
  lCasesTransition: 'Casos en Transición',
  lPenaltyTransition: 'Penalización Transición (%)',
  lDescentRating: 'Calificación para Descenso',
  lDescentDays: 'Días en Baja Calificación',
};

export function formatFauchardValue(key: string, value: unknown): string {
  const num = parseFloat(String(value));
  if (isNaN(num)) return String(value ?? '');

  if (['lMinPunctuality', 'lPenaltyTransition'].includes(key)) {
    return `${(num * 100).toFixed(0)}%`;
  }

  if (key.startsWith('alpha') || ['cMax', 'lMinRating', 'lDescentRating'].includes(key)) {
    return num.toFixed(3).replace(/\.?0+$/, '');
  }

  return num.toString();
}
