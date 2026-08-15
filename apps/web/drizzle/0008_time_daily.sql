-- Per-day active time on a practice site: one row per (user, tracker-day,
-- site). `date` is a text YYYY-MM-DD key in TRACKER_TZ (same convention as
-- plan_days.date), so no timezone reinterpretation can shift a day.
CREATE TABLE "time_daily" (
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"site" text NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_daily_user_id_date_site_pk" PRIMARY KEY("user_id","date","site")
);
--> statement-breakpoint
-- The dashboard reads a trailing window of days for one user; the PK's leading
-- user_id column already serves that, so no extra index is needed.
-- Same posture as 0006/0007: the web server connects through the database
-- role, so with no policies direct Data API access is denied.
ALTER TABLE "time_daily" ENABLE ROW LEVEL SECURITY;
