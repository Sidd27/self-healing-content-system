DO $$ BEGIN CREATE TYPE "public"."drift_item_status" AS ENUM('auto_applied', 'pending_review', 'approved', 'rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."drift_level" AS ENUM('low', 'med', 'high'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."learning_unit_status" AS ENUM('active', 'pending_review', 'archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."pipeline_status" AS ENUM('running', 'completed', 'failed', 'awaiting_review'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."proposed_topic_status" AS ENUM('pending_approval', 'approved', 'rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."source_type" AS ENUM('html', 'pdf'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."stage_name" AS ENUM('ingest', 'extract_topics', 'drift_analysis', 'repair_decision', 'generate'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."stage_status" AS ENUM('pending', 'running', 'completed', 'failed', 'skipped'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drift_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_run_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"change_type" text NOT NULL,
	"drift_score" real NOT NULL,
	"drift_level" "drift_level" NOT NULL,
	"reason" text NOT NULL,
	"status" "drift_item_status" DEFAULT 'auto_applied' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_unit_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learning_unit_id" uuid NOT NULL,
	"source_version_id" uuid NOT NULL,
	"lesson" text NOT NULL,
	"questions" json NOT NULL,
	"drift_score" real,
	"status" "learning_unit_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipeline_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"source_version_id" uuid,
	"triggered_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"status" "pipeline_status" DEFAULT 'running' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipeline_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pipeline_run_id" uuid NOT NULL,
	"stage" "stage_name" NOT NULL,
	"status" "stage_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"output_summary" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proposed_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_version_id" uuid NOT NULL,
	"pipeline_run_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"extracted_content" text NOT NULL,
	"status" "proposed_topic_status" DEFAULT 'pending_approval' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "source_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"normalized_content" text NOT NULL,
	"storage_path" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "source_type" NOT NULL,
	"url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "topic_extractions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"source_version_id" uuid NOT NULL,
	"extracted_content" text NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "drift_items" ADD CONSTRAINT "drift_items_pipeline_run_id_pipeline_runs_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "drift_items" ADD CONSTRAINT "drift_items_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "learning_unit_versions" ADD CONSTRAINT "learning_unit_versions_learning_unit_id_learning_units_id_fk" FOREIGN KEY ("learning_unit_id") REFERENCES "public"."learning_units"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "learning_unit_versions" ADD CONSTRAINT "learning_unit_versions_source_version_id_source_versions_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."source_versions"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "learning_units" ADD CONSTRAINT "learning_units_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_source_version_id_source_versions_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."source_versions"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_run_id_pipeline_runs_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "proposed_topics" ADD CONSTRAINT "proposed_topics_source_version_id_source_versions_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."source_versions"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "proposed_topics" ADD CONSTRAINT "proposed_topics_pipeline_run_id_pipeline_runs_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "source_versions" ADD CONSTRAINT "source_versions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "topic_extractions" ADD CONSTRAINT "topic_extractions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "topic_extractions" ADD CONSTRAINT "topic_extractions_source_version_id_source_versions_id_fk" FOREIGN KEY ("source_version_id") REFERENCES "public"."source_versions"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "topics" ADD CONSTRAINT "topics_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
