/**
 * Re-evalúa los registros históricos de `contact_guard_audit` con la lógica ACTUAL de
 * ContactGuard (teléfonos country-aware + exención de URLs/tracking) para ver cuáles
 * pasarían ahora (eran falsos positivos ya corregidos) y cuáles seguirían bloqueados.
 *
 * Solo lectura: no modifica la auditoría ni las reglas.
 *
 * Uso: npx tsx scripts/recheck-contact-guard-audit.ts
 */
import 'dotenv/config';
import { config as dotenv } from 'dotenv';
dotenv({ path: '.env.local' });

function trunc(s: string, n = 60): string {
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length > n ? oneLine.slice(0, n - 1) + '…' : oneLine;
}

async function main() {
  const { db } = await import('@/lib/db');
  const { contactGuardAudit, clinicalCase, user } = await import('@/lib/db/schema');
  const { checkContactExposure } = await import('@/lib/contactGuard');
  const { ALL_SUPPORTED_COUNTRY_CODES } = await import('@/lib/contactGuard/phonePatterns');
  const { eq, inArray, desc } = await import('drizzle-orm');

  // Mismo criterio que resolveInvolvedCountryCodes en guardOrFail.ts.
  const caseCountryCache = new Map<string, string[]>();
  async function resolveCountries(actorId: string, caseId: string | null): Promise<string[]> {
    const key = `${actorId}::${caseId ?? ''}`;
    if (caseCountryCache.has(key)) return caseCountryCache.get(key)!;
    const ids = new Set<string>([actorId]);
    try {
      if (caseId) {
        const [c] = await db
          .select({ doctorId: clinicalCase.doctorId, techId: clinicalCase.assignedTechnicianId })
          .from(clinicalCase)
          .where(eq(clinicalCase.id, caseId))
          .limit(1);
        if (c?.doctorId) ids.add(c.doctorId);
        if (c?.techId) ids.add(c.techId);
      }
      const rows = await db.select({ country: user.country }).from(user).where(inArray(user.id, Array.from(ids)));
      const codes = Array.from(new Set(rows.map((r) => r.country).filter((x): x is string => !!x)));
      const result = codes.length > 0 ? codes : ALL_SUPPORTED_COUNTRY_CODES;
      caseCountryCache.set(key, result);
      return result;
    } catch {
      return ALL_SUPPORTED_COUNTRY_CODES;
    }
  }

  const audits = await db
    .select()
    .from(contactGuardAudit)
    .orderBy(desc(contactGuardAudit.createdAt))
    .limit(1000);

  console.log(`\n=== Re-evaluación de contact_guard_audit (${audits.length} registros) ===\n`);

  let nowPass = 0;
  let stillBlock = 0;
  const flips: string[] = [];
  const stays: string[] = [];

  for (const a of audits) {
    const countries = await resolveCountries(a.userId, a.clinicalCaseId);
    const res = await checkContactExposure(a.originalText, {
      field: a.fieldName,
      allowCourierUrls: a.fieldName === 'dispatchTracking',
      countries,
    });
    const oldRules = Array.isArray(a.violatedRules)
      ? (a.violatedRules as Array<{ ruleName?: string }>).map((v) => v?.ruleName).filter(Boolean).join(',')
      : '';
    const line = `[${a.fieldName}] "${trunc(a.originalText)}"  (países: ${countries.join('/')})  antes: ${oldRules || '—'}`;
    if (res.ok) {
      nowPass++;
      flips.push(`  ✅ PASA AHORA  ${line}`);
    } else {
      stillBlock++;
      const newRules = res.violations.map((v) => v.ruleName).join(',');
      stays.push(`  ⛔ SIGUE BLOQUEADO  ${line}  →  ahora: ${newRules}`);
    }
  }

  if (flips.length) {
    console.log(`── Pasarían ahora (eran falsos positivos) ── ${nowPass}\n`);
    for (const l of flips) console.log(l);
    console.log();
  }
  if (stays.length) {
    console.log(`── Siguen bloqueados ── ${stillBlock}\n`);
    for (const l of stays) console.log(l);
    console.log();
  }

  console.log(`Resumen: ${audits.length} registros · ${nowPass} pasarían ahora · ${stillBlock} siguen bloqueados.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
