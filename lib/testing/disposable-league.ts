// A disposable league: the one way a test gets a database. A migrated in-memory Postgres, optionally with the
// app's database reads pointed at it and Next's real unstable_cache running on an in-memory backend. Everything
// it stands in for is put back when the test ends, and the network is always off unless the test brings a fetch.
//
// This module is the only place that knows the seams: the app's reads go through `getDb().execute` in
// lib/data/db.ts, unstable_cache finds its backend on `globalThis.__incrementalCache` (with Next's
// AsyncLocalStorage installed first), and revalidateTag needs Next's work store. A Next upgrade that moves
// any of them is fixed here.
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import type { TestContext } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';

export type LeagueOptions = {
    /** SQL run after the migrations; the materialized views are refreshed after it. */
    seed?: string;
    /**
     * Apply the migrations only up to and including this one (its number, such as '0008'), to test what a
     * later migration does to existing rows. `migrateRest()` applies the others.
     */
    migrateThrough?: string;
    /** Point the app's reads (`rows()` and `getDb().execute` in lib/data/db.ts) at this league. */
    app?: boolean;
    /** Run Next's real unstable_cache on an in-memory backend. Needs `app`. */
    nextCache?: boolean;
    /** The test's own stand-in for the network. Without one, every fetch throws. */
    fetch?: typeof fetch;
};

/** `revalidate` is the lifetime in seconds Next stored the entry with (a year for `revalidate: false`). */
export type CacheEntry = { readonly tags: readonly string[]; readonly revalidate: number };
/** A cache lookup and the `revalidate` option its loader asked for. */
export type CacheRead = { readonly key: string; readonly revalidate: number | false | undefined };

export type DisposableLeague = {
    /** The league's own connection, for seeding and checking rows. Its queries are not the app's. */
    client: PGlite;
    db: PgliteDatabase;
    /** Apply the migrations after `migrateThrough`. */
    migrateRest(): Promise<void>;
    /** How many queries the app has run against the league. */
    queries(): number;
    /** Make the next app query whose SQL contains `sqlContaining` throw `error`. */
    failNextQuery(sqlContaining: string, error: Error): void;
    /** Expire every cache entry carrying `tag`, as revalidateTag does. */
    expire(tag: string): void;
    /** Expire every cache entry whose key contains `text`. */
    expireByKey(text: string): void;
    /** Expire every cache entry stored with this lifetime, as if it had run out. */
    expireByLifetime(seconds: number): void;
    /** A copy of the cache's entries by key. */
    cacheEntries(): ReadonlyMap<string, CacheEntry>;
    /** Every cache lookup so far, oldest first. */
    cacheReads(): readonly CacheRead[];
    /**
     * Run `fn` as a Next route (an API route or server action) on this league's cache. Waits for the cache
     * writes it started, then expires the tags it revalidated, as Next does once a route finishes.
     */
    runAsRoute<T>(route: string, fn: () => Promise<T>): Promise<{ result: T; revalidatedTags: string[] }>;
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
    let rest: string[][] = [];
    if (options.migrateThrough === undefined) {
        await migrate(db, { migrationsFolder: 'db/migrations', migrationsSchema: 'league' });
    } else {
        // Run by hand, not through migrate(), so the ones left over can be run later without its journal.
        const { entries } = JSON.parse(readFileSync('db/migrations/meta/_journal.json', 'utf8')) as { entries: { tag: string }[] };
        const through = entries.findIndex(entry => entry.tag.startsWith(`${options.migrateThrough}_`));
        if (through < 0) throw new Error(`No migration ${options.migrateThrough} in db/migrations`);
        const migrations = readMigrationFiles({ migrationsFolder: 'db/migrations' }).map(migration => migration.sql);
        for (const statements of migrations.slice(0, through + 1)) for (const statement of statements) await client.exec(statement);
        rest = migrations.slice(through + 1);
    }
    if (options.seed !== undefined) {
        await client.exec(options.seed);
        for (const view of VIEWS) await client.exec(`refresh materialized view league.${view};`);
    }

    const entries = new Map<string, { value: unknown; tags: string[]; revalidate: number }>();
    const reads: CacheRead[] = [];
    const backend = {
        generateSimpleCacheKey: async (key: string) => key,
        get: async (key: string, { revalidate }: { revalidate?: number | false }) => {
            reads.push({ key, revalidate });
            const entry = entries.get(key);
            return entry ? { value: entry.value } : null;
        },
        set: async (key: string, value: { revalidate: number }, { tags }: { tags: string[] }) => {
            entries.set(key, { value, tags: [...tags], revalidate: value.revalidate });
        },
    };
    const expireWhere = (expired: (key: string, entry: CacheEntry) => boolean) => {
        for (const [key, entry] of entries) if (expired(key, entry)) entries.delete(key);
    };
    if (options.nextCache) {
        // cached() skips the cache in development.
        replace(undo, process.env, 'NODE_ENV', 'test');
        // Installed before anything imports Next: its async storage modules read this global when they load.
        replace(undo, globalThis, GLOBALS[0], AsyncLocalStorage);
        replace(undo, globalThis, GLOBALS[1], backend);
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
        async migrateRest() {
            needs('migrateThrough', 'Applying the rest of the migrations');
            for (const statements of rest.splice(0)) for (const statement of statements) await client.exec(statement);
        },
        queries: () => { needs('app', 'Counting queries'); return queries; },
        failNextQuery(sqlContaining, error) { needs('app', 'Failing a query'); failures.push({ sqlContaining, error }); },
        expire(tag) {
            needs('nextCache', 'Expiring a tag');
            expireWhere((_, entry) => entry.tags.includes(tag));
        },
        expireByKey(text) {
            needs('nextCache', 'Expiring by key');
            expireWhere(key => key.includes(text));
        },
        expireByLifetime(seconds) {
            needs('nextCache', 'Expiring by lifetime');
            expireWhere((_, entry) => entry.revalidate === seconds);
        },
        cacheEntries() {
            needs('nextCache', 'Listing cache entries');
            return new Map([...entries].map(([key, { tags, revalidate }]) => [key, { tags: [...tags], revalidate }]));
        },
        cacheReads() {
            needs('nextCache', 'Listing cache reads');
            return reads.map(read => ({ ...read }));
        },
        async runAsRoute(route, fn) {
            needs('nextCache', 'Running as a route');
            // Next's request store, cut down to what unstable_cache and revalidateTag read.
            const { workAsyncStorage } = await import('next/dist/server/app-render/work-async-storage.external');
            const store = { route, incrementalCache: backend, pendingRevalidatedTags: [] as string[], pendingRevalidates: {} as Record<string, Promise<unknown>> };
            const result = await workAsyncStorage.run(store as never, fn);
            await Promise.all(Object.values(store.pendingRevalidates));
            const revalidatedTags = [...store.pendingRevalidatedTags];
            for (const tag of revalidatedTags) expireWhere((_, entry) => entry.tags.includes(tag));
            return { result, revalidatedTags };
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
