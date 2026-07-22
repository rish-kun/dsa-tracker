DROP INDEX "solve_events_key_idx";--> statement-breakpoint
CREATE INDEX "problems_title_normalized_idx" ON "problems" USING btree (regexp_replace(lower("title"), '[^a-z0-9]', '', 'g'));--> statement-breakpoint
CREATE INDEX "solve_events_key_created_idx" ON "solve_events" USING btree ("canonical_key","created_at");