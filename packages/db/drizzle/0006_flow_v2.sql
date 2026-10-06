CREATE TYPE "public"."decision_kind" AS ENUM('APPROVED', 'CHANGES', 'CLEARED');--> statement-breakpoint
CREATE TYPE "public"."phase" AS ENUM('DRAFT', 'REVIEW', 'ACADEMIC', 'FINAL', 'APPROVED');--> statement-breakpoint
CREATE TABLE "letter_academics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"letter_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"invited_by" uuid,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"letter_id" uuid NOT NULL,
	"seat" text NOT NULL,
	"kind" "decision_kind" NOT NULL,
	"user_id" uuid NOT NULL,
	"on_behalf_of" uuid,
	"version_number" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "approver_assignments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "approvals" CASCADE;--> statement-breakpoint
DROP TABLE "approver_assignments" CASCADE;--> statement-breakpoint
DROP INDEX "letter_requests_season_stage_idx";--> statement-breakpoint
ALTER TABLE "campuses" ADD COLUMN "only_vp" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "suggestion" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN "phase" "phase" DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN "registration_manager_id" uuid;--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN "advisor_hold" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN "source_letter_id" uuid;--> statement-breakpoint
ALTER TABLE "letter_requests" ADD COLUMN "in_gilboa_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "sequential_review" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "control_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "only_vp" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "text_match" integer;--> statement-breakpoint
ALTER TABLE "letter_academics" ADD CONSTRAINT "letter_academics_letter_id_letter_requests_id_fk" FOREIGN KEY ("letter_id") REFERENCES "public"."letter_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_academics" ADD CONSTRAINT "letter_academics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_academics" ADD CONSTRAINT "letter_academics_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_letter_id_letter_requests_id_fk" FOREIGN KEY ("letter_id") REFERENCES "public"."letter_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_on_behalf_of_users_id_fk" FOREIGN KEY ("on_behalf_of") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "letter_academics_letter_idx" ON "letter_academics" USING btree ("letter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "letter_academics_once_uq" ON "letter_academics" USING btree ("letter_id","user_id");--> statement-breakpoint
CREATE INDEX "reviews_letter_idx" ON "reviews" USING btree ("letter_id","created_at");--> statement-breakpoint
ALTER TABLE "letter_requests" ADD CONSTRAINT "letter_requests_registration_manager_id_users_id_fk" FOREIGN KEY ("registration_manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "letter_requests_season_phase_idx" ON "letter_requests" USING btree ("season_id","phase");--> statement-breakpoint
ALTER TABLE "letter_requests" DROP COLUMN "stage";--> statement-breakpoint
DROP TYPE "public"."approver_slot";--> statement-breakpoint
DROP TYPE "public"."stage";UPDATE "comments" SET "published_at" = "created_at" WHERE "published_at" IS NULL;
