/**
 * Migración de recuperación (v3.9 — estado limpio definitivo).
 *
 * Reemplaza y consolida los scripts previos:
 *  - `migrate-catalogs-fk.ts`
 *  - `migrate-catalogs-opaque-codes.ts`
 *
 * Diagnóstico al momento de su creación (Cloud SQL):
 *  - dental_material: 22 filas (esperadas 11). business_key todos NULL.
 *  - restoration_type: 18 filas (esperadas 9). business_key mezclado (slugs vs labels).
 *  - vita_shade: 34 filas (esperadas 17). business_key todos NULL.
 *  - urgency_level: 3 filas correctas.
 *  - clinical_case: 103 casos con text legacy intacto, *_id columnas todas NULL.
 *
 * Operaciones:
 *  1. Normalizar business_key en restoration_type (mapping label → slug canónico).
 *  2. Deduplicar dental_material / restoration_type / vita_shade preservando una fila por label.
 *     - Para restoration_type, preferir fila con business_key correcto (slug).
 *  3. Re-secuenciar codes a opacos limpios sin huecos.
 *  4. Reparar clones huérfanos cuyo text legacy quedó NULL (heredar del padre).
 *  5. Backfill clinical_case.{material,restoration_type,shade,urgency}_id desde text legacy.
 *  6. Validar huérfanos → ROLLBACK si los hay.
 *  7. NOT NULL en urgency_id.
 *  8. Agregar FK constraints (ON DELETE RESTRICT) si faltan.
 *  9. DROP columnas text legacy.
 *
 * Idempotente: si la columna `clinical_case.material` ya no existe, asume completado.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const RESTORATION_LABEL_TO_SLUG: Record<string, string> = {
  'Corona Unitaria': 'corona_unitaria',
  'Inlay': 'inlay',
  'Inlaysssss': 'inlay',           // typo de prueba — fusionar con Inlay
  'Onlay': 'onlay',
  'Carilla': 'carilla',
  'Puente': 'puente',
  'Corona sobre implante': 'corona_implante',
  'Denture': 'denture',
  'Guía Quirúrgica': 'guia_quirurgica',
  'Otro': 'otro',
};

async function main() {
  const { db, infraPromise } = await import('../lib/db');
  const { sql } = await import('drizzle-orm');

  console.log('🔧 Recuperación catálogos + clinical_case\n');

  // Esperar a que infrastructure.ts termine sus ALTER TABLE antes de tomar locks
  if (infraPromise) {
    console.log('⏳ Esperando ensureInfrastructure…');
    await infraPromise;
  }

  // Guard idempotencia: si las columnas legacy ya no existen, no hay nada que hacer.
  const colCheck: any = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'clinical_case' AND column_name = 'material'
    LIMIT 1
  `);
  const colRows = colCheck.rows ?? colCheck;
  if (!colRows.length) {
    console.log('⏭  clinical_case.material ya no existe — recuperación ya corrió. Saliendo.');
    process.exit(0);
  }

  try {
    await db.transaction(async (tx) => {
      // ─── 1. Limpiar business_key + fusionar "Inlaysssss" ────────────────────────
      // Nulificamos business_key en todas las tablas para evitar conflictos UNIQUE
      // durante el dedup. Re-aplicamos los slugs canónicos después del dedup.
      console.log('🧹 Nulificando business_key + fusionando "Inlaysssss"…');
      await tx.execute(sql`UPDATE vita_shade       SET business_key = NULL, updated_at = NOW()`);
      await tx.execute(sql`UPDATE restoration_type SET business_key = NULL, updated_at = NOW()`);
      await tx.execute(sql`UPDATE dental_material  SET business_key = NULL, updated_at = NOW()`);
      // (urgency_level mantenemos sus business_keys actuales — está OK)
      await tx.execute(sql`
        UPDATE restoration_type SET label = 'Inlay', updated_at = NOW() WHERE label = 'Inlaysssss'
      `);

      // ─── 2. Deduplicar catálogos ────────────────────────────────────────────────
      console.log('🧹 Deduplicando catálogos…');
      const dedupSql = (table: string) => `
        WITH ranked AS (
          SELECT id, label,
                 ROW_NUMBER() OVER (PARTITION BY label ORDER BY sort_order, code, id) AS rn
          FROM ${table}
        )
        DELETE FROM ${table} WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
      `;
      for (const t of ['dental_material', 'restoration_type', 'vita_shade']) {
        const res: any = await tx.execute(sql.raw(dedupSql(t)));
        console.log(`  ${t}: ${res?.rowCount ?? 0} duplicados eliminados`);
      }

      // ─── 2b. Re-aplicar business_key canónico en restoration_type ──────────────
      console.log('🔖 Aplicando business_key canónico a restoration_type…');
      for (const [label, slug] of Object.entries(RESTORATION_LABEL_TO_SLUG)) {
        if (label === 'Inlaysssss') continue;
        await tx.execute(sql.raw(
          `UPDATE restoration_type
           SET business_key = '${slug}', updated_at = NOW()
           WHERE label = '${label.replace(/'/g, "''")}'`
        ));
      }

      // ─── 3. Re-secuenciar codes a opaco limpio ──────────────────────────────────
      console.log('🔢 Re-secuenciando codes opacos…');
      const reseq = async (table: string, prefix: string) => {
        // Staging temporal para evitar colisión UNIQUE(code)
        await tx.execute(sql.raw(
          `UPDATE ${table} SET code = '${prefix}_TMP_' || id::text, updated_at = NOW()`
        ));
        await tx.execute(sql.raw(
          `WITH ord AS (
             SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, id) AS rn FROM ${table}
           )
           UPDATE ${table} t
           SET code = '${prefix}_' || lpad(ord.rn::text, 3, '0'), updated_at = NOW()
           FROM ord WHERE t.id = ord.id`
        ));
      };
      await reseq('vita_shade', 'vita');
      await reseq('restoration_type', 'rest');
      await reseq('dental_material', 'mat');
      // urgency_level ya está OK (urg_001..urg_003)

      // ─── 4. Reparar clones huérfanos (text NULL pero padre tiene text) ─────────
      const orphanClonesRes: any = await tx.execute(sql`
        SELECT COUNT(*)::int AS c FROM clinical_case child
        JOIN clinical_case parent ON child.copied_from_case_id = parent.id
        WHERE child.material IS NULL AND parent.material IS NOT NULL
      `);
      const orphanCount = (orphanClonesRes.rows?.[0]?.c ?? orphanClonesRes[0]?.c) ?? 0;
      if (orphanCount > 0) {
        console.log(`🩹 Reparando ${orphanCount} clones huérfanos…`);
        await tx.execute(sql`
          UPDATE clinical_case child SET
            material = parent.material,
            restoration_type = parent.restoration_type,
            shade = parent.shade,
            urgency = COALESCE(child.urgency, parent.urgency),
            updated_at = NOW()
          FROM clinical_case parent
          WHERE child.copied_from_case_id = parent.id
            AND child.material IS NULL
            AND parent.material IS NOT NULL
        `);
      } else {
        console.log('🩹 No hay clones huérfanos.');
      }

      // ─── 5. Backfill FKs en clinical_case ───────────────────────────────────────
      console.log('🔁 Backfilleando FKs…');
      const backfill = async (col: string, idCol: string, catalogTable: string, matchCol = 'label') => {
        const res: any = await tx.execute(sql.raw(
          `UPDATE clinical_case cc
           SET ${idCol} = ct.id
           FROM ${catalogTable} ct
           WHERE ct.${matchCol} = cc.${col} AND cc.${col} IS NOT NULL AND cc.${idCol} IS NULL`
        ));
        console.log(`  ${idCol}: ${res?.rowCount ?? 0} filas pobladas`);
      };
      await backfill('material', 'material_id', 'dental_material', 'label');
      await backfill('restoration_type', 'restoration_type_id', 'restoration_type', 'label');
      await backfill('shade', 'shade_id', 'vita_shade', 'label');
      await backfill('urgency', 'urgency_id', 'urgency_level', 'business_key');

      // ─── 6. Validar huérfanos ───────────────────────────────────────────────────
      const orph: any = await tx.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE material IS NOT NULL AND material_id IS NULL)             AS material_orphans,
          COUNT(*) FILTER (WHERE restoration_type IS NOT NULL AND restoration_type_id IS NULL)  AS restoration_orphans,
          COUNT(*) FILTER (WHERE shade IS NOT NULL AND shade_id IS NULL)                   AS shade_orphans,
          COUNT(*) FILTER (WHERE urgency IS NOT NULL AND urgency_id IS NULL)               AS urgency_orphans
        FROM clinical_case
      `);
      const o = (orph.rows?.[0] ?? orph[0]) ?? {};
      const total = Number(o.material_orphans ?? 0) + Number(o.restoration_orphans ?? 0)
                  + Number(o.shade_orphans ?? 0) + Number(o.urgency_orphans ?? 0);
      if (total > 0) {
        console.error('❌ Huérfanos:', o);
        // Listar los casos huérfanos para debug
        const list: any = await tx.execute(sql`
          SELECT case_number, material, restoration_type, shade, urgency
          FROM clinical_case
          WHERE (material IS NOT NULL AND material_id IS NULL)
             OR (restoration_type IS NOT NULL AND restoration_type_id IS NULL)
             OR (shade IS NOT NULL AND shade_id IS NULL)
             OR (urgency IS NOT NULL AND urgency_id IS NULL)
          LIMIT 20
        `);
        console.error('Ejemplos:', list.rows ?? list);
        throw new Error('Abortando: hay valores text que no matchean ningún label/business_key del catálogo.');
      }
      console.log('🔍 Sin huérfanos');

      // ─── 7. NOT NULL urgency_id ─────────────────────────────────────────────────
      console.log('🔒 NOT NULL en urgency_id…');
      await tx.execute(sql`ALTER TABLE clinical_case ALTER COLUMN urgency_id SET NOT NULL`);

      // ─── 8. FK constraints (idempotente) ───────────────────────────────────────
      console.log('🔗 Agregando FK constraints…');
      await tx.execute(sql`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_case_material_id_fkey') THEN
            ALTER TABLE clinical_case ADD CONSTRAINT clinical_case_material_id_fkey
              FOREIGN KEY (material_id) REFERENCES dental_material(id) ON DELETE RESTRICT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_case_restoration_type_id_fkey') THEN
            ALTER TABLE clinical_case ADD CONSTRAINT clinical_case_restoration_type_id_fkey
              FOREIGN KEY (restoration_type_id) REFERENCES restoration_type(id) ON DELETE RESTRICT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_case_shade_id_fkey') THEN
            ALTER TABLE clinical_case ADD CONSTRAINT clinical_case_shade_id_fkey
              FOREIGN KEY (shade_id) REFERENCES vita_shade(id) ON DELETE RESTRICT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinical_case_urgency_id_fkey') THEN
            ALTER TABLE clinical_case ADD CONSTRAINT clinical_case_urgency_id_fkey
              FOREIGN KEY (urgency_id) REFERENCES urgency_level(id) ON DELETE RESTRICT;
          END IF;
        END $$;
      `);

      // ─── 9. DROP columnas text legacy ──────────────────────────────────────────
      console.log('🗑  Eliminando columnas text legacy…');
      await tx.execute(sql`
        ALTER TABLE clinical_case
          DROP COLUMN IF EXISTS material,
          DROP COLUMN IF EXISTS restoration_type,
          DROP COLUMN IF EXISTS shade,
          DROP COLUMN IF EXISTS urgency
      `);
    });
    console.log('\n✅ Recuperación completada con éxito.');
  } catch (err) {
    console.error('❌ Error en recuperación, ROLLBACK:', err);
    process.exit(1);
  }

  process.exit(0);
}

main();
