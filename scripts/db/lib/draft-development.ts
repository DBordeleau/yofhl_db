import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DraftDevelopmentFacts } from '../../../lib/draft/development';
import { splitPositions } from '../../../lib/league';
import { createNhl, type NhlFetcher } from '../../../lib/nhl/create-nhl';
import { ageOn, type Nhl, type NhlPlayer } from '../../../lib/nhl/model';
import { draftPicks } from '../../../db/schema';
import type { Db } from './connect';
import type { HistoryImport } from './history';

type DraftPick = HistoryImport['picks'][number];
export type DraftFactsLoader = (pick: DraftPick, nhlId?: number) => Promise<DraftDevelopmentFacts>;

/** how long one attempt at an NHL request may take */
const ATTEMPT_TIMEOUT_MS = 15000;
/** how long the NHL module waits for one paced, retried request: three attempts, two rate-limit waits and the pauses */
const REQUEST_TIMEOUT_MS = 3 * (ATTEMPT_TIMEOUT_MS + 1000) + 2 * 60000;
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

interface ImportFetcherOptions {
    /** where NHL answers are kept between runs */
    cacheDir: string;
    fetch?: typeof fetch;
    pause?: (ms: number) => Promise<void>;
}

/**
 * The fetcher the import hands the NHL module: it answers from the file cache when it can, otherwise pauses before
 * every request so a long import stays under the NHL's rate limit, retries a rate-limited answer after the wait the
 * NHL asks for, and keeps every good answer in the cache. Any other answer goes back to the module as it came.
 */
export function importFetcher({ cacheDir, fetch: request = fetch, pause = sleep }: ImportFetcherOptions): NhlFetcher {
    return async (url, init) => {
        const path = join(cacheDir, `${url.replace(/^https:\/\//, '').replace(/[^a-zA-Z0-9]+/g, '-')}.json`);
        try { return new Response(await readFile(path, 'utf8')); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        for (let attempt = 0; ; attempt++) {
            await pause(850);
            const signal = init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(ATTEMPT_TIMEOUT_MS)]) : AbortSignal.timeout(ATTEMPT_TIMEOUT_MS);
            const response = await request(url, { ...init, signal });
            if (response.status === 429 && attempt < 2) {
                const retry = response.headers.get('retry-after');
                const wait = retry && !Number.isFinite(Number(retry)) ? Date.parse(retry) - Date.now() : (Number(retry) || 5) * 1000;
                await pause(Math.min(60000, Math.max(3000, wait)));
                continue;
            }
            if (!response.ok) return response;
            const body = await response.text();
            await mkdir(cacheDir, { recursive: true });
            await writeFile(path, body);
            return new Response(body);
        }
    };
}

function needsExperience(pick: DraftPick, birthDate: string) {
    const age = ageOn(birthDate, pick.draftedOn);
    if (age === null || new Date(birthDate).toISOString().slice(0, 10) !== birthDate) throw new Error('Invalid NHL birth date');
    return age >= 23 && age <= (splitPositions(pick.positions).includes('G') ? 25 : 24);
}

/**
 * Draft facts from the NHL module: the pick's stored NHL identity when an earlier import found one, otherwise the
 * identity the module finds for it. Games before the draft date are counted only for a pick old enough to need them.
 */
export function draftFactsLoader(nhl: Nhl): DraftFactsLoader {
    const players = new Map<number, NhlPlayer>();
    return async (pick, nhlId) => {
        const playerId = pick.playerId!;
        if (!/^[a-zA-Z0-9]+$/.test(playerId)) throw new Error('Invalid Fantrax identity');
        const id = nhlId ?? await nhl.identify({ name: pick.playerName!, playerId, positions: splitPositions(pick.positions), nhlTeam: pick.nhlTeam });
        if (id === null) throw new Error('Ambiguous or unmatched NHL identity');
        let player = players.get(id);
        if (!player) {
            player = await nhl.player(id);
            if (!player.birthDate || player.seasons === null) throw new Error('Incomplete NHL profile');
            players.set(id, player);
        }
        let games: number | null = null;
        if (needsExperience(pick, player.birthDate!)) {
            // Draft exports omit AM/PM, so games on the draft date are not assumed to have happened already.
            games = await nhl.gamesBefore(id, pick.seasonYear, pick.draftedOn);
            if (games === null) throw new Error('Incomplete NHL games history');
        }
        return { draftedOn: pick.draftedOn, birthDate: player.birthDate!, nhlId: id, priorNhlGames: games };
    };
}

function createLoader(newestYear: number): DraftFactsLoader {
    // Refresh NHL answers when importing a new season; birth dates and completed draft facts remain reusable.
    const fetcher = importFetcher({ cacheDir: `.cache/draft-development/${newestYear}` });
    return draftFactsLoader(createNhl({ fetcher, timeoutMs: REQUEST_TIMEOUT_MS }));
}

// Fetch before the import writes anything. Matching historical picks reuse their persisted facts.
export async function enrichDraftDevelopment(db: Db, picks: DraftPick[], load?: DraftFactsLoader): Promise<void> {
    if (!picks.some(pick => pick.playerId)) return;
    const existing = await db.select({ playerId: draftPicks.playerId, facts: draftPicks.developmentFacts }).from(draftPicks);
    const known = new Map(existing.filter(row => row.facts && row.playerId).map(row => [`${row.playerId}:${row.facts!.draftedOn}`, row.facts!]));
    const identities = new Map(existing.filter(row => row.facts && row.playerId).map(row => [row.playerId!, row.facts!]));
    const fetchFacts = load ?? createLoader(Math.max(...picks.map(pick => pick.seasonYear)));
    const resolved: [DraftPick, DraftDevelopmentFacts][] = [];
    for (const pick of picks) {
        if (!pick.playerId) continue;
        try {
            let facts = known.get(`${pick.playerId}:${pick.draftedOn}`);
            const previous = identities.get(pick.playerId);
            if (!facts && previous && !needsExperience(pick, previous.birthDate)) facts = { ...previous, draftedOn: pick.draftedOn, priorNhlGames: null };
            if (!facts || (needsExperience(pick, facts.birthDate) && facts.priorNhlGames === null)) facts = await fetchFacts(pick, previous?.nhlId);
            if (facts.draftedOn !== pick.draftedOn || !Number.isInteger(facts.nhlId) || facts.nhlId <= 0 ||
                (needsExperience(pick, facts.birthDate) && (facts.priorNhlGames === null || !Number.isInteger(facts.priorNhlGames) || facts.priorNhlGames < 0))) throw new Error('Incomplete draft development facts');
            known.set(`${pick.playerId}:${pick.draftedOn}`, facts);
            identities.set(pick.playerId, facts);
            resolved.push([pick, facts]);
        } catch (error) {
            throw new Error(`Draft development data for ${pick.playerName} (${pick.playerId}, ${pick.seasonYear}): ${(error as Error).message}. Import stopped; retry after resolving the data source.`);
        }
    }
    for (const [pick, facts] of resolved) pick.developmentFacts = facts;
}
