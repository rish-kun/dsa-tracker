import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

type Db = PostgresJsDatabase<typeof schema>;

let _db: Db | null = null;

function getDb(): Db {
  if (!_db) {
    // Project-specific name first: a generic DATABASE_URL exported in the
    // user's shell profile (from another project) must never win over .env.
    const url = process.env.DSA_TRACKER_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error('DSA_TRACKER_DATABASE_URL is not set');
    // prepare: false — required for Supabase's transaction-mode pooler (pgbouncer).
    _db = drizzle(postgres(url, { prepare: false }), { schema });
  }
  return _db;
}

// Lazy proxy so importing this module never connects (or throws) at build time.
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    return Reflect.get(getDb(), prop) as unknown;
  },
});

export * from './schema';
