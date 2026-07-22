# NeetCode 150 Counter and Today Activity

## Design

- Keep every tracker solve in `solved_problems`; no database rows or events are changed.
- Store the canonical 150 `lc:<slug>` membership keys in `packages/plan-data`, sourced from NeetCode's official NeetCode 150 dataset.
- Derive the first ring by intersecting that membership set with the existing `solved_problems` key set. Manual counters and off-list solves do not contribute.
- Keep the extra-problem counter manual and separate; remove the obsolete manual NeetCode adjustment controls from the plan UI.
- Show today's distinct non-backfill tracker solves in the plan header beside the OA countdown. The existing IST-bucketed `solvedPerDay` map remains authoritative.

## Verification

- Assert the membership list contains exactly 150 unique keys and every key resolves in the seeded catalog.
- Compare the derived count with a read-only Supabase query.
- Typecheck, build, and render `/plan`; confirm the header today count and the NeetCode ring value.
