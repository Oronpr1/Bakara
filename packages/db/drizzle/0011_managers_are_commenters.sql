-- Only the track's own registration manager approves. Anyone who was added as an extra manager keeps seeing the letter, as a commenter.
DELETE FROM "letter_people" m WHERE m."kind" = 'MANAGER' AND EXISTS (
  SELECT 1 FROM "letter_people" c WHERE c."letter_id" = m."letter_id" AND c."user_id" = m."user_id" AND c."kind" = 'COMMENTER'
);--> statement-breakpoint
UPDATE "letter_people" SET "kind" = 'COMMENTER' WHERE "kind" = 'MANAGER';--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "advisory" boolean DEFAULT false NOT NULL;