-- Per-problem active time remains separate from site totals: time_daily still
-- accounts for every active practice page, while this table only receives
-- increments when an adapter has resolved a canonical problem identity.
CREATE TABLE "time_problem_daily" (
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"canonical_key" text NOT NULL,
	"title" text NOT NULL,
	"source" text NOT NULL,
	"url" text,
	"seconds" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_problem_daily_user_id_date_canonical_key_pk" PRIMARY KEY("user_id","date","canonical_key")
);
--> statement-breakpoint
CREATE INDEX "time_problem_user_key_idx" ON "time_problem_daily" USING btree ("user_id","canonical_key");
--> statement-breakpoint
-- Same deny-by-default posture as every other user-owned table: the server DB
-- role may access it, while direct Data API access has no permissive policy.
ALTER TABLE "time_problem_daily" ENABLE ROW LEVEL SECURITY;
