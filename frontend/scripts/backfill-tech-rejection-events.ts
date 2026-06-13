/**
 * Backfill de eventos OFERTA_RECHAZADA_POR_TECNICO previos al fix de visibilidad.
 *
 * Antes, el rechazo explícito del técnico se registraba con `visibleTo: 'sistema'`
 * (+ presentationAuthor fauchard) y contenido genérico — invisible para el propio
 * técnico que rechazó. Ahora debe verlo en su carril con el motivo elegido.
 *
 * Este script migra los eventos antiguos: pone `visibleTo: 'tecnico'`, quita el
 * enmascarado Fauchard y reconstruye contenido + payload con el motivo/comentario
 * desde la invitación (individual, masivo manual o auto-OFF). Idempotente: solo
 * toca eventos que aún tengan `visibleTo='sistema'`.
 *
 * Uso (apuntando .env.local a la BD destino — confirmar antes de correr en prod):
 *   cd frontend && npx tsx scripts/backfill-tech-rejection-events.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const AUTO_OFF_BULK_CODE = 'brej_003';

function buildRejectionContent(headline: string, reasonLabel?: string | null, comment?: string | null): string {
  const lines = [headline];
  if (reasonLabel?.trim()) lines.push(`Motivo: ${reasonLabel.trim()}`);
  if (comment?.trim()) lines.push(`Comentario: ${comment.trim()}`);
  return lines.join('\n');
}

async function main() {
  const { db } = await import('../lib/db');
  const { sql } = await import('drizzle-orm');

  console.log('--- Backfill OFERTA_RECHAZADA_POR_TECNICO (visibilidad técnico) ---');

  // postgres-js: db.execute() devuelve el array de filas directamente (no { rows }).
  const rowsRes = await db.execute(sql`
    SELECT id, payload->>'invitationId' AS invitation_id
    FROM clinical_case_event
    WHERE action = 'OFERTA_RECHAZADA_POR_TECNICO'
      AND payload->>'visibleTo' = 'sistema'
  `);
  const events = (Array.isArray(rowsRes) ? rowsRes : (rowsRes as { rows?: unknown[] }).rows ?? []) as {
    id: string;
    invitation_id: string | null;
  }[];
  console.log(`Eventos a migrar: ${events.length}`);

  let migrated = 0;
  for (const evt of events) {
    let headline = 'Rechazaste esta invitación.';
    let reasonLabel: string | null = null;
    let displayComment: string | null = null;

    if (evt.invitation_id) {
      const invRes = await db.execute(sql`
        SELECT
          ci.rejection_comment,
          ci.bulk_rejection_comment,
          irr.label AS individual_label,
          brr.label AS bulk_label,
          brr.code  AS bulk_code
        FROM case_invitation ci
        LEFT JOIN invitation_rejection_reason irr ON irr.id = ci.rejection_reason_id
        LEFT JOIN bulk_rejection_reason brr ON brr.id = ci.bulk_rejection_reason_id
        WHERE ci.id = ${evt.invitation_id}
        LIMIT 1
      `);
      const invRows = (Array.isArray(invRes) ? invRes : (invRes as { rows?: unknown[] }).rows ?? []) as {
        rejection_comment: string | null;
        bulk_rejection_comment: string | null;
        individual_label: string | null;
        bulk_label: string | null;
        bulk_code: string | null;
      }[];
      const inv = invRows[0];
      if (inv) {
        if (inv.individual_label) {
          headline = 'Rechazaste esta invitación.';
          reasonLabel = inv.individual_label;
          displayComment = inv.rejection_comment;
        } else if (inv.bulk_label) {
          reasonLabel = inv.bulk_label;
          if (inv.bulk_code === AUTO_OFF_BULK_CODE) {
            // Auto-OFF: el comentario es jerga interna de auditoría, no se muestra.
            headline = 'Esta invitación se rechazó automáticamente porque tu disponibilidad se desactivó.';
            displayComment = null;
          } else {
            headline = 'Rechazaste esta invitación al pausar tu disponibilidad.';
            displayComment = inv.bulk_rejection_comment;
          }
        }
      }
    }

    const content = buildRejectionContent(headline, reasonLabel, displayComment);

    await db.execute(sql`
      UPDATE clinical_case_event
      SET content = ${content},
          payload = (payload - 'presentationAuthor')
            || jsonb_build_object(
                 'visibleTo', 'tecnico',
                 'rejectionReasonLabel', ${reasonLabel}::text,
                 'rejectionComment', ${displayComment}::text
               )
      WHERE id = ${evt.id}
    `);
    migrated++;
  }

  console.log(`Eventos migrados: ${migrated}`);
  console.log('--- Listo ---');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
