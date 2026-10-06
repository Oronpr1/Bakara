ALTER TABLE "comments" ADD COLUMN "kind" text DEFAULT 'NOTE' NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "points" jsonb;