-- The user's single track: one row per user, `items` an ordered jsonb array of
-- catalog snapshots (slug/title/number/difficulty/paidOnly) saved by saveTrack().
CREATE TABLE "user_tracks" (
	"user_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Same posture as 0006: the web server connects through the database role, so
-- with no policies direct client access is denied while the server role works.
ALTER TABLE "user_tracks" ENABLE ROW LEVEL SECURITY;
