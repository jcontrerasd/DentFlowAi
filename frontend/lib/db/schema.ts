import { pgTable, text, timestamp, uuid, integer, doublePrecision, boolean, jsonb, index, uniqueIndex, primaryKey, numeric, date } from "drizzle-orm/pg-core";
import { sql, relations } from "drizzle-orm";

export const organization = pgTable("organization", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	name: text().notNull(),
	rut: text().notNull(),
  type: text().notNull().default('clinica'),
  logoUrl: text("logo_url"),
  isActive: boolean("is_active").default(true).notNull(),
  address: jsonb(),
  phone: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  billingEmail: text("billing_email"),
  giro: text(),
  legalAddress: text("legal_address"),
  technicalCapabilities: jsonb("technical_capabilities"),
}, (table) => [
  uniqueIndex("organization_rut_uidx").on(table.rut),
]);

export const user = pgTable("user", {
	id: text().primaryKey().notNull(),
	organizationId: uuid("organization_id").references(() => organization.id, { onDelete: 'cascade' }),
	email: text().notNull(),
	fullName: text("full_name"),
	hashedPassword: text("hashed_password"),
	isActive: boolean("is_active").default(true).notNull(),
	role: text().notNull(),
	onboardingStep: integer("onboarding_step").default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	bio: text(),
	experienceYears: integer("experience_years"),
	phone: text(),
	registrationNumber: text("registration_number"),
	specialty: text(),
	subRoles: jsonb("sub_roles"),
  image: text(),
  emailVerified: timestamp("email_verified", { withTimezone: true, mode: 'date' }),
  // S0-06: Nuevos campos para el sistema orquestado
  isAvailable: boolean("is_available").default(true).notNull(),
  leagueLevel: text("league_level").default('bronce'),
  leagueTransitionCount: integer("league_transition_count").default(0),
  lastInvitedAt: timestamp("last_invited_at", { withTimezone: true, mode: 'date' }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: 'date' }),
  suspendedUntil: timestamp("suspended_until", { withTimezone: true, mode: 'date' }),
  consecutiveNoResponse: integer("consecutive_no_response").default(0),
  themePreference: text("theme_preference").default('system').notNull(),
}, (table) => [
  uniqueIndex("user_email_uidx").on(table.email),
  index("user_organizationId_idx").on(table.organizationId),
]);

export const clinicalCase = pgTable("clinical_case", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	organizationId: uuid("organization_id").notNull().references(() => organization.id, { onDelete: 'cascade' }),
	doctorId: text("doctor_id").references(() => user.id, { onDelete: 'set null' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	internalName: text("internal_name").notNull(),
	needsFabrication: boolean("needs_fabrication").notNull(),
	notesEsthetic: text("notes_esthetic"),
	notesOclusal: text("notes_oclusal"),
	patientIdAnon: text("patient_id_anon"),
	status: text().notNull(),
	teeth: jsonb(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	// FKs a catálogos UI (v3.8). Reemplazan las columnas text antiguas.
	materialId: uuid("material_id"),
	restorationTypeId: uuid("restoration_type_id"),
	shadeId: uuid("shade_id"),
	urgencyId: uuid("urgency_id").notNull(),
	assignedTechnicianId: text("assigned_technician_id").references(() => user.id, { onDelete: 'set null' }),
	assignedAt: timestamp("assigned_at", { withTimezone: true, mode: 'date' }),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'date' }),
	publishedAt: timestamp("published_at", { withTimezone: true, mode: 'date' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'date' }),
	lastActivityAt: timestamp("last_activity_at", { withTimezone: true, mode: 'date' }).defaultNow(),
	currentResponsibility: text("current_responsibility").default('dentista'),
	doctorNotes: text("doctor_notes"),
	/** Instrucciones especiales del solicitante al crear/editar el caso; no se sobrescriben con comentarios de revisión. */
	specialInstructions: text("special_instructions"),
	labNotes: text("lab_notes"),
	pendingActionRequest: text("pending_action_request"),
	pendingActionActor: text("pending_action_actor"),
	caseNumber: text("case_number"),
	commercialVersion: integer("commercial_version").default(1).notNull(),
	changeSummary: text("change_summary"),
	isArchived: boolean("is_archived").default(false).notNull(),
	canBeDeleted: boolean("can_be_deleted").default(true).notNull(),
	dispatchInfo: jsonb("dispatch_info").default({ courier: '', trackingId: '', status: 'pending', photos: [] }),
  // S0-05: Nuevos campos para el sistema orquestado
  proposedPrice: doublePrecision("proposed_price"),
  proposedDeliveryDays: integer("proposed_delivery_days"),
  /**
   * Flete pactado al aceptar la oferta (v4.4). El dentista lo paga 1:1 sin fee.
   * `proposedPrice` ya incluye el flete: proposedPrice = (design+fab)*(1+fee) + shipping.
   */
  proposedShippingPrice: doublePrecision("proposed_shipping_price"),
  proposedShippingDays: integer("proposed_shipping_days"),
  /**
   * Desglose diseño/fabricación pactado (v4.5). Persistido al aceptar la oferta
   * cuando la cotización es `split` (integral). Nullable para flat y casos legacy.
   */
  proposedDesignPrice: doublePrecision("proposed_design_price"),
  proposedDesignDays: integer("proposed_design_days"),
  proposedFabricationPrice: doublePrecision("proposed_fabrication_price"),
  proposedFabricationDays: integer("proposed_fabrication_days"),
  /**
   * v4.6 — plazos en horas (1–24 h). Si un *_hours está poblado, ese slot es en horas;
   * si no, está en días (vía *_days). Mutuamente excluyentes por slot.
   */
  proposedDeliveryHours: integer("proposed_delivery_hours"),
  proposedDesignHours: integer("proposed_design_hours"),
  proposedFabricationHours: integer("proposed_fabrication_hours"),
  proposedShippingHours: integer("proposed_shipping_hours"),
  proposalExpiresAt: timestamp("proposal_expires_at", { withTimezone: true, mode: 'date' }),
  platformFee: numeric("platform_fee", { precision: 5, scale: 4 }),
  internalStatus: text("internal_status"),
  caseComplexity: text("case_complexity"),
  serviceType: text("service_type"),
  caseLeague: text("case_league").default('bronce').notNull(),
  dentistRejectionReason: text("dentist_rejection_reason"),
  workStartedAt: timestamp("work_started_at", { withTimezone: true, mode: 'date' }),
  workDeadline: timestamp("work_deadline", { withTimezone: true, mode: 'date' }),
  /** Fila de fauchard_config congelada al publicar/republicar (copy-on-write en admin). */
  fauchardConfigId: uuid("fauchard_config_id").references(() => fauchardConfig.id, { onDelete: 'set null' }),
  /** Caso origen si este registro es copia (Crear copia desde terminal). */
  copiedFromCaseId: uuid("copied_from_case_id"),
}, (table) => [
	uniqueIndex("clinical_case_case_number_uidx").on(table.caseNumber),
	index("clinical_case_assignedTechnicianId_idx").on(table.assignedTechnicianId),
	index("clinical_case_organizationId_idx").on(table.organizationId),
	index("clinical_case_fauchardConfigId_idx").on(table.fauchardConfigId),
]);

/** Archivo operativo por usuario (no modifica status del caso). */
export const caseUserArchive = pgTable("case_user_archive", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  clinicalCaseId: uuid("clinical_case_id").notNull().references(() => clinicalCase.id, { onDelete: 'cascade' }),
  archivedAt: timestamp("archived_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.clinicalCaseId] }),
  index("case_user_archive_user_idx").on(table.userId),
  index("case_user_archive_case_idx").on(table.clinicalCaseId),
]);

export const clinicalCaseDelivery = pgTable("clinical_case_delivery", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  clinicalCaseId: uuid("clinical_case_id").notNull().references(() => clinicalCase.id, { onDelete: 'cascade' }),
  technicianId: text("technician_id").notNull().references(() => user.id),
  version: integer("version").notNull(),
  notes: text("notes"),
  files: jsonb("files").$type<string[]>().default([]),
  status: text("status").default('pending').notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'date' }),
  reviewComment: text("review_comment"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

export const commercialRound = pgTable("commercial_round", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	clinicalCaseId: uuid("clinical_case_id").notNull().references(() => clinicalCase.id, { onDelete: 'cascade' }),
	version: integer().notNull().default(1),
	status: text().default('active').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  roundNumber: integer("round_number").notNull(),
	specsSnapshot: jsonb("specs_snapshot"),
  startDate: timestamp("start_date", { withTimezone: true, mode: 'date' }).defaultNow(),
  endDate: timestamp("end_date", { withTimezone: true, mode: 'date' }),
  versionAtStart: integer("version_at_start"),
}, (table) => [
  index("commercial_round_clinicalCaseId_idx").on(table.clinicalCaseId),
]);

export const review = pgTable("review", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  clinicalCaseId: uuid("clinical_case_id").notNull().references(() => clinicalCase.id, { onDelete: 'cascade' }),
  reviewerId: text("reviewer_id").notNull().references(() => user.id),
  revieweeId: text("reviewee_id").notNull().references(() => user.id),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

export const bid = pgTable("bid", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	clinicalCaseId: uuid("clinical_case_id").notNull().references(() => clinicalCase.id, { onDelete: 'cascade' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	deliveryDays: integer("delivery_days").notNull(),
	deliveryType: text("delivery_type").default('days').notNull(),
	notes: text(),
	price: doublePrecision().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	technicianId: text("technician_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
	status: text("status").default('pending').notNull(),
	rejectionReason: text("rejection_reason"),
	roundId: uuid("round_id").references(() => commercialRound.id, { onDelete: 'set null' }),
}, (table) => [
  index("bid_clinicalCaseId_idx").on(table.clinicalCaseId),
  index("bid_technicianId_idx").on(table.technicianId),
]);

export const file = pgTable("file", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	clinicalCaseId: uuid("clinical_case_id").references(() => clinicalCase.id, { onDelete: 'set null' }),
	organizationId: uuid("organization_id").notNull().references(() => organization.id, { onDelete: 'cascade' }),
	category: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	filename: text().notNull(),
	gcsPath: text("gcs_path"),
	mimeType: text("mime_type"),
	size: integer(),
	subType: text("sub_type"),
	uploaderId: text("uploader_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
	thumbnailPath: text("thumbnail_path"),
}, (table) => [
  index("file_clinicalCaseId_idx").on(table.clinicalCaseId),
  index("file_organizationId_idx").on(table.organizationId),
]);

export const annotation = pgTable("annotation", {
	id: uuid("id").default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	clinicalCaseId: uuid("clinical_case_id").notNull().references(() => clinicalCase.id, { onDelete: 'cascade' }),
	coordinates: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	isResolved: boolean("is_resolved").notNull(),
	text: text().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	versionNum: integer("version_num"),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
}, (table) => [
  index("annotation_clinicalCaseId_idx").on(table.clinicalCaseId),
]);

export const clinicalCaseEvent = pgTable("clinical_case_event", {
  id: uuid().default(sql`gen_random_uuid()`).primaryKey().notNull(),
  clinicalCaseId: uuid("clinical_case_id").notNull().references(() => clinicalCase.id, { onDelete: 'cascade' }),
  userId: text("user_id").notNull().references(() => user.id),
  type: text("type").notNull(),
  action: text("action").notNull(),
  content: text("content"),
  payload: jsonb("payload").default({}),
  stateChange: jsonb("state_change").default({}),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index("clinical_case_event_case_created_idx").on(table.clinicalCaseId, table.createdAt),
]);

/** Marca de última lectura del UCH (Centro de control) por usuario y caso — cursores técnico / negociación. */
export const clinicalCaseHubRead = pgTable("clinical_case_hub_read", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey().notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  clinicalCaseId: uuid("clinical_case_id").notNull().references(() => clinicalCase.id, { onDelete: "cascade" }),
  lastReadTechHubAt: timestamp("last_read_tech_hub_at", { withTimezone: true, mode: "date" }),
  lastReadNegHubAt: timestamp("last_read_neg_hub_at", { withTimezone: true, mode: "date" }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("clinical_case_hub_read_user_case_uidx").on(table.userId, table.clinicalCaseId),
  index("clinical_case_hub_read_user_idx").on(table.userId),
  index("clinical_case_hub_read_case_idx").on(table.clinicalCaseId),
]);

// ─── Nuevas tablas del sistema orquestado (Sprint 0) ──────────────────────────

// S0-01: Habilidades declaradas por técnico (reemplaza technicalCapabilities en organization)
export const technicianSkill = pgTable("technician_skill", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  workType: text("work_type").notNull(),
  designLevel: integer("design_level").default(0).notNull(),
  fabricationLevel: integer("fabrication_level").default(0).notNull(),
  effectiveDesignLevel: integer("effective_design_level"),
  effectiveFabricationLevel: integer("effective_fabrication_level"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("ts_user_work_type_uidx").on(table.userId, table.workType),
  index("ts_user_id_idx").on(table.userId),
]);

// S0-02: Parámetros de Fauchard (fila única activa)
export const fauchardConfig = pgTable("fauchard_config", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  version: integer("version").notNull().default(1),
  // Pesos del score (α₁–α₅, deben sumar 1.0)
  alphaQuality: numeric("alpha_quality", { precision: 4, scale: 3 }).default('0.250').notNull(),
  alphaPunctuality: numeric("alpha_punctuality", { precision: 4, scale: 3 }).default('0.200').notNull(),
  alphaExperience: numeric("alpha_experience", { precision: 4, scale: 3 }).default('0.200').notNull(),
  alphaLoad: numeric("alpha_load", { precision: 4, scale: 3 }).default('0.200').notNull(),
  alphaBonus: numeric("alpha_bonus", { precision: 4, scale: 3 }).default('0.150').notNull(),
  // Ventanas temporales
  wQualityDays: integer("w_quality_days").default(90).notNull(),
  wLoadDays: integer("w_load_days").default(30).notNull(),
  cMax: numeric("c_max", { precision: 3, scale: 1 }).default('2.0').notNull(),
  dBonusMaxDays: integer("d_bonus_max_days").default(30).notNull(),
  // Filtros de exclusión
  tCooldownMinutes: integer("t_cooldown_minutes").default(720).notNull(),
  dInactivityDays: integer("d_inactivity_days").default(15).notNull(),
  // Selección
  nInvited: integer("n_invited").default(5).notNull(),
  nFloor: integer("n_floor").default(3).notNull(),
  qMinSelection: numeric("q_min_selection", { precision: 3, scale: 2 }).default('0.60').notNull(),
  // Cotización y propuesta
  tQuoteMinutes: integer("t_quote_minutes").default(30).notNull(),
  tProposalHours: integer("t_proposal_hours").default(2).notNull(),
  // v4.6 — Calendario laboral (usado para calcular workDeadline)
  businessHoursStart: integer("business_hours_start").default(8).notNull(),
  businessHoursEnd: integer("business_hours_end").default(20).notNull(),
  // Bitmask de días laborables: bit 0=Lun, 1=Mar, 2=Mié, 3=Jue, 4=Vie, 5=Sáb, 6=Dom.
  // Default 31 (0b0011111) = Lunes a Viernes.
  businessDaysMask: integer("business_days_mask").default(31).notNull(),
  // Fee de plataforma (15% = 0.1500)
  platformFee: numeric("platform_fee", { precision: 5, scale: 4 }).default('0.1500').notNull(),
  // Categoría — ascenso
  lMinRating: numeric("l_min_rating", { precision: 3, scale: 2 }).default('4.20').notNull(),
  lCasesEvaluated: integer("l_cases_evaluated").default(10).notNull(),
  lMinPunctuality: numeric("l_min_punctuality", { precision: 3, scale: 2 }).default('0.85').notNull(),
  lCasesCompleted: integer("l_cases_completed").default(15).notNull(),
  lCasesTransition: integer("l_cases_transition").default(3).notNull(),
  lPenaltyTransition: numeric("l_penalty_transition", { precision: 3, scale: 2 }).default('0.20').notNull(),
  // Categoría — descenso
  lDescentRating: numeric("l_descent_rating", { precision: 3, scale: 2 }).default('3.00').notNull(),
  lDescentDays: integer("l_descent_days").default(60).notNull(),
  // Metadatos
  isActive: boolean("is_active").default(true).notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

// S0-03: Log inmutable de cambios de parámetros de Fauchard
export const fauchardConfigLog = pgTable("fauchard_config_log", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  configId: uuid("config_id").notNull().references(() => fauchardConfig.id),
  changedBy: text("changed_by").notNull().references(() => user.id),
  parameterKey: text("parameter_key").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedAt: timestamp("changed_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index("acl_config_idx").on(table.configId),
  index("acl_changed_by_idx").on(table.changedBy),
]);

// v4.6 — Feriados administrables (lista global, no por config)
export const fauchardHoliday = pgTable("fauchard_holiday", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  holidayDate: date("holiday_date").notNull(),
  label: text("label").notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("fauchard_holiday_date_uidx").on(table.holidayDate),
]);

// S0-04: Invitaciones de cotización (reemplaza bid — interna, invisible al dentista)
export const caseInvitation = pgTable("case_invitation", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  clinicalCaseId: uuid("clinical_case_id").notNull().references(() => clinicalCase.id, { onDelete: 'cascade' }),
  technicianId: text("technician_id").notNull().references(() => user.id),
  // pending | quoted | accepted | confirmed | rejected | expired | withdrawn
  status: text("status").notNull().default('pending'),
  invitedAt: timestamp("invited_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'date' }),
  quotedPrice: doublePrecision("quoted_price"),
  quotedDays: integer("quoted_days"),
  /**
   * Desglose obligatorio para casos integrales (diseño + fabricación).
   * Para solo_diseno y solo_fabricacion los cuatro campos quedan null y el total
   * vive solo en quotedPrice / quotedDays. quotedPrice y quotedDays siguen siendo
   * los valores canónicos (suma) para ordenamiento, comparativo y reporting.
   */
  quotedDesignPrice: doublePrecision("quoted_design_price"),
  quotedDesignDays: integer("quoted_design_days"),
  quotedFabricationPrice: doublePrecision("quoted_fabrication_price"),
  quotedFabricationDays: integer("quoted_fabrication_days"),
  /**
   * Flete (v4.4): costo y días del traslado físico hasta el dentista.
   * Aplica solo a casos con fabricación (integral o solo_fabricacion).
   * El fee de plataforma NO aplica sobre el flete; se traslada 1:1 al dentista.
   * En solo_diseno ambos campos quedan null.
   */
  quotedShippingPrice: doublePrecision("quoted_shipping_price"),
  quotedShippingDays: integer("quoted_shipping_days"),
  /**
   * v4.6 — plazos en horas (1–24 h) por slot. Si el *_hours está poblado el slot es
   * en horas; si no, en días. Mutuamente excluyente con *_days slot a slot.
   */
  quotedHours: integer("quoted_hours"),
  quotedDesignHours: integer("quoted_design_hours"),
  quotedFabricationHours: integer("quoted_fabrication_hours"),
  quotedShippingHours: integer("quoted_shipping_hours"),
  techNotes: text("tech_notes"),
  respondedAt: timestamp("responded_at", { withTimezone: true, mode: 'date' }),
  scoreAtInvite: numeric("score_at_invite", { precision: 6, scale: 4 }),
  workType: text("work_type"),
  /** Feedback obligatorio cuando el dentista rechaza esa oferta en el comparativo */
  dentistRejectionFeedback: text("dentist_rejection_feedback"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index("ci_case_idx").on(table.clinicalCaseId),
  index("ci_tech_idx").on(table.technicianId),
  index("ci_status_idx").on(table.status),
]);

// Audit log de acciones del sistema (descargas, accesos sensibles)
export const auditLog = pgTable("audit_log", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  organizationId: uuid("organization_id").references(() => organization.id, { onDelete: 'set null' }),
  userId: text("user_id").references(() => user.id, { onDelete: 'set null' }),
  action: text("action").notNull(),
  payload: jsonb("payload").default({}),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index("al_org_idx").on(table.organizationId),
  index("al_user_idx").on(table.userId),
  index("al_action_idx").on(table.action),
]);

// NextAuth Tables
export const accounts = pgTable(
  "accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    {
      compoundKey: primaryKey({
        columns: [account.provider, account.providerAccountId],
      }),
    }
  ]
)

export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
})

export const verificationToken = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [
    {
      compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
    }
  ]
)

// RELATIONS
export const clinicalCaseRelations = relations(clinicalCase, ({ one, many }) => ({
  organization: one(organization, {
    fields: [clinicalCase.organizationId],
    references: [organization.id],
  }),
  doctor: one(user, {
    fields: [clinicalCase.doctorId],
    references: [user.id],
  }),
  technician: one(user, {
    fields: [clinicalCase.assignedTechnicianId],
    references: [user.id],
  }),
  fauchardConfigPinned: one(fauchardConfig, {
    fields: [clinicalCase.fauchardConfigId],
    references: [fauchardConfig.id],
  }),
  material: one(dentalMaterial, {
    fields: [clinicalCase.materialId],
    references: [dentalMaterial.id],
  }),
  restoration: one(restorationType, {
    fields: [clinicalCase.restorationTypeId],
    references: [restorationType.id],
  }),
  shade: one(vitaShade, {
    fields: [clinicalCase.shadeId],
    references: [vitaShade.id],
  }),
  urgencyLevel: one(urgencyLevel, {
    fields: [clinicalCase.urgencyId],
    references: [urgencyLevel.id],
  }),
  files: many(file),
  annotations: many(annotation),
  bids: many(bid),
  rounds: many(commercialRound),
  deliveries: many(clinicalCaseDelivery),
  events: many(clinicalCaseEvent),
  invitations: many(caseInvitation),
  userArchives: many(caseUserArchive),
  copiedFromCase: one(clinicalCase, {
    fields: [clinicalCase.copiedFromCaseId],
    references: [clinicalCase.id],
    relationName: 'caseCopyLineage',
  }),
}));

export const caseUserArchiveRelations = relations(caseUserArchive, ({ one }) => ({
  user: one(user, {
    fields: [caseUserArchive.userId],
    references: [user.id],
  }),
  clinicalCase: one(clinicalCase, {
    fields: [caseUserArchive.clinicalCaseId],
    references: [clinicalCase.id],
  }),
}));

export const userRelations = relations(user, ({ one, many }) => ({
  organization: one(organization, {
    fields: [user.organizationId],
    references: [organization.id],
  }),
  clinicalCases: many(clinicalCase),
  skills: many(technicianSkill),
  invitations: many(caseInvitation),
}));

export const fileRelations = relations(file, ({ one }) => ({
  clinicalCase: one(clinicalCase, {
    fields: [file.clinicalCaseId],
    references: [clinicalCase.id],
  }),
  uploader: one(user, {
    fields: [file.uploaderId],
    references: [user.id],
  }),
}));

export const annotationRelations = relations(annotation, ({ one }) => ({
  clinicalCase: one(clinicalCase, {
    fields: [annotation.clinicalCaseId],
    references: [clinicalCase.id],
  }),
  user: one(user, {
    fields: [annotation.userId],
    references: [user.id],
  }),
}));

export const bidRelations = relations(bid, ({ one }) => ({
  clinicalCase: one(clinicalCase, {
    fields: [bid.clinicalCaseId],
    references: [clinicalCase.id],
  }),
  technician: one(user, {
    fields: [bid.technicianId],
    references: [user.id],
  }),
  round: one(commercialRound, {
    fields: [bid.roundId],
    references: [commercialRound.id],
  }),
}));

export const commercialRoundRelations = relations(commercialRound, ({ one, many }) => ({
  clinicalCase: one(clinicalCase, {
    fields: [commercialRound.clinicalCaseId],
    references: [clinicalCase.id],
  }),
  bids: many(bid),
}));

export const clinicalCaseDeliveryRelations = relations(clinicalCaseDelivery, ({ one }) => ({
  clinicalCase: one(clinicalCase, {
    fields: [clinicalCaseDelivery.clinicalCaseId],
    references: [clinicalCase.id],
  }),
  technician: one(user, {
    fields: [clinicalCaseDelivery.technicianId],
    references: [user.id],
  }),
}));

export const clinicalCaseEventRelations = relations(clinicalCaseEvent, ({ one }) => ({
  clinicalCase: one(clinicalCase, {
    fields: [clinicalCaseEvent.clinicalCaseId],
    references: [clinicalCase.id],
  }),
  user: one(user, {
    fields: [clinicalCaseEvent.userId],
    references: [user.id],
  }),
}));

// Relaciones nuevas (Sprint 0)
export const technicianSkillRelations = relations(technicianSkill, ({ one }) => ({
  user: one(user, {
    fields: [technicianSkill.userId],
    references: [user.id],
  }),
}));

export const fauchardConfigLogRelations = relations(fauchardConfigLog, ({ one }) => ({
  config: one(fauchardConfig, {
    fields: [fauchardConfigLog.configId],
    references: [fauchardConfig.id],
  }),
  changedByUser: one(user, {
    fields: [fauchardConfigLog.changedBy],
    references: [user.id],
  }),
}));

// ─── Catálogos UI (listas desplegables administrables) ───────────────────────
// Estructura uniforme: code (persistido en clinical_case.* como text), label (UI),
// sortOrder, isActive. No hay FK desde clinical_case para permitir desactivar
// opciones sin romper casos históricos.

export const vitaShade = pgTable("vita_shade", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  code: text().notNull(),
  label: text().notNull(),
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("vita_shade_code_uidx").on(table.code),
]);

export const restorationType = pgTable("restoration_type", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  code: text().notNull(),
  label: text().notNull(),
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("restoration_type_code_uidx").on(table.code),
]);

export const dentalMaterial = pgTable("dental_material", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  code: text().notNull(),
  label: text().notNull(),
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("dental_material_code_uidx").on(table.code),
]);

export const urgencyLevel = pgTable("urgency_level", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  code: text().notNull(),
  label: text().notNull(),
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("urgency_level_code_uidx").on(table.code),
]);

// ─── ContactGuard (anti-desintermediación) ──────────────────────────────────
// Reglas configurables de detección de datos de contacto + auditoría de intentos.

export const contactGuardRule = pgTable("contact_guard_rule", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  type: text("type").notNull(), // 'regex' | 'keyword'
  name: text("name").notNull(),
  pattern: text("pattern").notNull(),
  flags: text("flags").default('i'),
  description: text("description"),
  severity: text("severity").default('block').notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  /** Campos a los que aplica la regla. null = todos. */
  appliesToFields: jsonb("applies_to_fields").$type<string[] | null>(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: 'set null' }),
}, (table) => [
  index("contact_guard_rule_active_idx").on(table.isActive),
  index("contact_guard_rule_type_idx").on(table.type),
]);

export const contactGuardCourierAllowlist = pgTable("contact_guard_courier_allowlist", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  domain: text("domain").notNull(),
  label: text("label"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("contact_guard_courier_domain_uidx").on(table.domain),
]);

export const contactGuardAudit = pgTable("contact_guard_audit", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  orgId: uuid("org_id").references(() => organization.id, { onDelete: 'set null' }),
  userRole: text("user_role"),
  clinicalCaseId: uuid("clinical_case_id").references(() => clinicalCase.id, { onDelete: 'set null' }),
  fieldName: text("field_name").notNull(),
  actionName: text("action_name").notNull(),
  originalText: text("original_text").notNull(),
  normalizedText: text("normalized_text").notNull(),
  violatedRules: jsonb("violated_rules").default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index("contact_guard_audit_user_created_idx").on(table.userId, table.createdAt),
  index("contact_guard_audit_case_idx").on(table.clinicalCaseId),
]);

export const caseInvitationRelations = relations(caseInvitation, ({ one }) => ({
  clinicalCase: one(clinicalCase, {
    fields: [caseInvitation.clinicalCaseId],
    references: [clinicalCase.id],
  }),
  technician: one(user, {
    fields: [caseInvitation.technicianId],
    references: [user.id],
  }),
}));
