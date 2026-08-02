/**
 * Assign pre-auth tracker rows to one Clerk user. This script is dry-run by
 * default and never guesses an owner. Run it between migrations 0004 and 0005.
 */
import 'dotenv/config';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from '@/db';

const tables = ['solved_problems', 'solve_events', 'plan_checks', 'plan_days', 'plan_counters'] as const;
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(SCRIPT_DIR, '../drizzle');
const OWNERSHIP_MIGRATION_INDEX = 4;

function flag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function hasOwnershipColumns(): Promise<boolean> {
  const rows = await db.execute<{ count: number }>(sql`
    select count(*)::int as count
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'user_id'
      and table_name in ('solved_problems', 'solve_events', 'plan_checks', 'plan_days', 'plan_counters')
  `);
  return rows[0]?.count === tables.length;
}

/** Apply only migrations through 0004 and record them in Drizzle's normal
 * journal. A later `pnpm db:migrate` can then safely continue at 0005. */
async function applyOwnershipPreparation(): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), 'dsa-auth-stage1-'));
  try {
    const journal = JSON.parse(
      await readFile(join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'),
    ) as { version: string; dialect: string; entries: Array<{ idx: number; tag: string }> };
    const entries = journal.entries.filter((entry) => entry.idx <= OWNERSHIP_MIGRATION_INDEX);
    await mkdir(join(tempDir, 'meta'));
    await writeFile(
      join(tempDir, 'meta/_journal.json'),
      JSON.stringify({ ...journal, entries }, null, 2),
    );
    for (const entry of entries) {
      await copyFile(join(MIGRATIONS_DIR, `${entry.tag}.sql`), join(tempDir, `${entry.tag}.sql`));
    }
    await migrate(db, { migrationsFolder: tempDir });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function ownershipReport() {
  const ownershipReady = await hasOwnershipColumns();
  const report: Array<{ table: (typeof tables)[number]; total: number; unowned: number }> = [];
  // The app client is max:1; keep these reads serial even in this one-off tool.
  for (const table of tables) {
    const ownershipSql = ownershipReady
      ? 'count(*) filter (where user_id is null)::int'
      : 'count(*)::int';
    const rows = await db.execute<{ total: number; unowned: number }>(
      sql.raw(`select count(*)::int as total, ${ownershipSql} as unowned from ${table}`),
    );
    report.push({ table, ...(rows[0] ?? { total: 0, unowned: 0 }) });
  }
  return { ownershipReady, report };
}

async function main() {
  const argv = process.argv.slice(2);
  const userId = flag(argv, '--user-id');
  const commit = argv.includes('--commit');
  if (!userId || !/^user_[A-Za-z0-9_-]+$/.test(userId)) {
    throw new Error('Usage: tsx scripts/backfill-user-ownership.ts --user-id user_xxx [--commit]');
  }

  let { ownershipReady, report } = await ownershipReport();
  console.table(report);
  if (!commit) {
    console.log(
      ownershipReady
        ? 'DRY RUN: no rows changed. Re-run with --commit after confirming this report.'
        : 'DRY RUN: migration 0004 is not applied. --commit will apply only 0000-0004, then assign ownership.',
    );
    return;
  }

  if (!ownershipReady) {
    await applyOwnershipPreparation();
    ownershipReady = true;
  }

  await db.transaction(async (tx) => {
    for (const table of tables) {
      // `table` is from the closed tuple above, never user input.
      await tx.execute(sql`update ${sql.raw(table)} set user_id = ${userId} where user_id is null`);
    }
  });

  ({ report } = await ownershipReport());
  console.table(report);
  if (report.some((row) => row.unowned !== 0)) {
    throw new Error('Ownership backfill did not reach zero unowned rows; do not run db:migrate.');
  }
  console.log(`Assigned all unowned rows to ${userId}. Migration 0004 is recorded; 0005/0006 remain pending.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
