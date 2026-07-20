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

    if (process.env.VERCEL) {
      // Do not parse the full connection string with URL here: an unescaped
      // password character would make this validation throw before postgres.js
      // can report a useful connection error. Only inspect the non-secret host
      // segment after the final credential separator.
      const usesDirectSupabase =
        /@db\.[a-z0-9-]+\.supabase\.co(?::5432)?(?:\/|\?|$)/i.test(url);
      if (usesDirectSupabase) {
        throw new Error(
          'DSA_TRACKER_DATABASE_URL must use the Supabase Transaction pooler on Vercel (pooler.supabase.com, port 6543), not the direct database endpoint.',
        );
      }
    }

    const client = postgres(url, {
      // Transaction-mode Supavisor cannot safely use named prepared statements.
      prepare: false,
      // Each Vercel function instance gets its own postgres.js client. Keep its
      // application-side pool deliberately tiny; Supavisor provides the shared
      // database-side pool across all instances.
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      max_lifetime: 60 * 5,
    });
    _db = drizzle(client, { schema });
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
