-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "annotation" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"clinical_case_id" uuid NOT NULL,
	"coordinates" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"is_resolved" boolean NOT NULL,
	"text" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"version_num" integer,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinical_case" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"internal_name" text NOT NULL,
	"material" text,
	"needs_fabrication" boolean NOT NULL,
	"notes_esthetic" text,
	"notes_oclusal" text,
	"patient_id_anon" text,
	"restoration_type" text,
	"shade" text,
	"status" text NOT NULL,
	"teeth" jsonb,
	"updated_at" timestamp with time zone NOT NULL,
	"urgency" text NOT NULL,
	"assigned_technician_id" text,
	"assigned_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"doctor_notes" text,
	"lab_notes" text
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"address" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"is_active" boolean NOT NULL,
	"logo_url" text,
	"name" text NOT NULL,
	"phone" text,
	"rut" text,
	"type" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"billing_email" text,
	"giro" text,
	"legal_address" text
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"organization_id" uuid NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"payload" jsonb,
	"updated_at" timestamp with time zone NOT NULL,
	"user_id" text
);
--> statement-breakpoint
CREATE TABLE "bid" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"clinical_case_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"delivery_days" integer NOT NULL,
	"notes" text,
	"price" double precision NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"technician_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"hashed_password" text,
	"is_active" boolean NOT NULL,
	"role" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"bio" text,
	"experience_years" integer,
	"onboarding_step" integer,
	"phone" text,
	"registration_number" text,
	"specialty" text,
	"sub_roles" jsonb
);
--> statement-breakpoint
CREATE TABLE "file" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"clinical_case_id" uuid,
	"organization_id" uuid NOT NULL,
	"category" text,
	"created_at" timestamp with time zone NOT NULL,
	"filename" text NOT NULL,
	"gcs_path" text,
	"mime_type" text,
	"size" integer,
	"updated_at" timestamp with time zone NOT NULL,
	"uploader_id" text NOT NULL,
	"sub_type" text
);
--> statement-breakpoint
CREATE TABLE "micro_contract" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"clinical_case_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"escrow_status" text NOT NULL,
	"platform_fee" double precision NOT NULL,
	"total_price" double precision NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"dentist_id" text NOT NULL,
	"technician_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_view" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"clinical_case_id" uuid NOT NULL,
	"viewer_id" text NOT NULL,
	"viewed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "annotation" ADD CONSTRAINT "annotation_clinical_case_id_fkey" FOREIGN KEY ("clinical_case_id") REFERENCES "public"."clinical_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotation" ADD CONSTRAINT "annotation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_case" ADD CONSTRAINT "clinical_case_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_case" ADD CONSTRAINT "clinical_case_assigned_technician_id_fkey" FOREIGN KEY ("assigned_technician_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid" ADD CONSTRAINT "bid_clinical_case_id_fkey" FOREIGN KEY ("clinical_case_id") REFERENCES "public"."clinical_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid" ADD CONSTRAINT "bid_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_clinical_case_id_fkey" FOREIGN KEY ("clinical_case_id") REFERENCES "public"."clinical_case"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "micro_contract" ADD CONSTRAINT "micro_contract_clinical_case_id_fkey" FOREIGN KEY ("clinical_case_id") REFERENCES "public"."clinical_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "micro_contract" ADD CONSTRAINT "micro_contract_dentist_id_fkey" FOREIGN KEY ("dentist_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "micro_contract" ADD CONSTRAINT "micro_contract_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_view" ADD CONSTRAINT "case_view_clinical_case_id_fkey" FOREIGN KEY ("clinical_case_id") REFERENCES "public"."clinical_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_view" ADD CONSTRAINT "case_view_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "annotation_clinicalCaseId_idx" ON "annotation" USING btree ("clinical_case_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "annotation_userId_idx" ON "annotation" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "clinical_case_assignedTechnicianId_idx" ON "clinical_case" USING btree ("assigned_technician_id" text_ops);--> statement-breakpoint
CREATE INDEX "clinical_case_organizationId_idx" ON "clinical_case" USING btree ("organization_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "organization_rut_uidx" ON "organization" USING btree ("rut" text_ops);--> statement-breakpoint
CREATE INDEX "audit_log_organizationId_idx" ON "audit_log" USING btree ("organization_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "audit_log_userId_idx" ON "audit_log" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "bid_clinicalCaseId_idx" ON "bid" USING btree ("clinical_case_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "bid_technicianId_idx" ON "bid" USING btree ("technician_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_uidx" ON "user" USING btree ("email" text_ops);--> statement-breakpoint
CREATE INDEX "user_organizationId_idx" ON "user" USING btree ("organization_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "file_clinicalCaseId_idx" ON "file" USING btree ("clinical_case_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "file_organizationId_idx" ON "file" USING btree ("organization_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "file_uploaderId_idx" ON "file" USING btree ("uploader_id" text_ops);--> statement-breakpoint
CREATE INDEX "micro_contract_clinicalCaseId_idx" ON "micro_contract" USING btree ("clinical_case_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "micro_contract_clinicalCaseId_uidx" ON "micro_contract" USING btree ("clinical_case_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "micro_contract_dentistId_idx" ON "micro_contract" USING btree ("dentist_id" text_ops);--> statement-breakpoint
CREATE INDEX "micro_contract_technicianId_idx" ON "micro_contract" USING btree ("technician_id" text_ops);--> statement-breakpoint
CREATE INDEX "case_view_clinicalCaseId_idx" ON "case_view" USING btree ("clinical_case_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "case_view_viewerId_idx" ON "case_view" USING btree ("viewer_id" text_ops);
*/