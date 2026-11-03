import { sql, type SQL } from 'drizzle-orm';
import fantraxPortraits from '../records/player-portraits.json';
import { seasonLabel } from '../seasons';
import { citationLine, type Episode } from './episode';
import type { Diagnostic, PlayerRef } from './script';
import type { StudioPlayer } from './teams';

// The player snapshot (GLOSSARY.md): the one place Coach's Corner turns an episode's cited players into the
// stats its cards show. Drafting, the admin editor, publishing and older episodes stored without a snapshot
// all come through here, so the numbers reviewed in a draft are the numbers published.
//
// - Season: exactly the stats season. Never a player's latest row, never a substitute season.
// - Identity: a bare name must be one player that season; an id picks one of several, and its name must match too.
// - Games played: the archive has none, and dividing FPts by rounded FP/G would invent one.
// - Headshot: the one NHL player left after narrowing exact-name matches by NHL team, else the Fantrax portrait.

/** a snapshot row always says which Fantrax player it is (null when none was resolved) */
export type SnapshotRow = StudioPlayer & { id: string | null };

export type SnapshotDiagnostic =
    | { kind: 'ambiguous'; ref: PlayerRef; candidates: { id: string; nhlTeam: string | null; fpts: number | null }[] }
    | { kind: 'no-record'; ref: PlayerRef }
    | { kind: 'incomplete-fpts'; ref: PlayerRef };

export interface PlayerSnapshot {
    players: SnapshotRow[];
    /** one per ref that didn't resolve to a complete line, in ref order */
    diagnostics: SnapshotDiagnostic[];
}

export interface NhlSearchHit { playerId: string; name: string; teamAbbrev?: string | null; lastTeamAbbrev?: string | null }
/** the NHL's player search and headshots */
export interface NhlPortraits {
    search(name: string): Promise<NhlSearchHit[]>;
    headshot(nhlId: string): Promise<string | null>;
}

const nhlJson = async (url: URL | string): Promise<unknown> => {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`NHL API returned HTTP ${response.status}`);
    return response.json();
};

/** The NHL's public search and landing APIs. Outages reject, so a cache in front of this never keeps one. */
export const nhlLive: NhlPortraits = {
    search: async name => {
        const url = new URL('https://search.d3.nhle.com/api/v1/search/player');
        url.search = new URLSearchParams({ culture: 'en-us', limit: '20', q: name }).toString();
        const found = await nhlJson(url);
        if (!Array.isArray(found)) throw new Error('Unexpected NHL search response');
        return found.filter(hit => typeof hit?.name === 'string' && hit.playerId != null)
            .map((hit): NhlSearchHit => ({ ...hit, playerId: String(hit.playerId) }));
    },
    headshot: async nhlId => {
        const { headshot } = await nhlJson(`https://api-web.nhle.com/v1/player/${nhlId}/landing`) as { headshot?: unknown };
        return typeof headshot === 'string' && headshot.startsWith('https://') ? headshot : null;
    },
};

/** An outage means no NHL face, so the Fantrax portrait stands in; it never blocks a snapshot. */
export const forgiving = (nhl: NhlPortraits): NhlPortraits => ({
    search: name => nhl.search(name).catch(() => []),
    headshot: nhlId => nhl.headshot(nhlId).catch(() => null),
});

export const nhlApi = forgiving(nhlLive);

/** public pages never call the NHL: every face is the Fantrax portrait */
export const noNhl: NhlPortraits = { search: async () => [], headshot: async () => null };

type Query = (query: SQL) => Promise<Record<string, unknown>[]>;
const defaultQuery: Query = async query => {
    const { rows } = await import('../data/db');
    return rows<Record<string, unknown>>(query);
};

interface ArchiveRow { id: string; name: string; nhlTeam: string | null; positions: string[]; fpts: number | null; fpg: number | null }

const key = (name: string) => name.trim().toLowerCase();
const loose = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
// the column is NOT NULL, but numeric allows NaN
const complete = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const portraits: Record<string, string> = fantraxPortraits;

async function headshotFor(name: string, nhlTeam: string | null, fantraxId: string | null, nhl: NhlPortraits): Promise<string | null> {
    const same = (await nhl.search(name)).filter(hit => loose(hit.name) === loose(name));
    const narrowed = nhlTeam ? same.filter(hit => hit.teamAbbrev === nhlTeam || hit.lastTeamAbbrev === nhlTeam) : same;
    const face = narrowed.length === 1 && /^\d+$/.test(narrowed[0].playerId) ? await nhl.headshot(narrowed[0].playerId) : null;
    return face ?? (fantraxId ? portraits[fantraxId] ?? null : null);
}

const unresolved = (ref: PlayerRef, headshot: string | null): SnapshotRow => ({
    id: ref.id ?? null, name: ref.name, headshot, nhlTeam: null, positions: [], season: null, fpts: null, fpg: null, games: null,
});

/** Resolve every ref, in order, at exactly `season`. No cap on how many. */
export async function playerSnapshot(season: number | null, refs: PlayerRef[], { portraits: nhl, query = defaultQuery }: {
    portraits: NhlPortraits;
    query?: Query;
}): Promise<PlayerSnapshot> {
    const names = [...new Set(refs.map(ref => key(ref.name)))].filter(Boolean);
    const found = season === null || !names.length ? [] : (await query(sql`
        select replace(p.id, '*', '') as id, p.name, ps.nhl_team as "nhlTeam", ps.positions,
               ps.fpts::float8 as fpts, ps.fpg::float8 as fpg
        from league.players p join league.player_seasons ps on ps.player_id = p.id
        where ps.season_year = ${season} and lower(trim(p.name)) in ${names}
        order by ps.fpts desc, p.id`)).map(row => ({ ...row, fpts: complete(row.fpts), fpg: complete(row.fpg) }) as ArchiveRow);
    const diagnostics: SnapshotDiagnostic[] = [];
    const players = await Promise.all(refs.map(async (ref): Promise<SnapshotRow> => {
        const named = found.filter(row => key(row.name) === key(ref.name));
        const matches = ref.id ? named.filter(row => row.id.toLowerCase() === ref.id) : named;
        if (matches.length > 1) {
            diagnostics.push({ kind: 'ambiguous', ref, candidates: matches.map(row => ({ id: row.id, nhlTeam: row.nhlTeam, fpts: row.fpts })) });
            return unresolved(ref, null);
        }
        const [row] = matches;
        if (!row) {
            diagnostics.push({ kind: 'no-record', ref });
            return unresolved(ref, await headshotFor(ref.name, null, ref.id ?? null, nhl));
        }
        if (row.fpts === null || row.fpg === null) diagnostics.push({ kind: 'incomplete-fpts', ref });
        return {
            id: row.id, name: row.name, headshot: await headshotFor(row.name, row.nhlTeam, row.id, nhl),
            nhlTeam: row.nhlTeam, positions: row.positions, season, fpts: row.fpts, fpg: row.fpg, games: null,
        };
    }));
    // Promise.all pushes in completion order; report in ref order
    diagnostics.sort((a, b) => refs.indexOf(a.ref) - refs.indexOf(b.ref));
    return { players, diagnostics };
}

const cited = (ref: PlayerRef) => (ref.id ? `${ref.name} #${ref.id}` : ref.name);

/** The snapshot's diagnostics as script diagnostics, each on the line that first cites the player. */
export const snapshotDiagnostics = (episode: Pick<Episode, 'timeline' | 'statsSeason'>, diagnostics: SnapshotDiagnostic[]): Diagnostic[] =>
    diagnostics.map(d => ({ line: citationLine(episode, d.ref), ...snapshotMessage(d, episode.statsSeason) }));

/** what the editor needs to show a diagnostic: it places each one on a line itself, so they follow edits */
export interface PlayerIssue { ref: PlayerRef; severity: 'error' | 'warning'; message: string }
export const playerIssues = (season: number | null, diagnostics: SnapshotDiagnostic[]): PlayerIssue[] =>
    diagnostics.map(d => ({ ref: d.ref, ...snapshotMessage(d, season) }));

/** The wording the draft check and the admin editor share. Ambiguity blocks publishing; the rest are warnings. */
export function snapshotMessage(diagnostic: SnapshotDiagnostic, season: number | null): { severity: 'error' | 'warning'; message: string } {
    const { ref } = diagnostic;
    if (season === null) return { severity: 'warning', message: `No stats for ${cited(ref)}: add season: to the front matter.` };
    const label = seasonLabel(season);
    switch (diagnostic.kind) {
        case 'ambiguous': return { severity: 'error', message: `“${ref.name}” is ${diagnostic.candidates.length} players in ${label}: ${diagnostic.candidates
            .map(c => `#${c.id} (${c.nhlTeam ?? 'no team'}, ${c.fpts ?? '?'} FPts)`).join(', ')}. Put the id after the name, like "${ref.name}" #${diagnostic.candidates[0].id}.` };
        case 'no-record': return { severity: 'warning', message: `No ${label} record for ${cited(ref)}, so the card shows no stats.` };
        case 'incomplete-fpts': return { severity: 'warning', message: `${cited(ref)} has incomplete FPts in ${label}, so the card leaves them out.` };
    }
}
