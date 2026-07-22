CREATE TABLE "plan_checks" (
	"check_id" text PRIMARY KEY NOT NULL,
	"done" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_counters" (
	"id" text PRIMARY KEY NOT NULL,
	"dsa" integer DEFAULT 0 NOT NULL,
	"dsa_extra" integer DEFAULT 0 NOT NULL,
	"dsa_hist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dsa_extra_hist" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_days" (
	"date" text PRIMARY KEY NOT NULL,
	"log" text,
	"floor_dsa" boolean DEFAULT false NOT NULL,
	"floor_cpp" boolean DEFAULT false NOT NULL,
	"floor_log" boolean DEFAULT false NOT NULL,
	"trip" boolean DEFAULT false NOT NULL
);
