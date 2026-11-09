// A disposable league: the one way a test gets a database. A migrated in-memory Postgres, optionally with the
// app's database reads pointed at it and Next's real unstable_cache running on an in-memory backend. Everything
// it stands in for is put back when the test ends, and the network is always off unless the test brings a fetch.
//
// This module is the only place that knows the seams: the app's reads go through `getDb().execute` in
// lib/data/db.ts, and unstable_cache finds its backend on `globalThis.__incrementalCache` (with Next's
// AsyncLocalStorage installed first). A Next upgrade that moves either is fixed here.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { TestContext } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

export type LeagueOptions = {
    /** SQL run after the migrations; the materialized views are refreshed after it. */
    seed?: string;
    /** Point the app's reads (`rows()` and `getDb().execute` in lib/data/db.ts) at this league. */
    app?: boolean;
    /** Run Next's real unstable_cache on an in-memory backend. Needs `app`. */
    nextCache?: boolean;
    /** The test's own stand-in for the network. Without one, every fetch throws. */
    fetch?: typeof fetch;
};

export type CacheEntry = { readonly tags: readonly string[]; readonly revalidate: number };

export type DisposableLeague = {
    /** The league's own connection, for seeding and checking rows. Its queries are not the app's. */
    client: PGlite;
    db: PgliteDatabase;
    /** How many queries the app has run against the league. */
    queries(): number;
    /** Make the next app query whose SQL contains `sqlContaining` throw `error`. */
    failNextQuery(sqlContaining: string, error: Error): void;
    /** Expire every cache entry carrying `tag`, as revalidateTag does. */
    expire(tag: string): void;
    /** A copy of the cache's entries by key. */
    cacheEntries(): ReadonlyMap<string, CacheEntry>;
};

const VIEWS = ['season_results', 'player_careers', 'franchise_records'];
const GLOBALS = ['AsyncLocalStorage', '__incrementalCache'] as const;
const offline = async () => { throw new Error('Tests must not access the network'); };

export async function disposableLeague(t: TestContext, options: LeagueOptions = {}): Promise<DisposableLeague> {
    if (options.nextCache && !options.app) throw new Error('nextCache reads through the app, so it needs app: true too');
    const undo: (() => unknown)[] = [];
    t.after(async () => { for (const step of undo.reverse()) await step(); });

    const client = new PGlite();
    const db = drizzle(client);
    undo.push(() => client.close());
    replace(undo, globalThis, 'fetch', options.fetch ?? offline);
    await migrate(db, { migrationsFolder: 'db/migrations', migrationsSchema: 'league' });
    if (options.seed !== undefined) {
        await client.exec(options.seed);
        for (const view of VIEWS) await client.exec(`refresh materialized view league.${view};`);
    }

    const entries = new Map<string, { value: unknown; tags: string[]; revalidate: number }>();
    if (options.nextCache) {
        // cached() skips the cache in development.
        replace(undo, process.env, 'NODE_ENV', 'test');
        // Installed before anything imports Next: its async storage modules read this global when they load.
        replace(undo, globalThis, GLOBALS[0], AsyncLocalStorage);
        replace(undo, globalThis, GLOBALS[1], {
            generateSimpleCacheKey: async (key: string) => key,
            get: async (key: string) => { const entry = entries.get(key); return entry ? { value: entry.value } : null; },
            set: async (key: string, value: { revalidate: number }, { tags }: { tags: string[] }) => {
                entries.set(key, { value, tags: [...tags], revalidate: value.revalidate });
            },
        });
    }

    let queries = 0;
    const failures: { sqlContaining: string; error: Error }[] = [];
    if (options.app) {
        // getDb() builds its Neon client from this URL once, then only its execute is replaced.
        replace(undo, process.env, 'DATABASE_URL_V2', 'postgresql://test:test@localhost/test');
        const { getDb } = await import('../data/db');
        const dialect = new PgDialect();
        replace(undo, getDb(), 'execute', (query: SQL) => {
            queries++;
            const text = failures.length ? dialect.sqlToQuery(query).sql : '';
            const failure = failures.findIndex(f => text.includes(f.sqlContaining));
            if (failure >= 0) throw failures.splice(failure, 1)[0].error;
            return db.execute(query);
        });
    }

    const needs = (option: keyof LeagueOptions, what: string) => {
        if (!options[option]) throw new Error(`${what} needs a league with ${option}: true`);
    };
    return {
        client,
        db,
        queries: () => { needs('app', 'Counting queries'); return queries; },
        failNextQuery(sqlContaining, error) { needs('app', 'Failing a query'); failures.push({ sqlContaining, error }); },
        expire(tag) {
            needs('nextCache', 'Expiring a tag');
            for (const [key, entry] of entries) if (entry.tags.includes(tag)) entries.delete(key);
        },
        cacheEntries() {
            needs('nextCache', 'Listing cache entries');
            return new Map([...entries].map(([key, { tags, revalidate }]) => [key, { tags: [...tags], revalidate }]));
        },
    };
}

/** Set `target[key]` until the test ends, then put back exactly what was there (including nothing). */
function replace(undo: (() => unknown)[], target: object, key: string, value: unknown) {
    const before = Object.getOwnPropertyDescriptor(target, key);
    if (target === process.env) Object.assign(target, { [key]: value });
    else Object.defineProperty(target, key, { value, configurable: true, writable: true });
    undo.push(() => {
        if (before) Object.defineProperty(target, key, before);
        else Reflect.deleteProperty(target, key);
    });
}
