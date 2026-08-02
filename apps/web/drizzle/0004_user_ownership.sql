-- Stage 1 is deliberately reversible: deploy this schema and backfill legacy
-- rows with scripts/backfill-user-ownership.ts before applying 0005.
ALTER TABLE "solved_problems" ADD COLUMN "user_id" text;
ALTER TABLE "solve_events" ADD COLUMN "user_id" text;
ALTER TABLE "plan_checks" ADD COLUMN "user_id" text;
ALTER TABLE "plan_days" ADD COLUMN "user_id" text;
ALTER TABLE "plan_counters" ADD COLUMN "user_id" text;
--> statement-breakpoint
CREATE INDEX "solved_user_first_solved_at_idx" ON "solved_problems" USING btree ("user_id","first_solved_at");
CREATE INDEX "solve_events_user_key_created_idx" ON "solve_events" USING btree ("user_id","canonical_key","created_at");
CREATE INDEX "solve_events_user_live_created_idx" ON "solve_events" USING btree ("user_id","created_at") WHERE "detected" <> 'backfill';
--> statement-breakpoint
-- These are nullable unique constraints during the compatibility deploy. They
-- permit new rows to use user-scoped ON CONFLICT while the old PKs still keep
-- legacy data protected until the explicit ownership backfill is complete.
ALTER TABLE "solved_problems" ADD CONSTRAINT "solved_problems_user_key_unique" UNIQUE ("user_id","canonical_key");
ALTER TABLE "plan_checks" ADD CONSTRAINT "plan_checks_user_check_unique" UNIQUE ("user_id","check_id");
ALTER TABLE "plan_days" ADD CONSTRAINT "plan_days_user_date_unique" UNIQUE ("user_id","date");
ALTER TABLE "plan_counters" ADD CONSTRAINT "plan_counters_user_id_unique" UNIQUE ("user_id","id");
