CREATE TABLE "rules" (
	"capability" text PRIMARY KEY NOT NULL,
	"roles" "role"[] DEFAULT '{}' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;