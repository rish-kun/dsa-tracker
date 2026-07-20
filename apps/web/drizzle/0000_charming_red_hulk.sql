CREATE TABLE "problems" (
	"lc_slug" text PRIMARY KEY NOT NULL,
	"lc_number" integer NOT NULL,
	"title" text NOT NULL,
	"difficulty" text NOT NULL,
	"paid_only" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solve_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"canonical_key" text NOT NULL,
	"source" text NOT NULL,
	"url" text,
	"detected" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solved_problems" (
	"canonical_key" text PRIMARY KEY NOT NULL,
	"lc_slug" text,
	"title" text NOT NULL,
	"difficulty" text,
	"first_source" text NOT NULL,
	"first_solved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "solved_problems" ADD CONSTRAINT "solved_problems_lc_slug_problems_lc_slug_fk" FOREIGN KEY ("lc_slug") REFERENCES "public"."problems"("lc_slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "solve_events_key_idx" ON "solve_events" USING btree ("canonical_key");--> statement-breakpoint
CREATE INDEX "solved_first_solved_at_idx" ON "solved_problems" USING btree ("first_solved_at");