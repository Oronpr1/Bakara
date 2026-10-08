ALTER TABLE "versions" ALTER COLUMN "docx_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "versions" ALTER COLUMN "docx_sha256" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "versions" ALTER COLUMN "docx_size" DROP NOT NULL;