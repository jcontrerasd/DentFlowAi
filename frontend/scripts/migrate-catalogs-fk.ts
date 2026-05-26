/**
 * @deprecated Reemplazado por `migrate-recovery-v39.ts`. NO ejecutar en DBs que ya pasaron
 * por el reordenamiento de v3.7→v3.9 (deja duplicados sin resolver). Se conserva por trazabilidad.
 *
 * Migración one-time: catálogos UI → diseño best practice (id/code/label + FK).
 *
 * Pasos transaccionales:
 *  1. Guard: si clinical_case.material_id ya existe → abortar (idempotencia).
 *  2. Reparar catálogos: code legacy (texto completo) → slug canónico.
 *  3. ADD COLUMN material_id, restoration_type_id, shade_id, urgency_id (nullable).
 *  4. Backfill: matchear clinical_case.material vs dental_material.label (idem otros 3).
 *  5. Validar: abortar si hay casos huérfanos (FK null + text no null).
 *  6. ADD CONSTRAINT FK con ON DELETE RESTRICT.
 *  7. DROP COLUMN columnas text legacy.
 *
 * Uso:
 *   cd frontend
 *   DATABASE_URL=... npx tsx scripts/migrate-catalogs-fk.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

type LegacyMapping = Record<string, string>;

// Mapping legacy text (como se sembró en v3.7) → slug canónico (v3.8)
const VITA_SHADE_MAP: LegacyMapping = {
  'A1': 'a1', 'A2': 'a2', 'A3': 'a3', 'A3.5': 'a3_5', 'A4': 'a4',
  'B1': 'b1', 'B2': 'b2', 'B3': 'b3', 'B4': 'b4',
  'C1': 'c1', 'C2': 'c2', 'C3': 'c3', 'C4': 'c4',
  'D2': 'd2', 'D3': 'd3', 'D4': 'd4',
  'Otro': 'otro',
};
const RESTORATION_TYPE_MAP: LegacyMapping = {
  'Corona Unitaria': 'corona_unitaria',
  'Inlay': 'inlay',
  'Onlay': 'onlay',
  'Carilla': 'carilla',
  'Puente': 'puente',
  'Corona sobre implante': 'corona_implante',
  'Denture': 'denture',
  'Guía Quirúrgica': 'guia_quirurgica',
  'Otro': 'otro',
};
const DENTAL_MATERIAL_MAP: LegacyMapping = {
  'Zirconio Multicapa (Premium)': 'zirconio_multicapa_premium',
  'Zirconio Monolítico': 'zirconio_monolitico',
  'Disilicato de Litio (E-max)': 'disilicato_litio_emax',
  'Metal-Cerámica': 'metal_ceramica',
  'PMMA (Provisional)': 'pmma_provisional',
  'PEEK / BioHPP': 'peek_biohpp',
  'Titanio': 'titanio',
  'Cromo-Cobalto (Laser)': 'cromo_cobalto_laser',
  'Composite HD': 'composite_hd',
  'Cerámica Feldespática': 'ceramica_feldespatica',
  'Otro': 'otro',
};
// urgency_level ya estaba en slug ('baja'/'normal'/'alta'), no requiere renombrado.

async function main() {
  const { db } = await import('../lib/db');
  const { sql } = await import('drizzle-orm');

  console.log('🔧 Migración catálogos → FK (best practice)\n');

  // 1. Guard
  const guard = await db.execute(sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clinical_case' AND column_name = 'material_id'
    LIMIT 1
  `);
  if ((guard as any).rows?.length || (guard as any).length) {
    console.log('⏭  clinical_case.material_id ya existe — migración ya corrió. Abortando.');
    process.exit(0);
  }

  try {
    await db.transaction(async (tx) => {
      // 2. Reparar codes de catálogos (UPDATE por mapping)
      const renameCatalog = async (table: string, map: LegacyMapping) => {
        let count = 0;
        for (const [legacy, slug] of Object.entries(map)) {
          if (legacy === slug) continue;
          const res: any = await tx.execute(sql.raw(
            `UPDATE ${table} SET code = '${slug}', updated_at = NOW() WHERE code = '${legacy.replace(/'/g, "''")}'`
          ));
          count += res?.rowCount ?? 0;
        }
        console.log(`  ${table}: ${count} codes renombrados a slug`);
      };
      console.log('📝 Reparando codes de catálogos…');
      await renameCatalog('vita_shade', VITA_SHADE_MAP);
      await renameCatalog('restoration_type', RESTORATION_TYPE_MAP);
      await renameCatalog('dental_material', DENTAL_MATERIAL_MAP);

      // 3. ADD COLUMN nullable en clinical_case
      console.log('\n➕ Agregando columnas FK a clinical_case…');
      await tx.execute(sql`
        ALTER TABLE clinical_case
          ADD COLUMN material_id uuid,
          ADD COLUMN restoration_type_id uuid,
          ADD COLUMN shade_id uuid,
          ADD COLUMN urgency_id uuid;
      `);

      // 4. Backfill por matching con label (texto completo legacy)
      console.log('\n🔁 Backfilleando FKs…');
      const backfill = async (col: string, idCol: string, catalogTable: string) => {
        const res: any = await tx.execute(sql.raw(
          `UPDATE clinical_case cc
           SET ${idCol} = ct.id
           FROM ${catalogTable} ct
           WHERE ct.label = cc.${col} AND cc.${col} IS NOT NULL`
        ));
        console.log(`  clinical_case.${idCol}: ${res?.rowCount ?? 0} filas pobladas`);
      };
      await backfill('material', 'material_id', 'dental_material');
      await backfill('restoration_type', 'restoration_type_id', 'restoration_type');
      await backfill('shade', 'shade_id', 'vita_shade');
      // urgency ya estaba en slug → matchear contra code (no label)
      await tx.execute(sql`
        UPDATE clinical_case cc
        SET urgency_id = ul.id
        FROM urgency_level ul
        WHERE ul.code = cc.urgency
      `);
      const urgencyRes: any = await tx.execute(sql`SELECT COUNT(*) AS c FROM clinical_case WHERE urgency_id IS NOT NULL`);
      console.log(`  clinical_case.urgency_id: ${urgencyRes.rows?.[0]?.c ?? '?'} filas pobladas`);

      // 5. Validar huérfanos
      console.log('\n🔍 Verificando huérfanos…');
      const orphans: any = await tx.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE material IS NOT NULL AND material_id IS NULL)            AS material_orphans,
          COUNT(*) FILTER (WHERE restoration_type IS NOT NULL AND restoration_type_id IS NULL) AS restoration_orphans,
          COUNT(*) FILTER (WHERE shade IS NOT NULL AND shade_id IS NULL)                  AS shade_orphans,
          COUNT(*) FILTER (WHERE urgency IS NOT NULL AND urgency_id IS NULL)              AS urgency_orphans
        FROM clinical_case
      `);
      const o = orphans.rows?.[0] ?? {};
      const total = Number(o.material_orphans ?? 0) + Number(o.restoration_orphans ?? 0)
                  + Number(o.shade_orphans ?? 0) + Number(o.urgency_orphans ?? 0);
      if (total > 0) {
        console.error('❌ Huérfanos detectados:', o);
        throw new Error('Abortando: hay casos con valores que no matchean ninguna opción del catálogo.');
      }
      console.log('  ✓ Sin huérfanos');

      // 6. ADD FK constraints
      console.log('\n🔗 Agregando FK constraints…');
      await tx.execute(sql`
        ALTER TABLE clinical_case
          ADD CONSTRAINT clinical_case_material_id_fkey
            FOREIGN KEY (material_id) REFERENCES dental_material(id) ON DELETE RESTRICT,
          ADD CONSTRAINT clinical_case_restoration_type_id_fkey
            FOREIGN KEY (restoration_type_id) REFERENCES restoration_type(id) ON DELETE RESTRICT,
          ADD CONSTRAINT clinical_case_shade_id_fkey
            FOREIGN KEY (shade_id) REFERENCES vita_shade(id) ON DELETE RESTRICT,
          ADD CONSTRAINT clinical_case_urgency_id_fkey
            FOREIGN KEY (urgency_id) REFERENCES urgency_level(id) ON DELETE RESTRICT;
      `);

      // 6b. NOT NULL en urgency_id (legacy era notNull)
      await tx.execute(sql`ALTER TABLE clinical_case ALTER COLUMN urgency_id SET NOT NULL;`);

      // 7. DROP columnas legacy
      console.log('\n🗑  Eliminando columnas text legacy…');
      await tx.execute(sql`
        ALTER TABLE clinical_case
          DROP COLUMN material,
          DROP COLUMN restoration_type,
          DROP COLUMN shade,
          DROP COLUMN urgency;
      `);
    });
    console.log('\n✅ Migración completada con éxito.');
  } catch (err) {
    console.error('❌ Error en migración, ROLLBACK:', err);
    process.exit(1);
  }

  process.exit(0);
}

main();
