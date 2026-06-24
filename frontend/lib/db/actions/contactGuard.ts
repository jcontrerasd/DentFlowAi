'use server';

import { db } from '@/lib/db';
import {
  contactGuardRule,
  contactGuardCourierAllowlist,
  contactGuardAudit,
  clinicalCase,
  user as userTable,
} from '@/lib/db/schema';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { getServerIdentity } from './impersonation';
import { invalidateContactGuardCache } from '@/lib/contactGuard';

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

async function ensureAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { ok: false, error: 'No autenticado' };
  if (identity.role !== 'admin' && !identity.isSystemAdmin) return { ok: false, error: 'Solo admin' };
  return { ok: true };
}

// ─── Reglas (regex + keywords) ──────────────────────────────────────────────

export type GuardRule = {
  id: string;
  type: 'regex' | 'keyword';
  name: string;
  pattern: string;
  flags: string | null;
  description: string | null;
  severity: string;
  isActive: boolean;
  appliesToFields: string[] | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function listContactGuardRulesAction(): Promise<ActionResult<GuardRule[]>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  const rows = await db
    .select()
    .from(contactGuardRule)
    .orderBy(desc(contactGuardRule.isActive), contactGuardRule.type, contactGuardRule.name);
  return {
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      type: r.type as 'regex' | 'keyword',
      name: r.name,
      pattern: r.pattern,
      flags: r.flags,
      description: r.description,
      severity: r.severity,
      isActive: r.isActive,
      appliesToFields: (r.appliesToFields as string[] | null) ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  };
}

export type GuardRuleInput = {
  type: 'regex' | 'keyword';
  name: string;
  pattern: string;
  flags?: string;
  description?: string | null;
  severity?: string;
  isActive?: boolean;
  appliesToFields?: string[] | null;
};

function validateRule(input: GuardRuleInput): string | null {
  if (!input.name?.trim()) return 'Nombre requerido';
  if (!input.pattern?.trim()) return 'Patrón requerido';
  if (input.type === 'regex') {
    try {
      new RegExp(input.pattern, input.flags ?? 'i');
    } catch (e: any) {
      return `Regex inválido: ${e?.message ?? 'error de compilación'}`;
    }
  }
  return null;
}

export async function createContactGuardRuleAction(
  input: GuardRuleInput,
): Promise<ActionResult<GuardRule>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  const identity = await getServerIdentity();
  const err = validateRule(input);
  if (err) return { success: false, error: err };
  try {
    const [row] = await db
      .insert(contactGuardRule)
      .values({
        type: input.type,
        name: input.name.trim(),
        pattern: input.pattern,
        flags: input.flags ?? 'i',
        description: input.description ?? null,
        severity: input.severity ?? 'block',
        isActive: input.isActive ?? true,
        appliesToFields: input.appliesToFields ?? null,
        createdBy: identity?.id ?? null,
      })
      .returning();
    invalidateContactGuardCache();
    return {
      success: true,
      data: {
        id: row.id,
        type: row.type as 'regex' | 'keyword',
        name: row.name,
        pattern: row.pattern,
        flags: row.flags,
        description: row.description,
        severity: row.severity,
        isActive: row.isActive,
        appliesToFields: (row.appliesToFields as string[] | null) ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
    };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Error creando regla' };
  }
}

export async function updateContactGuardRuleAction(
  id: string,
  input: Partial<GuardRuleInput>,
): Promise<ActionResult<void>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  if (input.type || input.pattern || input.flags) {
    const merged: GuardRuleInput = {
      type: (input.type ?? 'regex') as 'regex' | 'keyword',
      name: input.name ?? 'tmp',
      pattern: input.pattern ?? '',
      flags: input.flags ?? 'i',
    };
    if (input.pattern && merged.type === 'regex') {
      const err = validateRule(merged);
      if (err) return { success: false, error: err };
    }
  }
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.pattern !== undefined) patch.pattern = input.pattern;
  if (input.flags !== undefined) patch.flags = input.flags;
  if (input.description !== undefined) patch.description = input.description;
  if (input.severity !== undefined) patch.severity = input.severity;
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  if (input.appliesToFields !== undefined) patch.appliesToFields = input.appliesToFields;
  await db.update(contactGuardRule).set(patch).where(eq(contactGuardRule.id, id));
  invalidateContactGuardCache();
  return { success: true };
}

export async function setContactGuardRuleActiveAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult<void>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  await db
    .update(contactGuardRule)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(contactGuardRule.id, id));
  invalidateContactGuardCache();
  return { success: true };
}

export async function deleteContactGuardRuleAction(id: string): Promise<ActionResult<void>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  await db.delete(contactGuardRule).where(eq(contactGuardRule.id, id));
  invalidateContactGuardCache();
  return { success: true };
}

export async function testContactGuardRuleAction(
  input: { type: 'regex' | 'keyword'; pattern: string; flags?: string; sample: string },
): Promise<ActionResult<{ matches: string[] }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  if (input.type === 'regex') {
    try {
      const re = new RegExp(input.pattern, (input.flags ?? 'i').includes('g') ? input.flags ?? 'ig' : (input.flags ?? 'i') + 'g');
      const matches = input.sample.match(re) ?? [];
      return { success: true, data: { matches } };
    } catch (e: any) {
      return { success: false, error: `Regex inválido: ${e?.message ?? 'error'}` };
    }
  }
  const kw = input.pattern.toLowerCase();
  const hits: string[] = [];
  const re = new RegExp(`(^|[^a-z0-9])(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![a-z0-9])`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(input.sample)) !== null) hits.push(m[2]);
  return { success: true, data: { matches: hits } };
}

/**
 * Pre-validación ligera para que el cliente verifique un texto ANTES de
 * iniciar uploads costosos a GCS. NO inserta en contact_guard_audit (eso lo
 * hace la server action final). Cualquier usuario autenticado puede llamarla.
 */
export async function precheckTextContactGuardAction(
  input: { field: string; text: string },
): Promise<ActionResult<{ blocked: boolean; userMessage?: string }>> {
  const identity = await getServerIdentity();
  if (!identity?.id) return { success: false, error: 'No autenticado' };

  const text = (input.text ?? '').trim();
  if (!text) return { success: true, data: { blocked: false } };

  const { checkContactExposure } = await import('@/lib/contactGuard');
  const result = await checkContactExposure(text, {
    field: input.field,
    allowCourierUrls: input.field === 'dispatchTracking',
  });
  if (result.ok) return { success: true, data: { blocked: false } };

  // Reusar el mismo formateador que la action final para que el mensaje al
  // usuario sea idéntico (mismo prefix → mismo banner ámbar en la UI).
  const { buildContactGuardUserMessage } = await import('@/lib/contactGuard/guardOrFail');
  const userMessage = buildContactGuardUserMessage(input.field, result.violations);
  return { success: true, data: { blocked: true, userMessage } };
}

// ─── Couriers ───────────────────────────────────────────────────────────────

export type CourierEntry = {
  id: string;
  domain: string;
  label: string | null;
  isActive: boolean;
};

export async function listCourierAllowlistAction(): Promise<ActionResult<CourierEntry[]>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  const rows = await db
    .select()
    .from(contactGuardCourierAllowlist)
    .orderBy(contactGuardCourierAllowlist.domain);
  return {
    success: true,
    data: rows.map((r) => ({ id: r.id, domain: r.domain, label: r.label, isActive: r.isActive })),
  };
}

export async function createCourierAllowlistAction(input: {
  domain: string;
  label?: string;
}): Promise<ActionResult<CourierEntry>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  const domain = input.domain.trim().toLowerCase();
  if (!domain || !/^[a-z0-9.\-]+\.[a-z]{2,}$/i.test(domain)) {
    return { success: false, error: 'Dominio inválido (ej. chilexpress.cl)' };
  }
  try {
    const [row] = await db
      .insert(contactGuardCourierAllowlist)
      .values({ domain, label: input.label?.trim() ?? null })
      .returning();
    invalidateContactGuardCache();
    return { success: true, data: { id: row.id, domain: row.domain, label: row.label, isActive: row.isActive } };
  } catch (e: any) {
    if (String(e?.message ?? e).includes('unique')) return { success: false, error: 'Dominio ya registrado' };
    return { success: false, error: 'Error creando courier' };
  }
}

export async function setCourierAllowlistActiveAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult<void>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  await db
    .update(contactGuardCourierAllowlist)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(contactGuardCourierAllowlist.id, id));
  invalidateContactGuardCache();
  return { success: true };
}

export async function deleteCourierAllowlistAction(id: string): Promise<ActionResult<void>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  await db.delete(contactGuardCourierAllowlist).where(eq(contactGuardCourierAllowlist.id, id));
  invalidateContactGuardCache();
  return { success: true };
}

// ─── Auditoría ──────────────────────────────────────────────────────────────

export type AuditEntry = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
  caseId: string | null;
  caseNumber: string | null;
  fieldName: string;
  actionName: string;
  originalText: string;
  normalizedText: string;
  violatedRules: Array<{ ruleId: string; ruleName: string; ruleType: string; matchedText: string }>;
  createdAt: Date;
  /** Contador de flags del mismo usuario en los últimos 30 días. */
  user30dCount?: number;
};

export type AuditFilter = {
  userId?: string;
  role?: string;
  fromDate?: Date;
  toDate?: Date;
  caseId?: string;
};

export async function listContactGuardAuditAction(
  filter: AuditFilter = {},
  pagination: { limit?: number; offset?: number } = {},
): Promise<ActionResult<AuditEntry[]>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return { success: false, error: guard.error };
  const limit = Math.min(Math.max(pagination.limit ?? 50, 1), 200);
  const offset = Math.max(pagination.offset ?? 0, 0);

  const conditions = [] as any[];
  if (filter.userId) conditions.push(eq(contactGuardAudit.userId, filter.userId));
  if (filter.role) conditions.push(eq(contactGuardAudit.userRole, filter.role));
  if (filter.caseId) conditions.push(eq(contactGuardAudit.clinicalCaseId, filter.caseId));
  if (filter.fromDate) conditions.push(gte(contactGuardAudit.createdAt, filter.fromDate));
  if (filter.toDate) conditions.push(sql`${contactGuardAudit.createdAt} <= ${filter.toDate}`);

  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: contactGuardAudit.id,
      userId: contactGuardAudit.userId,
      userName: userTable.fullName,
      userEmail: userTable.email,
      userRole: contactGuardAudit.userRole,
      caseId: contactGuardAudit.clinicalCaseId,
      caseNumber: clinicalCase.caseNumber,
      fieldName: contactGuardAudit.fieldName,
      actionName: contactGuardAudit.actionName,
      originalText: contactGuardAudit.originalText,
      normalizedText: contactGuardAudit.normalizedText,
      violatedRules: contactGuardAudit.violatedRules,
      createdAt: contactGuardAudit.createdAt,
    })
    .from(contactGuardAudit)
    .leftJoin(userTable, eq(contactGuardAudit.userId, userTable.id))
    .leftJoin(clinicalCase, eq(contactGuardAudit.clinicalCaseId, clinicalCase.id))
    .where(where as any)
    .orderBy(desc(contactGuardAudit.createdAt))
    .limit(limit)
    .offset(offset);

  // Conteo 30 días por usuario
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const counts = await db
    .select({
      userId: contactGuardAudit.userId,
      n: sql<number>`count(*)::int`,
    })
    .from(contactGuardAudit)
    .where(gte(contactGuardAudit.createdAt, since))
    .groupBy(contactGuardAudit.userId);
  const countMap = new Map(counts.map((c) => [c.userId, Number(c.n)]));

  return {
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.userName,
      userEmail: r.userEmail,
      userRole: r.userRole,
      caseId: r.caseId,
      caseNumber: r.caseNumber,
      fieldName: r.fieldName,
      actionName: r.actionName,
      originalText: r.originalText,
      normalizedText: r.normalizedText,
      violatedRules: (r.violatedRules as AuditEntry['violatedRules']) ?? [],
      createdAt: r.createdAt,
      user30dCount: countMap.get(r.userId) ?? 0,
    })),
  };
}
