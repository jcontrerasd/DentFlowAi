import { pgTable, text, timestamp, uuid, integer, doublePrecision, boolean, jsonb, index, uniqueIndex, primaryKey, numeric } from "drizzle-orm/pg-core";
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
	country: text(),
	region: text(),
	comuna: text(),
	address: text("address"),
	addressNumber: text("address_number"),
	addressOffice: text("address_office"),
	subRoles: jsonb("sub_roles"),
  image: text(),
  emailVerified: timestamp("email_verified", { withTimezone: true, mode: 'date' }),
  // S0-06: Nuevos campos para el sistema orquestado
  isAvailable: boolean("is_available").default(true).notNull(),
  leagueLevel: text("league_level").default('bronce'),
  leagueTransitionCount: integer("league_transition_count").default(0),
  // Motor de ligas Fase 2 (detrás de LEAGUE_ENGINE_ENABLED) — estado del motor automático.
  leagueTransitionStartedAt: timestamp("league_transition_started_at", { withTimezone: true, mode: 'date' }),
  leagueDemotionWatchSince: timestamp("league_demotion_watch_since", { withTimezone: true, mode: 'date' }),
  leagueLastEvaluatedAt: timestamp("league_last_evaluated_at", { withTimezone: true, mode: 'date' }),
  lastInvitedAt: timestamp("last_invited_at", { withTimezone: true, mode: 'date' }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: 'date' }),
  suspendedUntil: timestamp("suspended_until", { withTimezone: true, mode: 'date' }),
  consecutiveNoResponse: integer("consecutive_no_response").default(0),
  themePreference: text("theme_preference").default('system').notNull(),
  emailNotificationPrefs: jsonb("email_notification_prefs"),
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
  // v5.0 — Cola pendiente_pool (Fauchard sin elegibles) + countdown revisión dentista.
  pendingPoolCycleCount: integer("pending_pool_cycle_count").default(0).notNull(),
  pendingPoolStartedAt: timestamp("pending_pool_started_at", { withTimezone: true, mode: 'date' }),
  pendingPoolCheckinSentAt: timestamp("pending_pool_checkin_sent_at", { withTimezone: true, mode: 'date' }),
  /** Reinicia el countdown `tDentistReviewHours` en cada entrega del técnico (v5.0). */
  lastRevisionSubmittedAt: timestamp("last_revision_submitted_at", { withTimezone: true, mode: 'date' }),
  /** Idempotencia de la escalación del countdown de revisión (v5.2). Reset en cada entrega. */
  reviewReminderSentAt: timestamp("review_reminder_sent_at", { withTimezone: true, mode: 'date' }),
  reviewOverdueNotifiedAt: timestamp("review_overdue_notified_at", { withTimezone: true, mode: 'date' }),
  /** v5.8 — Fecha/hora de entrega deseada declarada por el dentista al crear el caso. */
  desiredDeliveryAt: timestamp("desired_delivery_at", { withTimezone: true, mode: 'date' }),
  /** v5.8 — Snapshot congelado del precio de lista al crear/editar borrador. */
  listPriceRuleId: uuid("list_price_rule_id"),
  listPriceCost: numeric("list_price_cost", { precision: 12, scale: 2 }),
  listPriceFeePercent: numeric("list_price_fee_percent", { precision: 5, scale: 4 }),
  listPriceSale: numeric("list_price_sale", { precision: 12, scale: 2 }),
  /** v5.13 — ¿El caso reemplaza dientes ausentes (pónticos)? NULL = legacy. */
  replacesMissingTeeth: boolean("replaces_missing_teeth"),
  /** v5.13 — workType y categoría derivados en classify/reclassify (auditoría UI). */
  derivedWorkType: text("derived_work_type"),
  derivedCategory: text("derived_category"),
  // v5.19 — Compuerta de Calidad (gated por QUALITY_GATE_ENABLED).
  /** Revisor de Calidad asignado actualmente al caso (round-robin / derivación). */
  qualityReviewerId: text("quality_reviewer_id").references(() => user.id, { onDelete: 'set null' }),
  qualityAssignedAt: timestamp("quality_assigned_at", { withTimezone: true, mode: 'date' }),
  /** Reinicia el countdown `tQualityReviewHours` en cada entrega del técnico a Calidad. */
  lastQualitySubmittedAt: timestamp("last_quality_submitted_at", { withTimezone: true, mode: 'date' }),
  /** Idempotencia de la escalación del SLA de Calidad. Reset en cada entrega a Calidad. */
  qualityReminderSentAt: timestamp("quality_reminder_sent_at", { withTimezone: true, mode: 'date' }),
  qualityOverdueNotifiedAt: timestamp("quality_overdue_notified_at", { withTimezone: true, mode: 'date' }),
}, (table) => [
	uniqueIndex("clinical_case_case_number_uidx").on(table.caseNumber),
	index("clinical_case_assignedTechnicianId_idx").on(table.assignedTechnicianId),
	index("clinical_case_organizationId_idx").on(table.organizationId),
	index("clinical_case_fauchardConfigId_idx").on(table.fauchardConfigId),
	index("clinical_case_qualityReviewerId_idx").on(table.qualityReviewerId),
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
  // v5.19 — Certificación de Calidad previa al envío al dentista.
  /** pending | certified | rejected — estado de la revisión de Calidad de esta entrega. */
  qualityStatus: text("quality_status").default('pending').notNull(),
  qualityComment: text("quality_comment"),
  qualityReviewedAt: timestamp("quality_reviewed_at", { withTimezone: true, mode: 'date' }),
  qualityReviewerId: text("quality_reviewer_id").references(() => user.id),
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
  /** Fase calificada: 'design' (CAD, dentista) | 'fabrication' (CAM) | 'quality' (revisor Calidad). v5.3/v5.19. */
  dimension: text("dimension").default('design').notNull(),
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
	deliveryId: uuid("delivery_id").references(() => clinicalCaseDelivery.id, { onDelete: 'cascade' }),
	coordinates: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	isResolved: boolean("is_resolved").notNull(),
	text: text().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
	versionNum: integer("version_num"),
	userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
}, (table) => [
  index("annotation_clinicalCaseId_idx").on(table.clinicalCaseId),
  index("annotation_delivery_id_idx").on(table.deliveryId),
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
  // Carga de referencia para normalizar el factor L (piso del divisor maxLoad). Configurable.
  loadReferenceMin: integer("load_reference_min").default(5).notNull(),
  // Filtros de exclusión
  tCooldownMinutes: integer("t_cooldown_minutes").default(720).notNull(),
  dInactivityDays: integer("d_inactivity_days").default(15).notNull(),
  // Selección — asignación directa (v5.9)
  maxAssignmentAttempts: integer("max_assignment_attempts").default(3).notNull(),
  // Legacy — mantener columnas hasta migración admin completa
  nInvited: integer("n_invited").default(5).notNull(),
  nFloor: integer("n_floor").default(3).notNull(),
  qMinSelection: numeric("q_min_selection", { precision: 3, scale: 2 }).default('0.60').notNull(),
  // Cotización y propuesta
  tQuoteMinutes: integer("t_quote_minutes").default(30).notNull(),
  tProposalHours: integer("t_proposal_hours").default(2).notNull(),
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
  // ─── v5.0 — Disponibilidad, sanción rolling, cola pool y revisión dentista ───
  // Plazos (wall-clock).
  tDentistReviewHours: integer("t_dentist_review_hours").default(48).notNull(),
  /** v5.19 — SLA de la revisión de Calidad (gated por QUALITY_GATE_ENABLED). */
  tQualityReviewHours: integer("t_quality_review_hours").default(24).notNull(),
  tNoEligiblePoolHours: integer("t_no_eligible_pool_hours").default(24).notNull(),
  maxPoolCycles: integer("max_pool_cycles").default(2).notNull(),
  replacementCutoffMinutes: integer("replacement_cutoff_minutes").default(10).notNull(),
  // Sanción por no-respuesta (días).
  noResponseWindowDays: integer("no_response_window_days").default(14).notNull(),
  noResponseRehabilitationDays: integer("no_response_rehabilitation_days").default(30).notNull(),
  // Umbrales de niveles (cantidad de no-respuestas en ventana).
  level1Threshold: integer("level_1_threshold").default(1).notNull(),
  level2Threshold: integer("level_2_threshold").default(2).notNull(),
  level3Threshold: integer("level_3_threshold").default(3).notNull(),
  // Heartbeat (días).
  inactivityAutoOffDays: integer("inactivity_auto_off_days").default(30).notNull(),
  inactivityReminderDays: integer("inactivity_reminder_days").default(7).notNull(),
  // Score — coeficiente del término −αN·N (re-normalización aplicada en Fase 2 con flag on).
  alphaNoResponse: numeric("alpha_no_response", { precision: 4, scale: 3 }).default('0.250').notNull(),
  // Auditoría: motivo del cambio (obligatorio en UI admin, nullable en BD para filas históricas).
  changeReason: text("change_reason"),
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

// Asignación directa Fauchard (1 técnico por intento; aceptar/rechazar, sin cotización)
export const caseAssignment = pgTable("case_assignment", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  clinicalCaseId: uuid("clinical_case_id").notNull().references(() => clinicalCase.id, { onDelete: 'cascade' }),
  technicianId: text("technician_id").notNull().references(() => user.id),
  /** pending | accepted | rejected | expired */
  status: text("status").notNull().default('pending'),
  assignedAt: timestamp("assigned_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'date' }),
  /** Compensación al técnico (listPriceCost). */
  compensation: doublePrecision("compensation"),
  deadlineDays: integer("deadline_days"),
  deadlineHours: integer("deadline_hours"),
  respondedAt: timestamp("responded_at", { withTimezone: true, mode: 'date' }),
  scoreAtAssignment: numeric("score_at_assignment", { precision: 6, scale: 4 }),
  workType: text("work_type"),
  rejectionReasonId: uuid("rejection_reason_id").references(() => invitationRejectionReason.id, { onDelete: 'restrict' }),
  rejectionComment: text("rejection_comment"),
  rejectedAt: timestamp("rejected_at", { withTimezone: true, mode: 'date' }),
  bulkRejectionReasonId: uuid("bulk_rejection_reason_id").references(() => bulkRejectionReason.id, { onDelete: 'restrict' }),
  bulkRejectionComment: text("bulk_rejection_comment"),
  isReassignment: boolean("is_reassignment").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index("ca_case_idx").on(table.clinicalCaseId),
  index("ca_tech_idx").on(table.technicianId),
  index("ca_status_idx").on(table.status),
]);

/** @deprecated */
export const caseInvitation = caseAssignment;

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

// Fase 3.5 (ajuste login) — recuperación de contraseña real. Tabla propia, separada de
// `verificationToken` (NextAuth) a propósito: mezclar "verificar email" con "resetear clave"
// en la misma tabla mezclaría dos flujos con garantías de seguridad distintas.
export const passwordResetToken = pgTable("password_reset_token", {
  token: text("token").primaryKey(),
  email: text("email").notNull(),
  expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

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
  assignments: many(caseAssignment),
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
  assignments: many(caseAssignment),
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

// ─── v5.8 — Mantenedor de precios de lista ───────────────────────────────────

/** Regla de precio con dimensiones opcionales (NULL = comodín). */
export const priceRule = pgTable("price_rule", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  code: text("code").notNull().unique(),
  restorationTypeId: uuid("restoration_type_id").references(() => restorationType.id, { onDelete: 'restrict' }),
  materialId: uuid("material_id").references(() => dentalMaterial.id, { onDelete: 'restrict' }),
  shadeId: uuid("shade_id").references(() => vitaShade.id, { onDelete: 'restrict' }),
  urgencyId: uuid("urgency_id").references(() => urgencyLevel.id, { onDelete: 'restrict' }),
  cost: numeric("cost", { precision: 12, scale: 2 }).notNull(),
  feePercent: numeric("fee_percent", { precision: 5, scale: 4 }).notNull(),
  salePrice: numeric("sale_price", { precision: 12, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

/** Auditoría inmutable de cambios en reglas de precio (v5.10). */
export const priceRuleChangeEvent = pgTable("price_rule_change_event", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  ruleId: uuid("rule_id").references(() => priceRule.id, { onDelete: 'set null' }),
  changedBy: text("changed_by").notNull().references(() => user.id),
  action: text("action").notNull(),
  fieldKey: text("field_key").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changeReason: text("change_reason").notNull(),
  context: jsonb("context").default({}),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index("prce_rule_created_idx").on(table.ruleId, table.createdAt),
  index("prce_changed_by_idx").on(table.changedBy),
  index("prce_action_idx").on(table.action),
]);

/** Cola de combinaciones sin precio (solicitadas al crear casos). */
export const priceRuleRequest = pgTable("price_rule_request", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  restorationTypeId: uuid("restoration_type_id").notNull().references(() => restorationType.id, { onDelete: 'restrict' }),
  materialId: uuid("material_id").notNull().references(() => dentalMaterial.id, { onDelete: 'restrict' }),
  shadeId: uuid("shade_id").notNull().references(() => vitaShade.id, { onDelete: 'restrict' }),
  urgencyId: uuid("urgency_id").notNull().references(() => urgencyLevel.id, { onDelete: 'restrict' }),
  caseId: uuid("case_id").notNull().references(() => clinicalCase.id, { onDelete: 'cascade' }),
  status: text().default('pending').notNull(),
  resolvedRuleId: uuid("resolved_rule_id").references(() => priceRule.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("price_rule_request_pending_sig_uidx").on(
    table.restorationTypeId,
    table.materialId,
    table.shadeId,
    table.urgencyId,
    table.status,
  ),
]);

// ─── v5.0 — Disponibilidad del técnico, sanción rolling y catálogos de rechazo ──

/**
 * Disponibilidad declarada del técnico (modelo aplanado, 1 fila por técnico).
 * Regla de elegibilidad AND triple: level_global ∧ level_<cap> ∧ cat_<categoria>_<cap>.
 * Las columnas hijas se preservan aunque el padre esté OFF (§1.5).
 */
export const technicianAvailability = pgTable("technician_availability", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  levelGlobal: boolean("level_global").default(true).notNull(),
  levelCad: boolean("level_cad").default(false).notNull(),
  levelCam: boolean("level_cam").default(false).notNull(),
  catCoronasCad: boolean("cat_coronas_cad").default(true).notNull(),
  catCoronasCam: boolean("cat_coronas_cam").default(true).notNull(),
  catInlaysCad: boolean("cat_inlays_cad").default(true).notNull(),
  catInlaysCam: boolean("cat_inlays_cam").default(true).notNull(),
  catPuentesCad: boolean("cat_puentes_cad").default(true).notNull(),
  catPuentesCam: boolean("cat_puentes_cam").default(true).notNull(),
  catProtesisCad: boolean("cat_protesis_cad").default(true).notNull(),
  catProtesisCam: boolean("cat_protesis_cam").default(true).notNull(),
  catGuiasCad: boolean("cat_guias_cad").default(true).notNull(),
  catGuiasCam: boolean("cat_guias_cam").default(true).notNull(),
  /** v5.13 — Carillas separadas de inlays (backfill desde cat_inlays_cad). */
  catCarillasCad: boolean("cat_carillas_cad").default(true).notNull(),
  catCarillasCam: boolean("cat_carillas_cam").default(true).notNull(),
  /** v5.13 — Full arch separado de puentes (backfill desde cat_puentes_cad). */
  catFullArchCad: boolean("cat_full_arch_cad").default(true).notNull(),
  catFullArchCam: boolean("cat_full_arch_cam").default(true).notNull(),
  inactivityReminderSentAt: timestamp("inactivity_reminder_sent_at", { withTimezone: true, mode: 'date' }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("technician_availability_user_uidx").on(table.userId),
]);

/**
 * Evento individual de no-respuesta (timeout sin cotizar ni rechazar).
 * Los timestamps alimentan la ventana rolling de `noResponseWindowDays` (§2.3).
 */
export const technicianNoResponseEvent = pgTable("technician_no_response_event", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  technicianUserId: text("technician_user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  caseAssignmentId: uuid("case_assignment_id").references(() => caseAssignment.id, { onDelete: 'set null' }),
  occurredAt: timestamp("occurred_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  // active | expired_window | pardoned
  status: text("status").default('active').notNull(),
  pardonedByUserId: text("pardoned_by_user_id").references(() => user.id, { onDelete: 'set null' }),
  pardonedAt: timestamp("pardoned_at", { withTimezone: true, mode: 'date' }),
  pardonReason: text("pardon_reason"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index("tnre_tech_occurred_idx").on(table.technicianUserId, table.occurredAt),
  index("tnre_status_idx").on(table.status),
]);

/** Catálogo de motivos de rechazo individual (§3.2). Code opaco `rej_NNN`. */
export const invitationRejectionReason = pgTable("invitation_rejection_reason", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  code: text().notNull(),
  label: text().notNull(),
  description: text(),
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("invitation_rejection_reason_code_uidx").on(table.code),
]);

/** Catálogo de motivos de rechazo masivo / auto-OFF (§3.1). Code opaco `brej_NNN`. */
export const bulkRejectionReason = pgTable("bulk_rejection_reason", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  code: text().notNull(),
  label: text().notNull(),
  description: text(),
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("bulk_rejection_reason_code_uidx").on(table.code),
]);

/** v5.19 — Catálogo de motivos de derivación entre revisores de Calidad. Code opaco `qdr_NNN`. */
export const qualityDerivationReason = pgTable("quality_derivation_reason", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  code: text().notNull(),
  label: text().notNull(),
  description: text(),
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("quality_derivation_reason_code_uidx").on(table.code),
]);

/**
 * v5.19 — Historial/auditoría del revisor de Calidad asignado a un caso y sus derivaciones.
 * El reviewer "actual" vive en `clinical_case.quality_reviewer_id`; esta tabla guarda la cadena.
 * status: active | derived | released.
 */
export const caseQualityAssignment = pgTable("case_quality_assignment", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  clinicalCaseId: uuid("clinical_case_id").notNull().references(() => clinicalCase.id, { onDelete: 'cascade' }),
  calidadUserId: text("calidad_user_id").notNull().references(() => user.id),
  status: text("status").default('active').notNull(),
  assignedAt: timestamp("assigned_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  derivedToId: text("derived_to_id").references(() => user.id, { onDelete: 'set null' }),
  derivationReasonId: uuid("derivation_reason_id").references(() => qualityDerivationReason.id),
  derivationComment: text("derivation_comment"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index("cqa_case_idx").on(table.clinicalCaseId),
  index("cqa_calidad_status_idx").on(table.calidadUserId, table.status),
]);

/**
 * Auditoría del motor de ligas (Fase 2, detrás de LEAGUE_ENGINE_ENABLED).
 * Una fila por cambio de categoría de un técnico — alimenta la observabilidad admin.
 */
export const leagueChangeEvent = pgTable("league_change_event", {
  id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
  technicianId: text("technician_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
  fromLeague: text("from_league").notNull(),
  toLeague: text("to_league").notNull(),
  // ascenso | transicion_consolidada | descenso
  kind: text("kind").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index("lce_tech_created_idx").on(table.technicianId, table.createdAt),
  index("lce_kind_idx").on(table.kind),
]);

export const technicianAvailabilityRelations = relations(technicianAvailability, ({ one }) => ({
  user: one(user, {
    fields: [technicianAvailability.userId],
    references: [user.id],
  }),
}));

export const leagueChangeEventRelations = relations(leagueChangeEvent, ({ one }) => ({
  technician: one(user, {
    fields: [leagueChangeEvent.technicianId],
    references: [user.id],
  }),
}));

export const technicianNoResponseEventRelations = relations(technicianNoResponseEvent, ({ one }) => ({
  technician: one(user, {
    fields: [technicianNoResponseEvent.technicianUserId],
    references: [user.id],
    relationName: 'noResponseTechnician',
  }),
  assignment: one(caseAssignment, {
    fields: [technicianNoResponseEvent.caseAssignmentId],
    references: [caseAssignment.id],
  }),
  pardonedBy: one(user, {
    fields: [technicianNoResponseEvent.pardonedByUserId],
    references: [user.id],
    relationName: 'noResponsePardonedBy',
  }),
}));

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

export const caseAssignmentRelations = relations(caseAssignment, ({ one }) => ({
  clinicalCase: one(clinicalCase, {
    fields: [caseAssignment.clinicalCaseId],
    references: [clinicalCase.id],
  }),
  technician: one(user, {
    fields: [caseAssignment.technicianId],
    references: [user.id],
  }),
}));

/** @deprecated */
export const caseInvitationRelations = caseAssignmentRelations;
