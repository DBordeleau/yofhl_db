import { neon } from '@neondatabase/serverless';
import type { SQL } from 'drizzle-orm';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { unstable_cache } from 'next/cache';
import * as schema from '@/db/schema';

// Runtime database access for pages and API routes: Neon's HTTP driver (no connection setup, good
// for serverless) plus Next's data cache, so most requests never reach the database.

let db: NeonHttpDatabase<typeof schema> | null = null;

export const getDb = () => {
    if (!db) {
        // DATABASE_URL_V2 wins when set (local .env.local); production uses DATABASE_URL
        const url = process.env.DATABASE_URL_V2 ?? process.env.DATABASE_URL;
        if (!url || url.startsWith('pglite:')) {
            throw new Error('Set DATABASE_URL (or DATABASE_URL_V2) to the Neon connection string.');
        }
        db = drizzle(neon(url), { schema });
    }
    return db;
};

export const rows = async <T>(query: SQL): Promise<T[]> => (await getDb().execute(query)).rows as T[];

// every cached query carries this tag; POST /api/revalidate (run by the importer and admin saves) clears it
export const LEAGUE_TAG = 'league';

// League data only changes when it's imported or edited, so cache results until told otherwise.
// Development skips the cache so a fresh import shows up immediately.
export const cached = <Args extends unknown[], Result>(fn: (...args: Args) => Promise<Result>, key: string) =>
    process.env.NODE_ENV === 'development'
        ? fn
        : unstable_cache(fn, [key], { tags: [LEAGUE_TAG], revalidate: false });
