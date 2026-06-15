import type { PriceDimensionIds } from '@/lib/pricing/resolveListPrice';

export type PriceRuleDimensionInput = {
  restorationTypeId?: string | null;
  urgencyId?: string | null;
  materialId?: string | null;
  shadeId?: string | null;
};

export type PriceRuleDimensionField = keyof PriceRuleDimensionInput;

export const DIMENSION_ORDER: PriceRuleDimensionField[] = [
  'restorationTypeId',
  'urgencyId',
  'materialId',
  'shadeId',
];

export type DimensionValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export type PriceRuleHierarchyHint = {
  id: string;
  code: string;
};

export type PriceRuleHierarchyHints = {
  lessSpecific: PriceRuleHierarchyHint[];
  moreSpecific: PriceRuleHierarchyHint[];
};

function isSet(value: string | null | undefined): boolean {
  return value != null && value !== '';
}

export function toDimensionVector(dims: PriceRuleDimensionInput): [boolean, boolean, boolean, boolean] {
  return [
    isSet(dims.restorationTypeId),
    isSet(dims.urgencyId),
    isSet(dims.materialId),
    isSet(dims.shadeId),
  ];
}

export function ruleSpecificityCount(dims: PriceRuleDimensionInput): number {
  return toDimensionVector(dims).filter(Boolean).length;
}

/**
 * Patrones válidos: prefijo fijo Restauración → Urgencia → Material → Color, sin huecos.
 * NULL / vacío = comodín (*).
 */
export function validatePriceRuleDimensions(dims: PriceRuleDimensionInput): DimensionValidationResult {
  if (!isSet(dims.restorationTypeId)) {
    return { ok: false, error: 'La restauración es obligatoria' };
  }

  const vector = toDimensionVector(dims);
  let seenWildcard = false;
  for (const fixed of vector) {
    if (seenWildcard && fixed) {
      return {
        ok: false,
        error:
          'Las dimensiones deben definirse en orden: Restauración → Urgencia → Material → Color, sin saltar niveles',
      };
    }
    if (!fixed) seenWildcard = true;
  }

  return { ok: true };
}

export function isLegacyInvalidRule(dims: PriceRuleDimensionInput): boolean {
  return !validatePriceRuleDimensions(dims).ok;
}

const WILDCARD = '';

export function normalizeDimensionsOnChange(
  field: PriceRuleDimensionField,
  value: string,
  current: Record<PriceRuleDimensionField, string>,
): Record<PriceRuleDimensionField, string> {
  const next = { ...current, [field]: value };
  const fieldIndex = DIMENSION_ORDER.indexOf(field);

  if (value === WILDCARD) {
    for (let i = fieldIndex + 1; i < DIMENSION_ORDER.length; i++) {
      next[DIMENSION_ORDER[i]] = WILDCARD;
    }
  }

  if (field === 'restorationTypeId' && value === WILDCARD) {
    for (const key of DIMENSION_ORDER.slice(1)) {
      next[key] = WILDCARD;
    }
  }

  return next;
}

/** True si `ancestor` es prefijo compatible de `descendant` (mismas dims fijadas en ancestor). */
function sharesAncestorPrefix(
  ancestor: PriceRuleDimensionInput,
  descendant: PriceRuleDimensionInput,
): boolean {
  for (const key of DIMENSION_ORDER) {
    const a = ancestor[key];
    const d = descendant[key];
    if (isSet(a) && a !== d) return false;
  }
  return true;
}

function toHintRule(rule: {
  id: string;
  code?: string | null;
}): PriceRuleHierarchyHint {
  return { id: rule.id, code: rule.code ?? '—' };
}

/**
 * Reglas activas relacionadas por prefijo de dimensiones fijadas.
 */
export function getPriceRuleHierarchyHints(
  candidate: PriceRuleDimensionInput,
  activeRules: Array<{
    id: string;
    code?: string | null;
    restorationTypeId: string | null;
    urgencyId: string | null;
    materialId: string | null;
    shadeId: string | null;
    isActive: boolean;
  }>,
  excludeId?: string,
): PriceRuleHierarchyHints {
  if (!validatePriceRuleDimensions(candidate).ok) {
    return { lessSpecific: [], moreSpecific: [] };
  }

  const candidateSpec = ruleSpecificityCount(candidate);
  const lessSpecific: PriceRuleHierarchyHint[] = [];
  const moreSpecific: PriceRuleHierarchyHint[] = [];

  for (const rule of activeRules) {
    if (!rule.isActive) continue;
    if (excludeId && rule.id === excludeId) continue;
    if (isLegacyInvalidRule(rule)) continue;

    const other: PriceRuleDimensionInput = {
      restorationTypeId: rule.restorationTypeId,
      urgencyId: rule.urgencyId,
      materialId: rule.materialId,
      shadeId: rule.shadeId,
    };

    const otherSpec = ruleSpecificityCount(other);
    if (sharesAncestorPrefix(other, candidate) && otherSpec < candidateSpec) {
      lessSpecific.push(toHintRule(rule));
    } else if (sharesAncestorPrefix(candidate, other) && otherSpec > candidateSpec) {
      moreSpecific.push(toHintRule(rule));
    }
  }

  return { lessSpecific, moreSpecific };
}

/** Habilitación de selects en cascada (formulario admin). */
export function cascadeFieldState(form: Record<PriceRuleDimensionField, string>): {
  urgency: { disabled: boolean };
  material: { disabled: boolean };
  shade: { disabled: boolean };
} {
  const hasRestoration = isSet(form.restorationTypeId);
  const hasUrgency = isSet(form.urgencyId);
  const hasMaterial = isSet(form.materialId);

  return {
    urgency: { disabled: !hasRestoration },
    material: { disabled: !hasRestoration || !hasUrgency },
    shade: { disabled: !hasRestoration || !hasMaterial },
  };
}

export function formToDimensionInput(
  form: Record<PriceRuleDimensionField, string>,
): PriceRuleDimensionInput {
  return {
    restorationTypeId: form.restorationTypeId || null,
    urgencyId: form.urgencyId || null,
    materialId: form.materialId || null,
    shadeId: form.shadeId || null,
  };
}

export function dimensionInputToPriceDimensionIds(
  dims: PriceRuleDimensionInput,
): PriceDimensionIds | null {
  if (
    !isSet(dims.restorationTypeId) ||
    !isSet(dims.materialId) ||
    !isSet(dims.shadeId) ||
    !isSet(dims.urgencyId)
  ) {
    return null;
  }
  return {
    restorationTypeId: dims.restorationTypeId!,
    materialId: dims.materialId!,
    shadeId: dims.shadeId!,
    urgencyId: dims.urgencyId!,
  };
}
