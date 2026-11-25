// The NHL module over HTTP: the only code that asks the NHL's player search, player profiles and game logs anything,
// and the only code that knows their answers' shapes or the NHL's season IDs (`20262027`). It is built from a fetcher, its
// one seam with the outside world, and keeps no cache. A failed request, a timeout, an unexpected status or answer,
// or a profile for a different player than the one asked for throws; no match is no NHL identity.
import verifiedIdentities from '../../league/nhl-player-ids.json';
import { countGamesBefore } from './games';
import { matchIdentity, type NhlCandidate } from './match';
import type { Nhl, NhlIdentity, NhlPlayer, NhlSeasonLine } from './model';

export type NhlFetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface NhlOptions {
    /** how requests reach the NHL: `fetch` unless a caller paces, retries or records them */
    fetcher?: NhlFetcher;
    /** how long one request may take before it fails, 6 seconds unless given */
    timeoutMs?: number;
}

const SEARCH = 'https://search.d3.nhle.com/api/v1/search/player';
/** how many results the player search is asked for, so a second player with the same name is never unseen */
const SEARCH_DEPTH = 100;
const PROFILE = (nhlId: NhlIdentity) => `https://api-web.nhle.com/v1/player/${nhlId}/landing`;
/** the NHL's season ID (20252026) for a season year: the season named by both its years */
const seasonId = (seasonYear: number) => (seasonYear - 1) * 10000 + seasonYear;
/** a player's regular-season (game type 2) games in one season */
const GAME_LOG = (nhlId: NhlIdentity, seasonYear: number) => `https://api-web.nhle.com/v1/player/${nhlId}/game-log/${seasonId(seasonYear)}/2`;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** the league's verified identities: the NHL identity of each Player ID the search can't be trusted with */
const VERIFIED = verifiedIdentities as Record<string, { nhlId: number }>;
/** a line naming a player's combined line for a season split between teams */
const COMBINED = /^(total|totals|\d+ teams?)$/i;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' && value !== '' ? value : null;
const localized = (value: unknown) => isObject(value) ? text(value.default) : null;
const stat = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
/** a count of games: a whole number no less than zero, or null; a ratio such as a GAA is a `stat` */
const gameCount = (value: unknown) => Number.isInteger(value) && (value as number) >= 0 ? value as number : null;

function unexpected(what: string): never {
    throw new Error(`The NHL ${what} answered unexpectedly`);
}

/** a search hit as a candidate identity */
function candidate(hit: unknown): NhlCandidate {
    if (!isObject(hit) || typeof hit.name !== 'string' || !/^\d+$/.test(String(hit.playerId))) unexpected('player search');
    return { nhlId: Number(hit.playerId), name: hit.name, position: text(hit.positionCode), teams: [text(hit.teamAbbrev), text(hit.lastTeamAbbrev)] };
}

/** minutes from the NHL's `mm:ss`, or null */
function minutes(value: unknown): number | null {
    const match = typeof value === 'string' ? /^(\d+):([0-5]\d)$/.exec(value) : null;
    return match ? Number(match[1]) + Number(match[2]) / 60 : null;
}

/** one season's team lines as one line: the NHL's combined line, or the lines summed when it gave none */
function seasonLine(lines: Record<string, unknown>[]): NhlSeasonLine {
    const combined = lines.find(line => COMBINED.test(localized(line.teamName) ?? ''));
    const [only] = combined ? [combined] : lines;
    if (combined || lines.length === 1) {
        return {
            games: gameCount(only.gamesPlayed), goals: stat(only.goals), assists: stat(only.assists), points: stat(only.points),
            wins: stat(only.wins), goalsAgainstAverage: stat(only.goalsAgainstAvg), savePercentage: stat(only.savePctg),
        };
    }
    const sum = (values: (number | null)[]) => values.every(value => value !== null) ? values.reduce((total, value) => total + value, 0) : null;
    const total = (key: string) => sum(lines.map(line => stat(line[key])));
    // every team line's games must be a count, so an invalid line can't hide inside a plausible total
    const games = sum(lines.map(line => gameCount(line.gamesPlayed)));
    const goalsAgainst = total('goalsAgainst');
    const shotsAgainst = total('shotsAgainst');
    const played = sum(lines.map(line => minutes(line.timeOnIce)));
    return {
        games, goals: total('goals'), assists: total('assists'), points: total('points'), wins: total('wins'),
        goalsAgainstAverage: goalsAgainst !== null && played ? goalsAgainst / played * 60 : null,
        savePercentage: goalsAgainst !== null && shotsAgainst ? (shotsAgainst - goalsAgainst) / shotsAgainst : null,
    };
}

/** a profile's NHL regular-season lines by season year, or null when it has no season history */
function seasons(seasonTotals: unknown): NhlPlayer['seasons'] {
    if (seasonTotals === undefined || seasonTotals === null) return null;
    if (!Array.isArray(seasonTotals)) unexpected('player profile');
    const bySeason = new Map<number, Record<string, unknown>[]>();
    for (const line of seasonTotals) {
        if (!isObject(line) || typeof line.season !== 'number') unexpected('player profile');
        if (line.leagueAbbrev !== 'NHL' || line.gameTypeId !== 2) continue;
        // the NHL's season ID (20252026) names a season by both its years; the season year is the second
        const seasonYear = line.season % 10000;
        if (line.season !== seasonId(seasonYear)) unexpected('player profile');
        bySeason.set(seasonYear, [...bySeason.get(seasonYear) ?? [], line]);
    }
    return Object.fromEntries([...bySeason].map(([seasonYear, lines]) => [seasonYear, seasonLine(lines)]));
}

export function createNhl({ fetcher = (url, init) => fetch(url, init), timeoutMs = 6000 }: NhlOptions = {}): Nhl {
    async function request(url: string): Promise<unknown> {
        const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
        if (!response.ok) throw new Error(`The NHL returned ${response.status} for ${url}`);
        return response.json();
    }

    async function player(nhlId: NhlIdentity): Promise<NhlPlayer> {
        const profile = await request(PROFILE(nhlId));
        if (!isObject(profile) || typeof profile.playerId !== 'number') unexpected('player profile');
        if (profile.playerId !== nhlId) throw new Error(`The NHL answered for player ${profile.playerId} when asked for ${nhlId}`);
        const first = localized(profile.firstName);
        const last = localized(profile.lastName);
        if (!first || !last) unexpected('player profile');
        const headshot = text(profile.headshot);
        return {
            nhlId,
            name: `${first} ${last}`,
            birthDate: text(profile.birthDate),
            birthCountry: text(profile.birthCountry),
            birthCity: localized(profile.birthCity),
            headshot: headshot?.startsWith('https://') ? headshot : null,
            team: text(profile.currentTeamAbbrev),
            position: text(profile.position),
            seasons: seasons(profile.seasonTotals),
        };
    }

    return {
        identify: async player => {
            const verified = player.playerId ? VERIFIED[player.playerId]?.nhlId : undefined;
            if (verified !== undefined) return verified;
            const url = new URL(SEARCH);
            url.search = new URLSearchParams({ culture: 'en-us', limit: String(SEARCH_DEPTH), q: player.name }).toString();
            const hits = await request(url.toString());
            if (!Array.isArray(hits)) unexpected('player search');
            return matchIdentity(player, hits.map(candidate));
        },
        player,
        gamesBefore: async (nhlId, seasonYear, date) => countGamesBefore((await player(nhlId)).seasons, seasonYear, date, async () => {
            const log = await request(GAME_LOG(nhlId, seasonYear));
            if (!isObject(log) || !Array.isArray(log.gameLog)) unexpected('player game log');
            return log.gameLog.map(game => isObject(game) && typeof game.gameDate === 'string' && DATE.test(game.gameDate) ? game.gameDate : unexpected('player game log'));
        }),
    };
}
