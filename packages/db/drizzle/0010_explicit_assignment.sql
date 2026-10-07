-- Each track keeps the registration manager it had through its faculty or campus before those defaults go.
UPDATE "letter_requests" l SET "registration_manager_id" = COALESCE(
  (SELECT u."registration_manager_id" FROM "units" u WHERE u."campus" = l."campus" AND u."faculty" = l."faculty"),
  (SELECT c."registration_manager_id" FROM "campuses" c WHERE c."name" = l."campus")
) WHERE l."registration_manager_id" IS NULL;--> statement-breakpoint
ALTER TABLE "campuses" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "units" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "campuses" CASCADE;--> statement-breakpoint
DROP TABLE "units" CASCADE;--> statement-breakpoint
ALTER TABLE "letter_requests" ALTER COLUMN "advisor_id" DROP NOT NULL;