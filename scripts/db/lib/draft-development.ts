import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { matchNhlPlayer, playerAge, type NhlProfile, type NhlSearchPlayer } from '../../../lib/keepers/player-details';
import type { DraftDevelopmentFacts } from '../../../lib/draft/development';
import { draftPicks } from '../../../db/schema';
import type { Db } from './connect';
import type { HistoryImport } from './history';
import nhlIdentities from '../../../league/nhl-player-ids.json';

type DraftPick = HistoryImport['picks'][number];
type FactsLoader = (pick: DraftPick, nhlId?: number) => Promise<DraftDevelopmentFacts>;
interface GameLog { gameLog: { gameDate: string }[] }
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function request<T>(url: string): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
        await pause(850);
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (response.status === 429 && attempt < 2) {
            const retry = response.headers.get('retry-after');
            const wait = retry && !Number.isFinite(Number(retry)) ? Date.parse(retry) - Date.now() : (Number(retry) || 5) * 1000;
            await pause(Math.min(60000, Math.max(3000, wait)));
            continue;
        }
        if (!response.ok) throw new Error(`NHL HTTP ${response.status}`);
        return response.json() as Promise<T>;
    }
    throw new Error('NHL retries exhausted');
}

async function cachedJson<T>(path: string, load: () => Promise<T>): Promise<T> {
    try { return JSON.parse(await readFile(path, 'utf8')) as T; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const result = await load();
    await writeFile(path, JSON.stringify(result));
    return result;
}

function needsExperience(pick: DraftPick, birthDate: string) {
    const age = playerAge(birthDate, pick.draftedOn);
    if (age === null || new Date(birthDate).toISOString().slice(0, 10) !== birthDate) throw new Error('Invalid NHL birth date');
    return age >= 23 && age <= (pick.positions.split(',').includes('G') ? 25 : 24);
}

export function priorNhlGames(profile: NhlProfile, year: number, draftedOn: string, log: GameLog): number {
    if (!Array.isArray(profile.seasonTotals) || !Array.isArray(log.gameLog)) throw new Error('Incomplete NHL history');
    const earlier = profile.seasonTotals.filter(row => row.leagueAbbrev === 'NHL' && row.gameTypeId === 2 && row.season % 10000 < year);
    let games = 0;
    for (const season of new Set(earlier.map(row => row.season))) {
        let rows = earlier.filter(row => row.season === season);
        const total = rows.find(row => /^(total|totals|\d+ teams?)$/i.test(row.teamName?.default ?? ''));
        if (total) rows = [total];
        if (rows.some(row => !Number.isInteger(row.gamesPlayed) || row.gamesPlayed < 0)) throw new Error('Incomplete NHL games history');
        games += rows.reduce((sum, row) => sum + row.gamesPlayed, 0);
    }
    if (log.gameLog.some(game => !/^\d{4}-\d{2}-\d{2}$/.test(game.gameDate))) throw new Error('Invalid NHL game date');
    // Draft exports omit AM/PM. Games on the draft date are not assumed to have happened already.
    return games + log.gameLog.filter(game => game.gameDate < draftedOn).length;
}

function createLoader(newestYear: number): FactsLoader {
    const profiles = new Map<string, NhlProfile>();
    // Refresh profiles when importing a new season; birth dates and completed draft facts remain reusable.
    const cachePath = `.cache/draft-development/${newestYear}`;
    return async (pick, nhlId) => {
        await mkdir(cachePath, { recursive: true });
        const cacheId = pick.playerId!.replace(/\*/g, '');
        if (!/^[a-zA-Z0-9]+$/.test(cacheId)) throw new Error('Invalid Fantrax identity');
        let profile = profiles.get(pick.playerId!);
        if (!profile) {
            profile = await cachedJson<NhlProfile>(`${cachePath}/${cacheId}.json`, async () => {
                // Verified Fantrax identities disambiguate players who share the same name.
                let id = nhlId ?? (nhlIdentities as Record<string, { nhlId: number }>)[pick.playerId!]?.nhlId;
                if (!id) {
                    const candidates = await request<NhlSearchPlayer[]>('https://search.d3.nhle.com/api/v1/search/player?' + new URLSearchParams({ culture: 'en-us', limit: '100', q: pick.playerName! }));
                    if (!Array.isArray(candidates)) throw new Error('Invalid NHL search response');
                    const match = matchNhlPlayer(pick.playerName!, pick.positions.split(',')[0], pick.nhlTeam ?? '', candidates);
                    if (!match) throw new Error('Ambiguous or unmatched NHL identity');
                    id = Number(match.playerId);
                }
                const found = await request<NhlProfile>(`https://api-web.nhle.com/v1/player/${id}/landing`);
                if (found.playerId !== id) throw new Error('NHL profile identity mismatch');
                return found;
            });
            if (!Number.isInteger(profile.playerId) || !profile.birthDate || !Array.isArray(profile.seasonTotals)) throw new Error('Incomplete NHL profile');
            profiles.set(pick.playerId!, profile);
        }
        const experienceNeeded = needsExperience(pick, profile.birthDate!);
        let games: number | null = null;
        if (experienceNeeded) {
            const seasonId = (pick.seasonYear - 1) * 10000 + pick.seasonYear;
            const hasSeason = profile.seasonTotals!.some(row => row.leagueAbbrev === 'NHL' && row.gameTypeId === 2 && row.season === seasonId);
            const log = hasSeason ? await cachedJson<GameLog>(`${cachePath}/${profile.playerId}-${seasonId}.json`, () =>
                request<GameLog>(`https://api-web.nhle.com/v1/player/${profile!.playerId}/game-log/${seasonId}/2`)) : { gameLog: [] };
            games = priorNhlGames(profile, pick.seasonYear, pick.draftedOn, log);
        }
        return { draftedOn: pick.draftedOn, birthDate: profile.birthDate!, nhlId: profile.playerId, priorNhlGames: games };
    };
}

// Fetch before the import writes anything. Matching historical picks reuse their persisted facts.
export async function enrichDraftDevelopment(db: Db, picks: DraftPick[], load?: FactsLoader): Promise<void> {
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
