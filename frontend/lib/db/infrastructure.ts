import { sql } from "drizzle-orm";
import { invalidateContactGuardCache } from "@/lib/contactGuard/cache";

// Singleton persistente en el objeto global para sobrevivir a HMR en desarrollo
// Cambiar la versión fuerza re-ejecución aunque el proceso no se reinicie
/** v5.18 — Visor 3D de revisión: delivery_id en annotation para anotaciones por entrega. */
export const INFRA_VERSION = 'v5.19';
const globalForInfra = global as unknown as {
  infrastructureChecked: string | undefined
};

/** v5.9 — Renombra case_invitation → case_assignment y columnas legacy (PG no soporta RENAME COLUMN IF EXISTS). */
async function migrateCaseInvitationToAssignment(db: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }) {
  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'case_invitation'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'case_assignment'
      ) THEN
        ALTER TABLE case_invitation RENAME TO case_assignment;
      END IF;
    END $$;
  `);

  const renames: [string, string][] = [
    ['invited_at', 'assigned_at'],
    ['score_at_invite', 'score_at_assignment'],
    ['is_replacement', 'is_reassignment'],
    ['quoted_price', 'compensation'],
    ['quoted_days', 'deadline_days'],
    ['quoted_hours', 'deadline_hours'],
  ];

  for (const [from, to] of renames) {
    await db.execute(sql.raw(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'case_assignment' AND column_name = '${from}'
        ) THEN
          ALTER TABLE case_assignment RENAME COLUMN ${from} TO ${to};
        END IF;
      END $$;
    `));
  }

  await db.execute(sql`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'case_assignment'
      ) THEN
        UPDATE case_assignment SET status = 'accepted' WHERE status IN ('confirmed', 'quoted');
      END IF;
    END $$;

    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'technician_no_response_event'
          AND column_name = 'case_invitation_id'
      ) THEN
        ALTER TABLE technician_no_response_event RENAME COLUMN case_invitation_id TO case_assignment_id;
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS ca_case_idx ON case_assignment(clinical_case_id);
    CREATE INDEX IF NOT EXISTS ca_tech_idx ON case_assignment(technician_id);
    CREATE INDEX IF NOT EXISTS ca_status_idx ON case_assignment(status);
    CREATE INDEX IF NOT EXISTS ca_tech_assigned_idx
      ON case_assignment(technician_id, assigned_at);
    CREATE INDEX IF NOT EXISTS ca_case_pending_idx
      ON case_assignment(clinical_case_id) WHERE (status = 'pending');
  `);
}

/** v5.11 — Código opaco prc_NNN en price_rule + backfill. */
async function migratePriceRuleCode(db: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }) {
  await db.execute(sql`
    ALTER TABLE price_rule ADD COLUMN IF NOT EXISTS code TEXT;
  `);

  await db.execute(sql`
    DO $$
    DECLARE
      r RECORD;
      n INT := 0;
      max_existing INT := 0;
      c TEXT;
    BEGIN
      FOR c IN SELECT code FROM price_rule WHERE code IS NOT NULL AND code ~ '^prc_[0-9]+$'
      LOOP
        n := NULLIF(regexp_replace(c, '^prc_', ''), '')::INT;
        IF n > max_existing THEN max_existing := n; END IF;
      END LOOP;
      n := max_existing;
      FOR r IN
        SELECT id FROM price_rule WHERE code IS NULL ORDER BY created_at ASC, sort_order ASC, id ASC
      LOOP
        n := n + 1;
        UPDATE price_rule SET code = 'prc_' || LPAD(n::text, 3, '0') WHERE id = r.id;
      END LOOP;
    END $$;
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS price_rule_code_uidx ON price_rule(code);
  `);

  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM price_rule WHERE code IS NULL
      ) THEN
        ALTER TABLE price_rule ALTER COLUMN code SET NOT NULL;
      END IF;
    EXCEPTION WHEN others THEN
      NULL;
    END $$;
  `);
}

/**
 * DDL idempotente que debe existir aunque el gate de INFRA_VERSION ya haya corrido
 * (p. ej. HMR sin re-ejecutar el bloque versionado completo).
 */
export async function ensureIncrementalInfrastructure(db: any) {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS audit_log (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID REFERENCES organization(id) ON DELETE SET NULL,
        user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        payload JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS al_org_idx ON audit_log(organization_id);
      CREATE INDEX IF NOT EXISTS al_user_idx ON audit_log(user_id);
      CREATE INDEX IF NOT EXISTS al_action_idx ON audit_log(action);
    `);
  } catch (e) {
    console.error("[Infrastructure] Error creando audit_log:", e);
  }

  try {
    await db.execute(sql`
      ALTER TABLE fauchard_config
        ADD COLUMN IF NOT EXISTS max_assignment_attempts INTEGER NOT NULL DEFAULT 3;
    `);
  } catch (e) {
    console.error("[Infrastructure] Error añadiendo max_assignment_attempts:", e);
  }

  // v5.9 — case_invitation → case_assignment (idempotente; corre aunque INFRA_VERSION esté cacheada)
  try {
    await migrateCaseInvitationToAssignment(db);
  } catch (e) {
    console.error("[Infrastructure] Error migrando case_assignment (v5.9):", e);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS price_rule_change_event (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        rule_id UUID REFERENCES price_rule(id) ON DELETE SET NULL,
        changed_by TEXT NOT NULL REFERENCES "user"(id),
        action TEXT NOT NULL,
        field_key TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        change_reason TEXT NOT NULL,
        context JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS prce_rule_created_idx
        ON price_rule_change_event(rule_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS prce_changed_by_idx
        ON price_rule_change_event(changed_by);
      CREATE INDEX IF NOT EXISTS prce_action_idx
        ON price_rule_change_event(action);
    `);
  } catch (e) {
    console.error("[Infrastructure] Error creando price_rule_change_event:", e);
  }

  try {
    await migratePriceRuleCode(db);
  } catch (e) {
    console.error("[Infrastructure] Error migrando price_rule.code (v5.11):", e);
  }

  // v5.19 — Compuerta de Calidad (rol calidad + certificación previa al dentista).
  try {
    await ensureQualityGateInfrastructure(db);
  } catch (e) {
    console.error("[Infrastructure] Error creando infraestructura de Calidad (v5.19):", e);
  }
}

/**
 * v5.19 — DDL idempotente de la compuerta de Calidad. Inerte mientras
 * `QUALITY_GATE_ENABLED` esté off (las columnas/tablas existen pero no se usan).
 */
export async function ensureQualityGateInfrastructure(db: any) {
  // Columnas en clinical_case
  await db.execute(sql`
    ALTER TABLE clinical_case
      ADD COLUMN IF NOT EXISTS quality_reviewer_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS quality_assigned_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_quality_submitted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS quality_reminder_sent_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS quality_overdue_notified_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS clinical_case_qualityReviewerId_idx ON clinical_case(quality_reviewer_id);
  `);

  // Columnas en clinical_case_delivery
  await db.execute(sql`
    ALTER TABLE clinical_case_delivery
      ADD COLUMN IF NOT EXISTS quality_status TEXT NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS quality_comment TEXT,
      ADD COLUMN IF NOT EXISTS quality_reviewed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS quality_reviewer_id TEXT REFERENCES "user"(id);
  `);

  // Parámetro SLA en fauchard_config
  await db.execute(sql`
    ALTER TABLE fauchard_config
      ADD COLUMN IF NOT EXISTS t_quality_review_hours INTEGER NOT NULL DEFAULT 24;
  `);

  // Catálogo de motivos de derivación + seed idempotente
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS quality_derivation_reason (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      code TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS quality_derivation_reason_code_uidx ON quality_derivation_reason(code);
    INSERT INTO quality_derivation_reason (code, label, sort_order) VALUES
      ('qdr_001', 'Requiere más expertise', 1),
      ('qdr_002', 'Carga de trabajo alta', 2),
      ('qdr_003', 'Conflicto de interés', 3),
      ('qdr_004', 'No disponible', 4),
      ('qdr_005', 'Otro', 5)
    ON CONFLICT (code) DO NOTHING;
  `);

  // Historial/auditoría del revisor de Calidad por caso
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS case_quality_assignment (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      clinical_case_id UUID NOT NULL REFERENCES clinical_case(id) ON DELETE CASCADE,
      calidad_user_id TEXT NOT NULL REFERENCES "user"(id),
      status TEXT NOT NULL DEFAULT 'active',
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      derived_to_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
      derivation_reason_id UUID REFERENCES quality_derivation_reason(id),
      derivation_comment TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS cqa_case_idx ON case_quality_assignment(clinical_case_id);
    CREATE INDEX IF NOT EXISTS cqa_calidad_status_idx ON case_quality_assignment(calidad_user_id, status);
  `);
}

/**
 * Función interna para asegurar la integridad de la base de datos v3.0.
 * Este parche se ejecuta preventivamente para evitar errores de columnas faltantes.
 */
export async function ensureInfrastructure(db: any) {
  await ensureIncrementalInfrastructure(db);

  if (globalForInfra.infrastructureChecked === INFRA_VERSION) return;

  console.log("[DB] Verificando infraestructura...");

  try {
    // 0. clinical_case — tabla base de la que dependen todas las FKs
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS clinical_case (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
        doctor_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        internal_name TEXT NOT NULL DEFAULT '',
        needs_fabrication BOOLEAN NOT NULL DEFAULT false,
        notes_esthetic TEXT,
        notes_oclusal TEXT,
        patient_id_anon TEXT,
        status TEXT NOT NULL DEFAULT 'borrador',
        teeth JSONB,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        material_id UUID,
        restoration_type_id UUID,
        shade_id UUID,
        urgency_id UUID REFERENCES urgency_level(id) ON DELETE RESTRICT,
        assigned_technician_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
        assigned_at TIMESTAMPTZ,
        started_at TIMESTAMPTZ,
        published_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        last_activity_at TIMESTAMPTZ DEFAULT NOW(),
        current_responsibility TEXT DEFAULT 'dentista',
        doctor_notes TEXT,
        special_instructions TEXT,
        lab_notes TEXT,
        pending_action_request TEXT,
        pending_action_actor TEXT,
        case_number TEXT,
        commercial_version INTEGER NOT NULL DEFAULT 1,
        change_summary TEXT,
        is_archived BOOLEAN NOT NULL DEFAULT false,
        can_be_deleted BOOLEAN NOT NULL DEFAULT true,
        dispatch_info JSONB DEFAULT '{"courier":"","trackingId":"","status":"pending","photos":[]}',
        proposed_price DOUBLE PRECISION,
        proposed_delivery_days INTEGER,
        proposed_shipping_price DOUBLE PRECISION,
        proposed_shipping_days INTEGER,
        proposed_design_price DOUBLE PRECISION,
        proposed_design_days INTEGER,
        proposed_fabrication_price DOUBLE PRECISION,
        proposed_fabrication_days INTEGER,
        proposed_delivery_hours INTEGER,
        proposed_design_hours INTEGER,
        proposed_fabrication_hours INTEGER,
        proposed_shipping_hours INTEGER,
        proposal_expires_at TIMESTAMPTZ,
        platform_fee NUMERIC(5,4),
        internal_status TEXT,
        case_complexity TEXT,
        service_type TEXT,
        case_league TEXT NOT NULL DEFAULT 'bronce',
        dentist_rejection_reason TEXT,
        work_started_at TIMESTAMPTZ,
        work_deadline TIMESTAMPTZ,
        fauchard_config_id UUID REFERENCES fauchard_config(id) ON DELETE SET NULL,
        copied_from_case_id UUID
      );
      CREATE UNIQUE INDEX IF NOT EXISTS clinical_case_case_number_uidx ON clinical_case(case_number);
      CREATE INDEX IF NOT EXISTS clinical_case_assignedTechnicianId_idx ON clinical_case(assigned_technician_id);
      CREATE INDEX IF NOT EXISTS clinical_case_organizationId_idx ON clinical_case(organization_id);
      CREATE INDEX IF NOT EXISTS clinical_case_fauchardConfigId_idx ON clinical_case(fauchard_config_id);
    `);
  } catch (e) {
    console.error("[Infrastructure] Error creando clinical_case:", e);
  }

  try {
    // 1. Tablas base
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "file" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "clinical_case_id" uuid REFERENCES "clinical_case"("id") ON DELETE SET NULL,
        "organization_id" uuid NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
        "category" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "filename" text NOT NULL,
        "gcs_path" text,
        "mime_type" text,
        "size" integer,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        "uploader_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "sub_type" text
      );

      CREATE TABLE IF NOT EXISTS "annotation" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "clinical_case_id" uuid NOT NULL REFERENCES "clinical_case"("id") ON DELETE CASCADE,
        "coordinates" jsonb,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "is_resolved" boolean NOT NULL DEFAULT false,
        "text" text NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        "version_num" integer,
        "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS "bid" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "clinical_case_id" uuid NOT NULL REFERENCES "clinical_case"("id") ON DELETE CASCADE,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "delivery_days" integer NOT NULL,
        "delivery_type" text DEFAULT 'days' NOT NULL,
        "notes" text,
        "price" double precision NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        "technician_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "status" text DEFAULT 'pending' NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "commercial_round" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "clinical_case_id" uuid NOT NULL REFERENCES "clinical_case"("id") ON DELETE CASCADE,
        "round_number" integer NOT NULL,
        "status" text NOT NULL,
        "start_date" timestamp with time zone DEFAULT now() NOT NULL,
        "end_date" timestamp with time zone,
        "version_at_start" integer NOT NULL
      );

      CREATE SEQUENCE IF NOT EXISTS case_number_seq START 1000;
    `);

    // 2. Parche de Columnas Progresivo
    await db.execute(sql`
      DO $$ 
      BEGIN 
        -- Bid updates
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bid' AND column_name='status') THEN
          ALTER TABLE bid ADD COLUMN status TEXT DEFAULT 'pending' NOT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bid' AND column_name='delivery_type') THEN
          ALTER TABLE bid ADD COLUMN delivery_type TEXT DEFAULT 'days' NOT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bid' AND column_name='rejection_reason') THEN
          ALTER TABLE bid ADD COLUMN rejection_reason TEXT;
        END IF;

        -- Clinical Case updates (Lifecycle v3.1)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clinical_case' AND column_name='doctor_id') THEN
          ALTER TABLE clinical_case ADD COLUMN doctor_id TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clinical_case' AND column_name='assigned_at') THEN
          ALTER TABLE clinical_case ADD COLUMN assigned_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clinical_case' AND column_name='started_at') THEN
          ALTER TABLE clinical_case ADD COLUMN started_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clinical_case' AND column_name='completed_at') THEN
          ALTER TABLE clinical_case ADD COLUMN completed_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clinical_case' AND column_name='last_activity_at') THEN
          ALTER TABLE clinical_case ADD COLUMN last_activity_at TIMESTAMPTZ DEFAULT now();
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clinical_case' AND column_name='current_responsibility') THEN
          ALTER TABLE clinical_case ADD COLUMN current_responsibility TEXT DEFAULT 'dentista';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clinical_case' AND column_name='doctor_notes') THEN
          ALTER TABLE clinical_case ADD COLUMN doctor_notes TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clinical_case' AND column_name='lab_notes') THEN
          ALTER TABLE clinical_case ADD COLUMN lab_notes TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clinical_case' AND column_name='pending_action_request') THEN
          ALTER TABLE clinical_case ADD COLUMN pending_action_request TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clinical_case' AND column_name='pending_action_actor') THEN
          ALTER TABLE clinical_case ADD COLUMN pending_action_actor TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clinical_case' AND column_name='notes_esthetic') THEN
          ALTER TABLE clinical_case ADD COLUMN notes_esthetic TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clinical_case' AND column_name='notes_oclusal') THEN
          ALTER TABLE clinical_case ADD COLUMN notes_oclusal TEXT;
        END IF;

        -- F1: Modelo de datos, numero de caso y rondas comerciales
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clinical_case' AND column_name='case_number') THEN
          ALTER TABLE clinical_case ADD COLUMN case_number TEXT;
          CREATE UNIQUE INDEX IF NOT EXISTS clinical_case_case_number_uidx ON clinical_case(case_number);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clinical_case' AND column_name='commercial_version') THEN
          ALTER TABLE clinical_case ADD COLUMN commercial_version INTEGER DEFAULT 1 NOT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clinical_case' AND column_name='change_summary') THEN
          ALTER TABLE clinical_case ADD COLUMN change_summary TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clinical_case' AND column_name='is_archived') THEN
          ALTER TABLE clinical_case ADD COLUMN is_archived BOOLEAN DEFAULT false NOT NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clinical_case' AND column_name='can_be_deleted') THEN
          ALTER TABLE clinical_case ADD COLUMN can_be_deleted BOOLEAN DEFAULT true NOT NULL;
        END IF;

        -- F11: Miniaturas estáticas
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='file' AND column_name='thumbnail_path') THEN
          ALTER TABLE "file" ADD COLUMN "thumbnail_path" TEXT;
        END IF;

        -- BL-012: Backfill de número de caso para casos existentes
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bid' AND column_name='round_id') THEN
          ALTER TABLE bid ADD COLUMN round_id UUID REFERENCES commercial_round(id) ON DELETE SET NULL;
        END IF;

        -- F5: Snapshot de especificaciones en rondas
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='commercial_round' AND column_name='specs_snapshot') THEN
          ALTER TABLE commercial_round ADD COLUMN specs_snapshot JSONB;
        END IF;

        -- BL-040: Sincronizar columna version en rounds (v1 vs version_at_start)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='commercial_round' AND column_name='version') THEN
          ALTER TABLE commercial_round ADD COLUMN version INTEGER DEFAULT 1 NOT NULL;
        END IF;

        -- BL-041: Sincronizar created_at en rounds
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='commercial_round' AND column_name='created_at') THEN
          ALTER TABLE commercial_round ADD COLUMN created_at TIMESTAMPTZ DEFAULT now() NOT NULL;
        END IF;

        -- F6: Versionamiento de entregas
        CREATE TABLE IF NOT EXISTS clinical_case_delivery (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          clinical_case_id UUID NOT NULL REFERENCES clinical_case(id) ON DELETE CASCADE,
          technician_id TEXT NOT NULL REFERENCES "user"(id),
          version INTEGER NOT NULL,
          notes TEXT,
          files JSONB DEFAULT '[]'::jsonb,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
          reviewed_at TIMESTAMPTZ,
          review_comment TEXT
        );
        CREATE INDEX IF NOT EXISTS clinical_case_delivery_case_idx ON clinical_case_delivery(clinical_case_id);

        -- BL-012: Backfill de número de caso para casos existentes
        UPDATE clinical_case 
        SET case_number = 'DF-' || LPAD(nextval('case_number_seq')::text, 4, '0')
        WHERE case_number IS NULL;
        -- F9: Despacho
        ALTER TABLE clinical_case ADD COLUMN IF NOT EXISTS dispatch_info JSONB DEFAULT '{"courier": "", "trackingId": "", "status": "pending", "photos": []}'::jsonb;

        -- F10: Reputación
        CREATE TABLE IF NOT EXISTS review (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          clinical_case_id UUID NOT NULL REFERENCES clinical_case(id) ON DELETE CASCADE,
          reviewer_id TEXT NOT NULL REFERENCES "user"(id),
          reviewee_id TEXT NOT NULL REFERENCES "user"(id),
          rating INTEGER NOT NULL,
          dimension TEXT NOT NULL DEFAULT 'design',
          comment TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        );

        -- UCH: Hub Clínico Unificado - Eventos
        CREATE TABLE IF NOT EXISTS clinical_case_event (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          clinical_case_id UUID NOT NULL REFERENCES clinical_case(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES "user"(id),
          type TEXT NOT NULL, -- negociacion, tecnico, sistema
          action TEXT NOT NULL,
          content TEXT,
          payload JSONB DEFAULT '{}'::jsonb,
          state_change JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT now() NOT NULL
        );
        CREATE INDEX IF NOT EXISTS clinical_case_event_case_created_idx ON clinical_case_event(clinical_case_id, created_at DESC);

        -- ─── Sprint 0: Sistema Orquestado ─────────────────────────────────────

        -- S0-01: Habilidades declaradas por técnico
        CREATE TABLE IF NOT EXISTS technician_skill (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
          work_type TEXT NOT NULL,
          design_level INTEGER NOT NULL DEFAULT 0,
          fabrication_level INTEGER NOT NULL DEFAULT 0,
          effective_design_level INTEGER,
          effective_fabrication_level INTEGER,
          created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
          UNIQUE(user_id, work_type)
        );
        CREATE INDEX IF NOT EXISTS ts_user_id_idx ON technician_skill(user_id);

        -- S0-02: Renombrar tablas del algoritmo a Fauchard (migración única)
        DO $rename_tables$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='algorithm_config')
             AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='fauchard_config') THEN
            ALTER TABLE algorithm_config RENAME TO fauchard_config;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='algorithm_config_log')
             AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='fauchard_config_log') THEN
            ALTER TABLE algorithm_config_log RENAME TO fauchard_config_log;
          END IF;
        END $rename_tables$;

        -- S0-02: Parámetros de Fauchard (fila única activa)
        CREATE TABLE IF NOT EXISTS fauchard_config (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          version INTEGER NOT NULL DEFAULT 1,
          alpha_quality NUMERIC(4,3) NOT NULL DEFAULT 0.250,
          alpha_punctuality NUMERIC(4,3) NOT NULL DEFAULT 0.200,
          alpha_experience NUMERIC(4,3) NOT NULL DEFAULT 0.200,
          alpha_load NUMERIC(4,3) NOT NULL DEFAULT 0.200,
          alpha_bonus NUMERIC(4,3) NOT NULL DEFAULT 0.150,
          w_quality_days INTEGER NOT NULL DEFAULT 90,
          w_load_days INTEGER NOT NULL DEFAULT 30,
          c_max NUMERIC(3,1) NOT NULL DEFAULT 2.0,
          d_bonus_max_days INTEGER NOT NULL DEFAULT 30,
          load_reference_min INTEGER NOT NULL DEFAULT 5,
          t_cooldown_minutes INTEGER NOT NULL DEFAULT 720,
          d_inactivity_days INTEGER NOT NULL DEFAULT 15,
          n_invited INTEGER NOT NULL DEFAULT 5,
          n_floor INTEGER NOT NULL DEFAULT 1,
          t_quote_minutes INTEGER NOT NULL DEFAULT 90,
          t_proposal_hours INTEGER NOT NULL DEFAULT 2,
          platform_fee NUMERIC(5,4) NOT NULL DEFAULT 0.1500,
          l_min_rating NUMERIC(3,2) NOT NULL DEFAULT 4.20,
          l_cases_evaluated INTEGER NOT NULL DEFAULT 10,
          l_min_punctuality NUMERIC(3,2) NOT NULL DEFAULT 0.85,
          l_cases_completed INTEGER NOT NULL DEFAULT 15,
          l_cases_transition INTEGER NOT NULL DEFAULT 3,
          l_penalty_transition NUMERIC(3,2) NOT NULL DEFAULT 0.20,
          l_descent_rating NUMERIC(3,2) NOT NULL DEFAULT 3.00,
          l_descent_days INTEGER NOT NULL DEFAULT 60,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          updated_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        );

        -- S0-02b: Insertar fila inicial de configuración si no existe
        DO $init_fauchard$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM fauchard_config LIMIT 1) THEN
            INSERT INTO fauchard_config DEFAULT VALUES;
          END IF;
        END $init_fauchard$;

        -- S0-02c: Parche de columnas para fauchard_config (Ligas/Categorías)
        -- Esto asegura que si la tabla fue renombrada de 'algorithm_config', tenga las nuevas columnas.
        ALTER TABLE fauchard_config ADD COLUMN IF NOT EXISTS l_min_rating NUMERIC(3,2) NOT NULL DEFAULT 4.20;
        ALTER TABLE fauchard_config ADD COLUMN IF NOT EXISTS l_cases_evaluated INTEGER NOT NULL DEFAULT 10;
        ALTER TABLE fauchard_config ADD COLUMN IF NOT EXISTS l_min_punctuality NUMERIC(3,2) NOT NULL DEFAULT 0.85;
        ALTER TABLE fauchard_config ADD COLUMN IF NOT EXISTS l_cases_completed INTEGER NOT NULL DEFAULT 15;
        ALTER TABLE fauchard_config ADD COLUMN IF NOT EXISTS l_cases_transition INTEGER NOT NULL DEFAULT 3;
        ALTER TABLE fauchard_config ADD COLUMN IF NOT EXISTS l_penalty_transition NUMERIC(3,2) NOT NULL DEFAULT 0.20;
        ALTER TABLE fauchard_config ADD COLUMN IF NOT EXISTS l_descent_rating NUMERIC(3,2) NOT NULL DEFAULT 3.00;
        ALTER TABLE fauchard_config ADD COLUMN IF NOT EXISTS l_descent_days INTEGER NOT NULL DEFAULT 60;
        ALTER TABLE fauchard_config ADD COLUMN IF NOT EXISTS q_min_selection NUMERIC(3,2) NOT NULL DEFAULT 0.60;
        -- v5.16 — carga de referencia configurable para el factor L (antes constante 5 hardcodeada)
        ALTER TABLE fauchard_config ADD COLUMN IF NOT EXISTS load_reference_min INTEGER NOT NULL DEFAULT 5;

        -- Migración: t_cooldown_hours → t_cooldown_minutes (× 60)
        DO $migrate_cooldown$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'fauchard_config' AND column_name = 't_cooldown_hours'
          ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'fauchard_config' AND column_name = 't_cooldown_minutes'
          ) THEN
            ALTER TABLE fauchard_config RENAME COLUMN t_cooldown_hours TO t_cooldown_minutes;
            UPDATE fauchard_config SET t_cooldown_minutes = t_cooldown_minutes * 60;
            ALTER TABLE fauchard_config ALTER COLUMN t_cooldown_minutes SET DEFAULT 720;
          END IF;
        END $migrate_cooldown$;

        -- S0-03: Log inmutable de cambios de parámetros de Fauchard
        CREATE TABLE IF NOT EXISTS fauchard_config_log (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          config_id UUID NOT NULL REFERENCES fauchard_config(id),
          changed_by TEXT NOT NULL REFERENCES "user"(id),
          parameter_key TEXT NOT NULL,
          old_value TEXT,
          new_value TEXT,
          changed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        );
        CREATE INDEX IF NOT EXISTS acl_config_idx ON fauchard_config_log(config_id);
        CREATE INDEX IF NOT EXISTS acl_changed_by_idx ON fauchard_config_log(changed_by);

        -- S0-04: Invitaciones de cotización (reemplaza bid lógicamente)
        CREATE TABLE IF NOT EXISTS case_invitation (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          clinical_case_id UUID NOT NULL REFERENCES clinical_case(id) ON DELETE CASCADE,
          technician_id TEXT NOT NULL REFERENCES "user"(id),
          status TEXT NOT NULL DEFAULT 'pending',
          invited_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
          expires_at TIMESTAMPTZ,
          quoted_price DOUBLE PRECISION,
          quoted_days INTEGER,
          tech_notes TEXT,
          responded_at TIMESTAMPTZ,
          score_at_invite NUMERIC(6,4),
          created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ci_case_idx ON case_invitation(clinical_case_id);
        CREATE INDEX IF NOT EXISTS ci_tech_idx ON case_invitation(technician_id);
        CREATE INDEX IF NOT EXISTS ci_status_idx ON case_invitation(status);

        -- S0-05: Nuevas columnas en clinical_case
        ALTER TABLE clinical_case
          ADD COLUMN IF NOT EXISTS proposed_price DOUBLE PRECISION,
          ADD COLUMN IF NOT EXISTS proposed_delivery_days INTEGER,
          ADD COLUMN IF NOT EXISTS proposal_expires_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS platform_fee NUMERIC(5,4),
          ADD COLUMN IF NOT EXISTS internal_status TEXT,
          ADD COLUMN IF NOT EXISTS case_complexity TEXT,
          ADD COLUMN IF NOT EXISTS service_type TEXT,
          ADD COLUMN IF NOT EXISTS case_league TEXT DEFAULT 'bronce',
          ADD COLUMN IF NOT EXISTS dentist_rejection_reason TEXT;

        -- S0-06: Nuevas columnas en user
        ALTER TABLE "user"
          ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS league_level TEXT DEFAULT 'bronce',
          ADD COLUMN IF NOT EXISTS league_transition_count INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS last_invited_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS consecutive_no_response INTEGER DEFAULT 0,
          ADD COLUMN IF NOT EXISTS sub_roles JSONB,
          ADD COLUMN IF NOT EXISTS country TEXT;

        -- S0-04b: work_type en case_invitation (cooldown por tipo de trabajo)
        ALTER TABLE case_invitation ADD COLUMN IF NOT EXISTS work_type TEXT;
        ALTER TABLE case_invitation ADD COLUMN IF NOT EXISTS dentist_rejection_feedback TEXT;
        -- S0-07: Migración de technicalCapabilities → technician_skill
        -- Inserta nivel base (3 = intermedio) para técnicos con capabilities existentes
        INSERT INTO technician_skill (user_id, work_type, design_level, fabrication_level)
        SELECT
          u.id,
          work_type_val,
          CASE WHEN o.technical_capabilities::text ILIKE '%CAD%' THEN 3 ELSE 0 END,
          CASE WHEN o.technical_capabilities::text ILIKE '%CAM%' THEN 3 ELSE 0 END
        FROM "user" u
        JOIN organization o ON u.organization_id = o.id
        CROSS JOIN (VALUES
          ('corona_anterior'), ('corona_posterior'), ('corona_implante'), ('inlay_onlay'),
          ('carilla_unitaria'), ('carillas_multiples'), ('puente_3u'), ('puente_4mas'),
          ('full_arch'), ('protesis_parcial_removible'), ('protesis_total'),
          ('sobredentadura'), ('barra_implantes'), ('guia_quirurgica_simple'), ('guia_quirurgica_compleja')
        ) AS wt(work_type_val)
        WHERE u.role = 'tecnico'
          AND (o.technical_capabilities::text ILIKE '%CAD%' OR o.technical_capabilities::text ILIKE '%CAM%')
        ON CONFLICT (user_id, work_type) DO NOTHING;

        -- S0-08: work_started_at y work_deadline en clinical_case
        ALTER TABLE clinical_case
          ADD COLUMN IF NOT EXISTS work_started_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS work_deadline TIMESTAMPTZ;

        -- S0-10: published_at en clinical_case
        ALTER TABLE clinical_case ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

        -- S0-09: Backfill de habilidades para técnicos sin ningún skill registrado
        INSERT INTO technician_skill (user_id, work_type, design_level, fabrication_level)
        SELECT
          u.id,
          wt.work_type_val,
          1,
          0
        FROM "user" u
        CROSS JOIN (VALUES
          ('corona_anterior'), ('corona_posterior'), ('corona_implante'), ('inlay_onlay'),
          ('carilla_unitaria'), ('carillas_multiples'), ('puente_3u'), ('puente_4mas'),
          ('full_arch'), ('protesis_parcial_removible'), ('protesis_total'),
          ('sobredentadura'), ('barra_implantes'), ('guia_quirurgica_simple'), ('guia_quirurgica_compleja')
        ) AS wt(work_type_val)
        WHERE u.role = 'tecnico'
          AND NOT EXISTS (
            SELECT 1 FROM technician_skill ts WHERE ts.user_id = u.id
          )
        ON CONFLICT (user_id, work_type) DO NOTHING;

      END;
      $$;
    `);

    // v3.2: Anclaje de Fauchard por caso + como máximo una fila activa en fauchard_config
    await db.execute(sql`
      ALTER TABLE clinical_case ADD COLUMN IF NOT EXISTS fauchard_config_id UUID REFERENCES fauchard_config(id) ON DELETE SET NULL;
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS clinical_case_fauchard_config_id_idx ON clinical_case(fauchard_config_id);
    `);
    await db.execute(sql`
      WITH ranked AS (
        SELECT id,
          ROW_NUMBER() OVER (
            ORDER BY updated_at DESC NULLS LAST, version DESC NULLS LAST, id
          ) AS rn
        FROM fauchard_config
        WHERE is_active = true
      )
      UPDATE fauchard_config fc
      SET is_active = false, updated_at = now()
      FROM ranked r
      WHERE fc.id = r.id AND r.rn > 1;
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS fauchard_config_one_active_uidx ON fauchard_config ((1)) WHERE (is_active = true);
    `);

    // Instrucciones de creación vs comentarios de revisión (por entrega)
    await db.execute(sql`
      ALTER TABLE clinical_case ADD COLUMN IF NOT EXISTS special_instructions TEXT;
    `);
    await db.execute(sql`
      UPDATE clinical_case c
      SET special_instructions = c.doctor_notes
      WHERE c.special_instructions IS NULL
        AND c.doctor_notes IS NOT NULL
        AND TRIM(c.doctor_notes) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM clinical_case_delivery d
          WHERE d.clinical_case_id = c.id
            AND d.status = 'rejected'
            AND d.review_comment IS NOT NULL
            AND TRIM(d.review_comment) <> ''
        );
    `);

    // v3.4: Lectura del Centro de control (UCH) por usuario y caso (sincroniza no leídos entre dispositivos)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS clinical_case_hub_read (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        clinical_case_id UUID NOT NULL REFERENCES clinical_case(id) ON DELETE CASCADE,
        last_read_tech_hub_at TIMESTAMPTZ,
        last_read_neg_hub_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, clinical_case_id)
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS clinical_case_hub_read_user_idx ON clinical_case_hub_read(user_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS clinical_case_hub_read_case_idx ON clinical_case_hub_read(clinical_case_id);
    `);

    // v3.5: una invitación activa (pending/quoted) por técnico y caso
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS case_invitation_one_active_per_tech_uidx
      ON case_invitation (clinical_case_id, technician_id)
      WHERE status IN ('pending', 'quoted');
    `);

    // v3.6: archivado por usuario + trazabilidad de copia de caso
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS case_user_archive (
        user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        clinical_case_id UUID NOT NULL REFERENCES clinical_case(id) ON DELETE CASCADE,
        archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, clinical_case_id)
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS case_user_archive_user_idx ON case_user_archive(user_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS case_user_archive_case_idx ON case_user_archive(clinical_case_id);
    `);
    await db.execute(sql`
      INSERT INTO case_user_archive (user_id, clinical_case_id, archived_at)
      SELECT doctor_id, id, COALESCE(updated_at, NOW())
      FROM clinical_case
      WHERE is_archived = true AND doctor_id IS NOT NULL
      ON CONFLICT (user_id, clinical_case_id) DO NOTHING;
    `);
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'clinical_case' AND column_name = 'copied_from_case_id'
        ) THEN
          ALTER TABLE clinical_case ADD COLUMN copied_from_case_id UUID REFERENCES clinical_case(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // v3.7: catálogos UI administrables (vita_shade, restoration_type, dental_material, urgency_level)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vita_shade (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        code TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS restoration_type (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        code TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS dental_material (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        code TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS urgency_level (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        code TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Seed catálogos (idempotente) — solo id/code/label/sort_order/is_active
    await db.execute(sql`
      INSERT INTO vita_shade (code, label, sort_order) VALUES
        ('vita_001','A1',1),('vita_002','A2',2),('vita_003','A3',3),('vita_004','A3.5',4),('vita_005','A4',5),
        ('vita_006','B1',6),('vita_007','B2',7),('vita_008','B3',8),('vita_009','B4',9),
        ('vita_010','C1',10),('vita_011','C2',11),('vita_012','C3',12),('vita_013','C4',13),
        ('vita_014','D2',14),('vita_015','D3',15),('vita_016','D4',16),
        ('vita_017','Otro',17)
      ON CONFLICT (code) DO NOTHING;
    `);
    await db.execute(sql`
      INSERT INTO restoration_type (code, label, sort_order) VALUES
        ('rest_001','Corona Unitaria',1),
        ('rest_002','Inlay',2),
        ('rest_003','Onlay',3),
        ('rest_004','Carilla',4),
        ('rest_005','Puente',5),
        ('rest_006','Corona sobre implante',6),
        ('rest_007','Denture',7),
        ('rest_008','Guía Quirúrgica',8),
        ('rest_009','Otro',9)
      ON CONFLICT (code) DO NOTHING;
    `);
    await db.execute(sql`
      INSERT INTO dental_material (code, label, sort_order) VALUES
        ('mat_001','Zirconio Multicapa (Premium)',1),
        ('mat_002','Zirconio Monolítico',2),
        ('mat_003','Disilicato de Litio (E-max)',3),
        ('mat_004','Metal-Cerámica',4),
        ('mat_005','PMMA (Provisional)',5),
        ('mat_006','PEEK / BioHPP',6),
        ('mat_007','Titanio',7),
        ('mat_008','Cromo-Cobalto (Laser)',8),
        ('mat_009','Composite HD',9),
        ('mat_010','Cerámica Feldespática',10),
        ('mat_011','Otro',11)
      ON CONFLICT (code) DO NOTHING;
    `);
    await db.execute(sql`
      INSERT INTO urgency_level (code, label, sort_order) VALUES
        ('urg_001','Baja',1),
        ('urg_002','Normal',2),
        ('urg_003','Alta',3)
      ON CONFLICT (code) DO NOTHING;
    `);

    // v4.0: drop columna business_key + sus índices (limpieza del refactor previo)
    await db.execute(sql`
      ALTER TABLE vita_shade        DROP COLUMN IF EXISTS business_key;
      ALTER TABLE restoration_type  DROP COLUMN IF EXISTS business_key;
      ALTER TABLE dental_material   DROP COLUMN IF EXISTS business_key;
      ALTER TABLE urgency_level     DROP COLUMN IF EXISTS business_key;
    `);

    // v3.8: columnas FK en clinical_case (best practice id/code/label).
    // Las columnas se agregan en infrastructure para fresh installs; en bases con datos
    // existentes (v3.7) hay que correr `npx tsx scripts/migrate-catalogs-fk.ts` para
    // backfillear y luego dropear las columnas text legacy.
    await db.execute(sql`
      ALTER TABLE clinical_case
        ADD COLUMN IF NOT EXISTS material_id uuid,
        ADD COLUMN IF NOT EXISTS restoration_type_id uuid,
        ADD COLUMN IF NOT EXISTS shade_id uuid,
        ADD COLUMN IF NOT EXISTS urgency_id uuid;
    `);
    // FKs (idempotente via DO block + not exists check)
    await db.execute(sql`
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

    // v4.1: ContactGuard — anti-desintermediación (reglas, allowlist couriers, auditoría)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contact_guard_rule (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        type TEXT NOT NULL CHECK (type IN ('regex','keyword')),
        name TEXT NOT NULL,
        pattern TEXT NOT NULL,
        flags TEXT DEFAULT 'i',
        description TEXT,
        severity TEXT NOT NULL DEFAULT 'block',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        applies_to_fields JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS contact_guard_rule_active_idx ON contact_guard_rule(is_active);
      CREATE INDEX IF NOT EXISTS contact_guard_rule_type_idx ON contact_guard_rule(type);

      CREATE TABLE IF NOT EXISTS contact_guard_courier_allowlist (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        domain TEXT NOT NULL,
        label TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS contact_guard_courier_domain_uidx ON contact_guard_courier_allowlist(domain);

      CREATE TABLE IF NOT EXISTS contact_guard_audit (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        org_id UUID REFERENCES organization(id) ON DELETE SET NULL,
        user_role TEXT,
        clinical_case_id UUID REFERENCES clinical_case(id) ON DELETE SET NULL,
        field_name TEXT NOT NULL,
        action_name TEXT NOT NULL,
        original_text TEXT NOT NULL,
        normalized_text TEXT NOT NULL,
        violated_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS contact_guard_audit_user_created_idx ON contact_guard_audit(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS contact_guard_audit_case_idx ON contact_guard_audit(clinical_case_id);

      -- Reconciliar tablas legacy de contact_guard_audit creadas con el esquema antiguo
      -- (trigger_type / matched_rule_id / matched_text / action_taken). CREATE TABLE IF NOT EXISTS
      -- no las re-crea, así que el SELECT del historial fallaba por columnas inexistentes.
      ALTER TABLE contact_guard_audit ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organization(id) ON DELETE SET NULL;
      ALTER TABLE contact_guard_audit ADD COLUMN IF NOT EXISTS user_role TEXT;
      ALTER TABLE contact_guard_audit ADD COLUMN IF NOT EXISTS field_name TEXT;
      ALTER TABLE contact_guard_audit ADD COLUMN IF NOT EXISTS action_name TEXT;
      ALTER TABLE contact_guard_audit ADD COLUMN IF NOT EXISTS original_text TEXT;
      ALTER TABLE contact_guard_audit ADD COLUMN IF NOT EXISTS normalized_text TEXT;
      ALTER TABLE contact_guard_audit ADD COLUMN IF NOT EXISTS violated_rules JSONB NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE contact_guard_audit DROP COLUMN IF EXISTS trigger_type;
      ALTER TABLE contact_guard_audit DROP COLUMN IF EXISTS matched_rule_id;
      ALTER TABLE contact_guard_audit DROP COLUMN IF EXISTS matched_text;
      ALTER TABLE contact_guard_audit DROP COLUMN IF EXISTS action_taken;
    `);

    // v4.2/v4.3: regex con backslashes correctos. Usar inserts individuales
    // (un statement por regla) en lugar de un VALUES multi-row con interpolación,
    // porque la combinación `${String.raw}` dentro de `(VALUES ... ${...} ...)`
    // del tag `sql` falló silenciosamente y dejó la tabla sin regex.
    const REGEX_SEEDS: Array<{ name: string; pattern: string; description: string }> = [
      { name: 'email', pattern: String.raw`[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}`, description: 'Direcciones de correo electrónico' },
      { name: 'telefono_cl_intl', pattern: String.raw`(?:\+?56)[\s\-\.]?9[\s\-\.]?\d{4}[\s\-\.]?\d{4}`, description: 'Teléfono móvil chileno con prefijo internacional' },
      { name: 'telefono_8plus_digitos', pattern: String.raw`(?<!\d)(?:\+?\d{1,3}[\s\-\.]?)?\d{8,}(?!\d)`, description: 'Secuencias de 8 o más dígitos (teléfonos)' },
      { name: 'url_http', pattern: String.raw`https?://[^\s]+`, description: 'URLs http/https' },
      { name: 'url_shortener', pattern: String.raw`(?:bit\.ly|t\.co|goo\.gl|tinyurl\.com|ow\.ly|is\.gd|buff\.ly|cutt\.ly|rebrand\.ly|short\.io)/[a-z0-9]+`, description: 'URLs acortadas' },
      { name: 'dominio_explicito', pattern: String.raw`(?<![a-z0-9])[a-z0-9\-]{2,}\.(?:com|cl|net|org|io|app|me|co|info|biz|gob\.cl|edu\.cl)(?![a-z])`, description: 'Dominios sin protocolo (ejemplo.com)' },
      { name: 'handle_arroba', pattern: String.raw`(?<![a-z0-9._%+\-])@[a-z0-9._]{3,}`, description: 'Handles de redes sociales (@usuario)' },
    ];
    for (const r of REGEX_SEEDS) {
      await db.execute(sql`DELETE FROM contact_guard_rule WHERE name = ${r.name}`);
      await db.execute(sql`
        INSERT INTO contact_guard_rule (type, name, pattern, flags, description, severity, is_active)
        VALUES ('regex', ${r.name}, ${r.pattern}, 'i', ${r.description}, 'block', TRUE);
      `);
    }

    // Seed reglas keyword (sin backslashes, sin String.raw, sin problema histórico).
    await db.execute(sql`
      INSERT INTO contact_guard_rule (type, name, pattern, flags, description, severity, is_active)
      SELECT * FROM (VALUES
        ('keyword', 'whatsapp', 'whatsapp', 'i', 'Mención de WhatsApp', 'block', TRUE),
        ('keyword', 'wsp', 'wsp', 'i', 'Abreviación de WhatsApp', 'block', TRUE),
        ('keyword', 'wassap', 'wassap', 'i', 'Variante de WhatsApp', 'block', TRUE),
        ('keyword', 'guasap', 'guasap', 'i', 'Variante fonética de WhatsApp', 'block', TRUE),
        ('keyword', 'telegram', 'telegram', 'i', 'Mención de Telegram', 'block', TRUE),
        ('keyword', 'signal', 'signal app', 'i', 'Mención de Signal app', 'block', TRUE),
        ('keyword', 'instagram', 'instagram', 'i', 'Mención de Instagram', 'block', TRUE),
        ('keyword', 'fuera_plataforma', 'fuera de la plataforma', 'i', 'Intento de salir del sistema', 'block', TRUE),
        ('keyword', 'por_fuera', 'por fuera', 'i', 'Intento de salir del sistema', 'block', TRUE),
        ('keyword', 'directo_conmigo', 'directo conmigo', 'i', 'Intento de contacto directo', 'block', TRUE),
        ('keyword', 'llamame', 'llámame', 'i', 'Intento de contacto telefónico', 'block', TRUE),
        ('keyword', 'mi_numero', 'mi número', 'i', 'Intento de pasar número', 'block', TRUE),
        ('keyword', 'mi_celular', 'mi celular', 'i', 'Intento de pasar celular', 'block', TRUE),
        ('keyword', 'escribeme', 'escríbeme', 'i', 'Intento de contacto directo', 'block', TRUE),
        ('keyword', 'contactame', 'contáctame', 'i', 'Intento de contacto directo', 'block', TRUE)
      ) AS seed(type, name, pattern, flags, description, severity, is_active)
      WHERE NOT EXISTS (SELECT 1 FROM contact_guard_rule WHERE contact_guard_rule.name = seed.name);
    `);

    // Seed couriers permitidos
    await db.execute(sql`
      INSERT INTO contact_guard_courier_allowlist (domain, label)
      SELECT * FROM (VALUES
        ('chilexpress.cl', 'Chilexpress'),
        ('starken.cl', 'Starken'),
        ('correoschile.cl', 'CorreosChile'),
        ('bluexpress.cl', 'BlueExpress')
      ) AS seed(domain, label)
      ON CONFLICT (domain) DO NOTHING;
    `);

    // Invalida la caché in-memory de ContactGuard para que las reglas reseedadas
    // entren en efecto inmediato (sin esperar el TTL de 60s).
    invalidateContactGuardCache();

    // v4.3 — Preferencia de tema por usuario (light | dark | system).
    await db.execute(sql`
      ALTER TABLE "user"
        ADD COLUMN IF NOT EXISTS theme_preference text NOT NULL DEFAULT 'system';
    `);

    // v4.4 — Flete (shipping) en cotizaciones: costo + días traslado
    // Aplica a casos con fabricación. El fee de plataforma NO aplica al flete.
    await db.execute(sql`
      ALTER TABLE "case_invitation"
        ADD COLUMN IF NOT EXISTS quoted_shipping_price double precision,
        ADD COLUMN IF NOT EXISTS quoted_shipping_days  integer;
      ALTER TABLE "clinical_case"
        ADD COLUMN IF NOT EXISTS proposed_shipping_price double precision,
        ADD COLUMN IF NOT EXISTS proposed_shipping_days  integer;
    `);

    // v4.5 — Desglose diseño/fabricación pactado en clinical_case.
    // Permite mostrar Diseño + Fabricación + Flete en la cabecera UCH tras la aceptación
    // (antes solo vivía en case_invitation del ganador).
    await db.execute(sql`
      ALTER TABLE "clinical_case"
        ADD COLUMN IF NOT EXISTS proposed_design_price double precision,
        ADD COLUMN IF NOT EXISTS proposed_design_days integer,
        ADD COLUMN IF NOT EXISTS proposed_fabrication_price double precision,
        ADD COLUMN IF NOT EXISTS proposed_fabrication_days integer;
    `);

    // v4.6 — Plazos en horas (1–24 h) por slot + calendario laboral configurable.
    // Columnas *_hours paralelas a *_days en case_invitation y clinical_case
    // (mutuamente excluyentes por slot).
    await db.execute(sql`
      ALTER TABLE "case_invitation"
        ADD COLUMN IF NOT EXISTS quoted_hours integer,
        ADD COLUMN IF NOT EXISTS quoted_design_hours integer,
        ADD COLUMN IF NOT EXISTS quoted_fabrication_hours integer,
        ADD COLUMN IF NOT EXISTS quoted_shipping_hours integer;
      ALTER TABLE "clinical_case"
        ADD COLUMN IF NOT EXISTS proposed_delivery_hours integer,
        ADD COLUMN IF NOT EXISTS proposed_design_hours integer,
        ADD COLUMN IF NOT EXISTS proposed_fabrication_hours integer,
        ADD COLUMN IF NOT EXISTS proposed_shipping_hours integer;
    `);

    // v4.7 — Índices de rendimiento: status, doctor_id, last_activity_at, delivery, ci composite
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS clinical_case_status_idx
        ON clinical_case(status);
      CREATE INDEX IF NOT EXISTS clinical_case_org_status_idx
        ON clinical_case(organization_id, status);
      CREATE INDEX IF NOT EXISTS clinical_case_doctor_id_idx
        ON clinical_case(doctor_id);
      CREATE INDEX IF NOT EXISTS clinical_case_last_activity_idx
        ON clinical_case(last_activity_at DESC NULLS LAST);
      CREATE INDEX IF NOT EXISTS clinical_case_delivery_case_idx_v2
        ON clinical_case_delivery(clinical_case_id);
      CREATE INDEX IF NOT EXISTS ci_tech_invited_at_idx
        ON case_invitation(technician_id, invited_at);
      CREATE INDEX IF NOT EXISTS ci_case_pending_idx
        ON case_invitation(clinical_case_id) WHERE (status = 'pending');
    `);

    // ─────────────────────────────────────────────────────────────────────────
    // v5.0 — Modelo de disponibilidad del técnico, sanción rolling y cola pool.
    // Ver Doc Servicio Orquestado/{flujo_tiempos,plan_flujo_tiempos}.md.
    // Todas las tablas/columnas se crean siempre (idempotente); el comportamiento
    // queda inerte hasta encender AVAILABILITY_MODEL_ENABLED. El único paso gated
    // es el backfill de technician_availability (más abajo).
    // ─────────────────────────────────────────────────────────────────────────

    // 1) Disponibilidad declarada (modelo aplanado: 1 fila por técnico).
    //    5 categorías canónicas × 2 capacidades (CAD/CAM) = 10 columnas hijas.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS technician_availability (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        level_global BOOLEAN NOT NULL DEFAULT TRUE,
        level_cad BOOLEAN NOT NULL DEFAULT FALSE,
        level_cam BOOLEAN NOT NULL DEFAULT FALSE,
        cat_coronas_cad BOOLEAN NOT NULL DEFAULT TRUE,
        cat_coronas_cam BOOLEAN NOT NULL DEFAULT TRUE,
        cat_inlays_cad BOOLEAN NOT NULL DEFAULT TRUE,
        cat_inlays_cam BOOLEAN NOT NULL DEFAULT TRUE,
        cat_puentes_cad BOOLEAN NOT NULL DEFAULT TRUE,
        cat_puentes_cam BOOLEAN NOT NULL DEFAULT TRUE,
        cat_protesis_cad BOOLEAN NOT NULL DEFAULT TRUE,
        cat_protesis_cam BOOLEAN NOT NULL DEFAULT TRUE,
        cat_guias_cad BOOLEAN NOT NULL DEFAULT TRUE,
        cat_guias_cam BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS technician_availability_user_uidx ON technician_availability(user_id);
    `);

    // v5.1 — marca de recordatorio de inactividad enviado (idempotencia del cron
    // process-availability: se re-arma cuando el técnico vuelve a tener actividad).
    await db.execute(sql`
      ALTER TABLE technician_availability
        ADD COLUMN IF NOT EXISTS inactivity_reminder_sent_at TIMESTAMPTZ;
    `);

    // 2) Eventos individuales de no-respuesta (timestamps para ventana rolling).
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS technician_no_response_event (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        technician_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        case_invitation_id UUID REFERENCES case_invitation(id) ON DELETE SET NULL,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        status TEXT NOT NULL DEFAULT 'active', -- active | expired_window | pardoned
        pardoned_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
        pardoned_at TIMESTAMPTZ,
        pardon_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS tnre_tech_occurred_idx ON technician_no_response_event(technician_user_id, occurred_at);
      CREATE INDEX IF NOT EXISTS tnre_status_idx ON technician_no_response_event(status);
    `);

    // 3) Catálogos de motivos de rechazo (mismo patrón que vita_shade, etc.).
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS invitation_rejection_reason (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        code TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        description TEXT,
        sort_order INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS bulk_rejection_reason (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        code TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        description TEXT,
        sort_order INTEGER NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Seed de motivos (idempotente).
    await db.execute(sql`
      INSERT INTO invitation_rejection_reason (code, label, sort_order) VALUES
        ('rej_001','Carga de trabajo alta',1),
        ('rej_002','Plazo demasiado corto',2),
        ('rej_003','Precio sugerido fuera de rango',3),
        ('rej_004','No manejo el material requerido',4),
        ('rej_005','Caso fuera de mi especialidad clínica',5),
        ('rej_006','Información del caso insuficiente',6),
        ('rej_007','Otro',7)
      ON CONFLICT (code) DO NOTHING;
    `);
    await db.execute(sql`
      INSERT INTO bulk_rejection_reason (code, label, sort_order) VALUES
        ('brej_001','Vacaciones',1),
        ('brej_002','Carga de trabajo alta',2),
        ('brej_003','Pausa temporal',3),
        ('brej_004','Problema personal',4),
        ('brej_005','Otro',5)
      ON CONFLICT (code) DO NOTHING;
    `);

    // 4) Columnas nuevas en case_invitation (rechazo individual + masivo + reemplazo).
    await db.execute(sql`
      ALTER TABLE case_invitation
        ADD COLUMN IF NOT EXISTS rejection_reason_id UUID REFERENCES invitation_rejection_reason(id) ON DELETE RESTRICT,
        ADD COLUMN IF NOT EXISTS rejection_comment TEXT,
        ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS bulk_rejection_reason_id UUID REFERENCES bulk_rejection_reason(id) ON DELETE RESTRICT,
        ADD COLUMN IF NOT EXISTS bulk_rejection_comment TEXT,
        ADD COLUMN IF NOT EXISTS is_replacement BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    // 5) Columnas nuevas en clinical_case (cola pendiente_pool + countdown revisión).
    await db.execute(sql`
      ALTER TABLE clinical_case
        ADD COLUMN IF NOT EXISTS pending_pool_cycle_count INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS pending_pool_started_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS pending_pool_checkin_sent_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS last_revision_submitted_at TIMESTAMPTZ;
    `);

    // v5.2 — idempotencia de la escalación del countdown de revisión del dentista
    // (cron process-availability). Se reinician en cada submitRevisionAction.
    await db.execute(sql`
      ALTER TABLE clinical_case
        ADD COLUMN IF NOT EXISTS review_reminder_sent_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS review_overdue_notified_at TIMESTAMPTZ;
    `);

    // 6) Columnas nuevas en fauchard_config (plazos, sanción, umbrales, heartbeat,
    //    score αN, auditoría). Defaults = sección 6.1 del doc funcional.
    await db.execute(sql`
      ALTER TABLE fauchard_config
        ADD COLUMN IF NOT EXISTS t_dentist_review_hours INTEGER NOT NULL DEFAULT 48,
        ADD COLUMN IF NOT EXISTS t_no_eligible_pool_hours INTEGER NOT NULL DEFAULT 24,
        ADD COLUMN IF NOT EXISTS max_pool_cycles INTEGER NOT NULL DEFAULT 2,
        ADD COLUMN IF NOT EXISTS replacement_cutoff_minutes INTEGER NOT NULL DEFAULT 10,
        ADD COLUMN IF NOT EXISTS no_response_window_days INTEGER NOT NULL DEFAULT 14,
        ADD COLUMN IF NOT EXISTS no_response_rehabilitation_days INTEGER NOT NULL DEFAULT 30,
        ADD COLUMN IF NOT EXISTS level_1_threshold INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS level_2_threshold INTEGER NOT NULL DEFAULT 2,
        ADD COLUMN IF NOT EXISTS level_3_threshold INTEGER NOT NULL DEFAULT 3,
        ADD COLUMN IF NOT EXISTS inactivity_auto_off_days INTEGER NOT NULL DEFAULT 30,
        ADD COLUMN IF NOT EXISTS inactivity_reminder_days INTEGER NOT NULL DEFAULT 7,
        ADD COLUMN IF NOT EXISTS alpha_no_response NUMERIC(4,3) NOT NULL DEFAULT 0.250,
        ADD COLUMN IF NOT EXISTS change_reason TEXT;
    `);

    // v5.3 — Calificación por dimensión (CAD/CAM). Una reseña por caso+dentista+fase.
    await db.execute(sql`
      ALTER TABLE review
        ADD COLUMN IF NOT EXISTS dimension TEXT NOT NULL DEFAULT 'design';
      CREATE UNIQUE INDEX IF NOT EXISTS review_case_reviewer_dimension_uq
        ON review (clinical_case_id, reviewer_id, dimension);
    `);

    // v5.4 — Unifica los pesos del score (Σ6=1.0 con αB).
    // Normaliza filas cuyos 6 α no suman 1.0. Idempotente tras correr.
    await db.execute(sql`
      UPDATE fauchard_config
      SET alpha_quality = 0.200, alpha_punctuality = 0.150, alpha_experience = 0.150,
          alpha_load = 0.150, alpha_bonus = 0.100, alpha_no_response = 0.250
      WHERE ABS(
        COALESCE(alpha_quality,0) + COALESCE(alpha_punctuality,0) + COALESCE(alpha_experience,0)
        + COALESCE(alpha_load,0) + COALESCE(alpha_bonus,0) + COALESCE(alpha_no_response,0) - 1.0
      ) > 0.001;
    `);

    // v5.5 — Motor de ligas (Fase 2, detrás de LEAGUE_ENGINE_ENABLED).
    //   Columnas de estado del motor en user (las de gating league_level /
    //   league_transition_count ya existen) + tabla de auditoría de cambios de liga.
    //   DDL idempotente; sin backfill (league_level ya tiene default 'bronce').
    await db.execute(sql`
      ALTER TABLE "user"
        ADD COLUMN IF NOT EXISTS league_transition_started_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS league_demotion_watch_since TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS league_last_evaluated_at TIMESTAMPTZ;

      CREATE TABLE IF NOT EXISTS league_change_event (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        technician_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        from_league TEXT NOT NULL,
        to_league TEXT NOT NULL,
        kind TEXT NOT NULL,
        reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS lce_tech_created_idx ON league_change_event(technician_id, created_at);
      CREATE INDEX IF NOT EXISTS lce_kind_idx ON league_change_event(kind);
    `);

    // v5.7 — Campos de dirección en user.
    await db.execute(sql`
      ALTER TABLE "user"
        ADD COLUMN IF NOT EXISTS region TEXT,
        ADD COLUMN IF NOT EXISTS comuna TEXT,
        ADD COLUMN IF NOT EXISTS address TEXT,
        ADD COLUMN IF NOT EXISTS address_number TEXT,
        ADD COLUMN IF NOT EXISTS address_office TEXT;
    `);

    // v5.8 — Entrega deseada + precio de lista en clinical_case + mantenedor de precios.
    await db.execute(sql`
      ALTER TABLE clinical_case
        ADD COLUMN IF NOT EXISTS desired_delivery_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS list_price_rule_id UUID,
        ADD COLUMN IF NOT EXISTS list_price_cost NUMERIC(12,2),
        ADD COLUMN IF NOT EXISTS list_price_fee_percent NUMERIC(5,4),
        ADD COLUMN IF NOT EXISTS list_price_sale NUMERIC(12,2);

      CREATE TABLE IF NOT EXISTS price_rule (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        restoration_type_id UUID REFERENCES restoration_type(id) ON DELETE RESTRICT,
        material_id UUID REFERENCES dental_material(id) ON DELETE RESTRICT,
        shade_id UUID REFERENCES vita_shade(id) ON DELETE RESTRICT,
        urgency_id UUID REFERENCES urgency_level(id) ON DELETE RESTRICT,
        cost NUMERIC(12,2) NOT NULL,
        fee_percent NUMERIC(5,4) NOT NULL,
        sale_price NUMERIC(12,2) NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS price_rule_request (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        restoration_type_id UUID NOT NULL REFERENCES restoration_type(id) ON DELETE RESTRICT,
        material_id UUID NOT NULL REFERENCES dental_material(id) ON DELETE RESTRICT,
        shade_id UUID NOT NULL REFERENCES vita_shade(id) ON DELETE RESTRICT,
        urgency_id UUID NOT NULL REFERENCES urgency_level(id) ON DELETE RESTRICT,
        case_id UUID NOT NULL REFERENCES clinical_case(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        resolved_rule_id UUID REFERENCES price_rule(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS price_rule_request_pending_sig_uidx
        ON price_rule_request(restoration_type_id, material_id, shade_id, urgency_id, status);

      CREATE UNIQUE INDEX IF NOT EXISTS price_rule_active_sig_uidx
        ON price_rule(
          COALESCE(restoration_type_id, '00000000-0000-0000-0000-000000000000'::uuid),
          COALESCE(material_id, '00000000-0000-0000-0000-000000000000'::uuid),
          COALESCE(shade_id, '00000000-0000-0000-0000-000000000000'::uuid),
          COALESCE(urgency_id, '00000000-0000-0000-0000-000000000000'::uuid)
        )
        WHERE is_active = TRUE;
    `);

    // 7) Backfill de disponibilidad — SOLO si el modelo está habilitado.
    //    Evita correr el INSERT masivo en cada deploy con el feature apagado.
    //    Inferencia CAD/CAM desde technician_skill; categorías todo ON; caso
    //    degenerado (sin skills) → global ON, CAD/CAM OFF.
    if (process.env.AVAILABILITY_MODEL_ENABLED === 'true') {
      await db.execute(sql`
        INSERT INTO technician_availability (user_id, level_global, level_cad, level_cam)
        SELECT
          u.id,
          TRUE,
          EXISTS (SELECT 1 FROM technician_skill ts WHERE ts.user_id = u.id AND ts.design_level > 0),
          EXISTS (SELECT 1 FROM technician_skill ts WHERE ts.user_id = u.id AND ts.fabrication_level > 0)
        FROM "user" u
        WHERE u.role = 'tecnico'
        ON CONFLICT (user_id) DO NOTHING;
      `);
      console.log("[DB] v5.0 backfill de technician_availability ejecutado (flag ON).");
    }

    // v5.9 — Asignación directa: case_invitation → case_assignment + columnas renombradas
    await migrateCaseInvitationToAssignment(db);
    await db.execute(sql`
      ALTER TABLE fauchard_config
        ADD COLUMN IF NOT EXISTS max_assignment_attempts INTEGER NOT NULL DEFAULT 3;
    `);

    // v5.10 — Auditoría de cambios en reglas de precio de lista
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS price_rule_change_event (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        rule_id UUID REFERENCES price_rule(id) ON DELETE SET NULL,
        changed_by TEXT NOT NULL REFERENCES "user"(id),
        action TEXT NOT NULL,
        field_key TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        change_reason TEXT NOT NULL,
        context JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS prce_rule_created_idx
        ON price_rule_change_event(rule_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS prce_changed_by_idx
        ON price_rule_change_event(changed_by);
      CREATE INDEX IF NOT EXISTS prce_action_idx
        ON price_rule_change_event(action);
    `);

    // v5.11 — Código opaco por regla de precio (prc_NNN)
    await migratePriceRuleCode(db);

    // v5.13 — Taxonomía worktypes expandida: pónticos, derived_*, 7 categorías disponibilidad
    await db.execute(sql`
      ALTER TABLE clinical_case
        ADD COLUMN IF NOT EXISTS replaces_missing_teeth BOOLEAN DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS derived_work_type TEXT,
        ADD COLUMN IF NOT EXISTS derived_category TEXT;
    `);
    await db.execute(sql`
      ALTER TABLE technician_availability
        ADD COLUMN IF NOT EXISTS cat_carillas_cad BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS cat_carillas_cam BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS cat_full_arch_cad BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS cat_full_arch_cam BOOLEAN NOT NULL DEFAULT TRUE;
    `);
    // Backfill: carillas ← inlays; full_arch ← puentes (idempotente)
    await db.execute(sql`
      UPDATE technician_availability
      SET
        cat_carillas_cad = cat_inlays_cad,
        cat_carillas_cam = cat_inlays_cam,
        cat_full_arch_cad = cat_puentes_cad,
        cat_full_arch_cam = cat_puentes_cam
      WHERE cat_carillas_cad IS TRUE AND cat_carillas_cad = cat_inlays_cad;
    `);
    await db.execute(sql`
      UPDATE technician_availability
      SET
        cat_carillas_cad = cat_inlays_cad,
        cat_carillas_cam = cat_inlays_cam
      WHERE cat_carillas_cad IS DISTINCT FROM cat_inlays_cad
         OR cat_carillas_cam IS DISTINCT FROM cat_inlays_cam;
    `);
    await db.execute(sql`
      UPDATE technician_availability
      SET
        cat_full_arch_cad = cat_puentes_cad,
        cat_full_arch_cam = cat_puentes_cam
      WHERE cat_full_arch_cad IS DISTINCT FROM cat_puentes_cad
         OR cat_full_arch_cam IS DISTINCT FROM cat_puentes_cam;
    `);
    console.log('[DB] v5.13 taxonomía worktypes: columnas clinical_case + technician_availability.');

    // v5.15 — Restaura αB en config activa: Σ6=1.0 (corrige estado post-v5.14).
    await db.execute(sql`
      UPDATE fauchard_config
      SET alpha_quality = 0.200, alpha_punctuality = 0.150, alpha_experience = 0.150,
          alpha_load = 0.150, alpha_bonus = 0.100, alpha_no_response = 0.250
      WHERE ABS(
        COALESCE(alpha_quality,0) + COALESCE(alpha_punctuality,0) + COALESCE(alpha_experience,0)
        + COALESCE(alpha_load,0) + COALESCE(alpha_bonus,0) + COALESCE(alpha_no_response,0) - 1.0
      ) > 0.001
         OR COALESCE(alpha_bonus, 0) < 0.001;
    `);
    console.log('[DB] v5.15 pesos α: Σ6=1.0 con alpha_bonus=0.100 en fauchard_config.');

    // v5.17 — Limpieza legacy: retira calendario laboral (v4.6) y desglose de cotización
    // integral (v3). La app v2 (asignación directa) no usa ninguno. DROP idempotente.
    await db.execute(sql`
      ALTER TABLE fauchard_config
        DROP COLUMN IF EXISTS business_hours_start,
        DROP COLUMN IF EXISTS business_hours_end,
        DROP COLUMN IF EXISTS business_days_mask;
      ALTER TABLE case_assignment
        DROP COLUMN IF EXISTS quoted_design_price,
        DROP COLUMN IF EXISTS quoted_design_days,
        DROP COLUMN IF EXISTS quoted_fabrication_price,
        DROP COLUMN IF EXISTS quoted_fabrication_days;
      DROP TABLE IF EXISTS fauchard_holiday CASCADE;
    `);
    console.log('[DB] v5.17 limpieza legacy: business_*, quoted_design/fabrication_*, fauchard_holiday.');

    // v5.18 — Visor 3D de revisión: delivery_id en annotation
    await db.execute(sql`
      ALTER TABLE annotation
        ADD COLUMN IF NOT EXISTS delivery_id UUID
        REFERENCES clinical_case_delivery(id) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS annotation_delivery_id_idx ON annotation(delivery_id);
    `);
    console.log('[DB] v5.18 annotation.delivery_id + índice.');

    globalForInfra.infrastructureChecked = INFRA_VERSION;
    console.log("[DB] Infraestructura verificada con éxito.");
  } catch (e) {
    console.error("[Infrastructure] Critical Error during DB sync:", e);
  }
}
