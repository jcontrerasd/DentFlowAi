/**
 * Helper server-side (no es Server Action) para resolver codes de catálogo → ids
 * antes de persistir un clinical_case. Convierte el payload del wizard/edición:
 *   { material: 'zirconio_multicapa_premium', restorationType: 'corona_unitaria',
 *     shade: 'a1', urgency: 'baja' }
 * en:
 *   { materialId: <uuid>, restorationTypeId: <uuid>, shadeId: <uuid>, urgencyId: <uuid> }
 *
 * Los campos legacy (material/restorationType/shade/urgency) se eliminan del payload.
 */
import { db } from '@/lib/db';
import { dentalMaterial, restorationType, vitaShade, urgencyLevel } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function codeToId(
  table: typeof dentalMaterial | typeof restorationType | typeof vitaShade | typeof urgencyLevel,
  code: string | null | undefined,
): Promise<string | null> {
  if (!code) return null;
  const [row] = await db.select({ id: table.id }).from(table).where(eq(table.code, code)).limit(1);
  return row?.id ?? null;
}

async function labelToId(
  table: typeof urgencyLevel,
  label: string | null | undefined,
): Promise<string | null> {
  if (!label) return null;
  const [row] = await db.select({ id: table.id }).from(table).where(eq(table.label, label)).limit(1);
  return row?.id ?? null;
}

/**
 * Convierte payload del wizard/edición (con codes/labels) a ids para persistir.
 *
 * - material / restorationType / shade: el form envía el `code` opaco (`mat_001`,
 *   `vita_001`, `rest_001`). Se resuelve por `code`.
 * - urgency: el form envía el `label` (`'Baja' | 'Normal' | 'Alta'`) porque la
 *   lógica de negocio referencia esos valores. Se resuelve por `label`.
 */
export async function resolveCatalogCodesToIds(input: Record<string, any>): Promise<Record<string, any>> {
  const out = { ...input };

  if ('material' in out) {
    out.materialId = await codeToId(dentalMaterial, out.material);
    delete out.material;
  }
  if ('restorationType' in out) {
    out.restorationTypeId = await codeToId(restorationType, out.restorationType);
    delete out.restorationType;
  }
  if ('shade' in out) {
    out.shadeId = await codeToId(vitaShade, out.shade);
    delete out.shade;
  }
  if ('urgency' in out) {
    const id = await labelToId(urgencyLevel, out.urgency);
    if (!id) throw new Error(`Urgencia inválida: ${out.urgency}`);
    out.urgencyId = id;
    delete out.urgency;
  }

  return out;
}
