-- The web server connects through the database role, not Supabase's anon or
-- authenticated Data API roles. With no policies, direct client access to
-- these user-owned tables is denied while the server role keeps working.
ALTER TABLE "solved_problems" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "solve_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plan_checks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plan_days" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plan_counters" ENABLE ROW LEVEL SECURITY;
