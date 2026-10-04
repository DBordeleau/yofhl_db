import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from '@/db/schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

// drizzle's migration log lives in the league schema too, so nothing is added to public
const MIGRATIONS = { migrationsFolder: 'db/migrations', migrationsSchema: 'league' };

// DATABASE_URL_V2 is either a Postgres connection string (Neon) or "pglite:<folder>" for a local
// database stored on disk, which needs no server or credentials
export const connect = async () => {
    const url = process.env.DATABASE_URL_V2;
    if (!url) {
        throw new Error(
            'Set DATABASE_URL_V2 to a Postgres connection string (e.g. your Neon database) or to "pglite:.pglite" for a local database.',
        );
    }

    if (url.startsWith('pglite:')) {
        const dir = url.slice('pglite:'.length) || '.pglite';
        mkdirSync(dir, { recursive: true });
        const client = new PGlite(dir);
        const db = drizzlePglite(client, { schema }) as unknown as Db;
        return {
            db,
            label: `PGlite (${dir})`,
            migrate: () => migratePglite(drizzlePglite(client, { schema }), MIGRATIONS),
            close: () => client.close(),
        };
    }

    const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
    const db = drizzlePostgres(client, { schema }) as unknown as Db;
    return {
        db,
        label: `Postgres (${new URL(url).host})`,
        migrate: () => migratePostgres(drizzlePostgres(client, { schema }), MIGRATIONS),
        close: () => client.end(),
    };
};

// season_results first: franchise_records reads it
export const refreshViews = async (db: Db) => {
    await db.execute(sql`REFRESH MATERIALIZED VIEW league.season_results`);
    await db.execute(sql`REFRESH MATERIALIZED VIEW league.player_careers`);
    await db.execute(sql`REFRESH MATERIALIZED VIEW league.franchise_records`);
};
