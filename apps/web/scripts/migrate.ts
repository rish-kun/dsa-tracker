/**
 * Guarded Drizzle migration entrypoint. Existing pre-auth databases must run
 * auth:backfill first; otherwise 0005 would try to make user_id NOT NULL before
 * legacy rows have an owner. Fresh/empty databases can apply the full chain.
 */
import 'dotenv/config';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from '@/db';

const MIGRATIONS_DIR = resolve(process.cwd(), 'drizzle');
const USER_TABLES = ['solved_problems', 'solve_events', 'plan_checks', 'plan_days', 'plan_counters'] as const;

async function existingUserTables(): Promise<string[]> {
  const rows = await db.execute<{ tableName: string }>(sql`
    select table_name as "tableName"
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('solved_problems', 'solve_events', 'plan_checks', 'plan_days', 'plan_counters')
  `);
  return rows.map((row) => row.tableName);
}

async function hasOwnershipColumns(): Promise<boolean> {
  const rows = await db.execute<{ count: number }>(sql`
    select count(*)::int as count
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'user_id'
      and table_name in ('solved_problems', 'solve_events', 'plan_checks', 'plan_days', 'plan_counters')
  `);
  return rows[0]?.count === USER_TABLES.length;
}

async function main() {
  const existing = await existingUserTables();
  if (existing.length > 0 && !(await hasOwnershipColumns())) {
    let rows = 0;
    for (const table of existing) {
      const result = await db.execute<{ count: number }>(
        sql.raw(`select count(*)::int as count from ${table}`),
      );
      rows += result[0]?.count ?? 0;
    }
    if (rows > 0) {
      throw new Error(
        'Legacy rows detected. Run `pnpm auth:backfill -- --user-id user_xxx --commit` before db:migrate.',
      );
    }
  }

  if (await hasOwnershipColumns()) {
    for (const table of USER_TABLES) {
      const result = await db.execute<{ count: number }>(
        sql.raw(`select count(*) filter (where user_id is null)::int as count from ${table}`),
      );
      if ((result[0]?.count ?? 0) > 0) {
        throw new Error(
          `Unowned rows remain in ${table}. Re-run auth:backfill before finalizing ownership.`,
        );
      }
    }
  }

  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  console.log('Database migrations applied.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
