-- Apply only after the dry-run ownership report is clean and every legacy row
-- has been assigned an owner. This is intentionally a separate deploy gate.
ALTER TABLE "solved_problems" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "solve_events" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "plan_checks" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "plan_days" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "plan_counters" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "solved_problems" DROP CONSTRAINT "solved_problems_pkey";
ALTER TABLE "solved_problems" DROP CONSTRAINT "solved_problems_user_key_unique";
ALTER TABLE "solved_problems" ADD CONSTRAINT "solved_problems_pkey" PRIMARY KEY ("user_id","canonical_key");
ALTER TABLE "plan_checks" DROP CONSTRAINT "plan_checks_pkey";
ALTER TABLE "plan_checks" DROP CONSTRAINT "plan_checks_user_check_unique";
ALTER TABLE "plan_checks" ADD CONSTRAINT "plan_checks_pkey" PRIMARY KEY ("user_id","check_id");
ALTER TABLE "plan_days" DROP CONSTRAINT "plan_days_pkey";
ALTER TABLE "plan_days" DROP CONSTRAINT "plan_days_user_date_unique";
ALTER TABLE "plan_days" ADD CONSTRAINT "plan_days_pkey" PRIMARY KEY ("user_id","date");
ALTER TABLE "plan_counters" DROP CONSTRAINT "plan_counters_pkey";
ALTER TABLE "plan_counters" DROP CONSTRAINT "plan_counters_user_id_unique";
ALTER TABLE "plan_counters" ADD CONSTRAINT "plan_counters_pkey" PRIMARY KEY ("user_id","id");
--> statement-breakpoint
DROP INDEX IF EXISTS "solved_first_solved_at_idx";
DROP INDEX IF EXISTS "solve_events_key_created_idx";
