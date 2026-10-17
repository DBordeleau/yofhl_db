import { sql, type SQL } from 'drizzle-orm';
import portraits from '../../records/player-portraits.json';
import { unknownPlayer, type FactPacket, type FeaturedPlayer } from './facts';

export interface ArchivedPlayerStats {
    id: string;
    name: string;
    season: number;
    nhlTeam: string | null;
    positions: string[];
    fpts: number | null;
    fpg: number | null;
}
type Query = (query: SQL) => Promise<ArchivedPlayerStats[]>;
const key = (name: string) => name.trim().toLowerCase();
const defaultQuery: Query = async query => {
    const { rows } = await import('../../data/db');
    return rows<ArchivedPlayerStats>(query);
};

/** Freeze one explicit archive season without refreshing any live league observations. */
export async function captureArchivedStats(packet: FactPacket, names: string[], options: {
    season?: number;
    query?: Query;
    now?: () => Date;
} = {}): Promise<FactPacket> {
    const season = options.season ?? packet.season - 1;
    if (!Number.isInteger(season) || season < 1 || season >= packet.season) {
        throw new Error('Archived stats season must be an ending year before the episode season.');
    }
    const selected = [...new Map(names.map(name => [key(name), name.trim()])).values()].filter(Boolean);
    if (!selected.length) return packet;
    // Exact names and an exact season: never silently substitute a newer/older line or a namesake.
    const found = await (options.query ?? defaultQuery)(sql`
        select p.id, p.name, ps.season_year as season, ps.nhl_team as "nhlTeam", ps.positions,
               ps.fpts::float8 as fpts, ps.fpg::float8 as fpg
        from league.players p join league.player_seasons ps on ps.player_id = p.id
        where ps.season_year = ${season} and lower(trim(p.name)) in ${selected.map(key)}`);
    const source = { url: `yofhl-db:league.player_seasons?season_year=${season}`, fetchedAt: (options.now?.() ?? new Date()).toISOString() };
    const prefixes = selected.map(name => `Archived YOFHL stats for ${name}:`);
    const limitations = packet.limitations.filter(note => !prefixes.some(prefix => note.startsWith(prefix)) &&
        note !== 'Player cards have no archived fantasy statistics in this reference preview.' &&
        note !== 'Featured players have NHL identity and birthplace only. Archived fantasy FPts/FP/G are not fetched; player/gap statistics need a separate sourced snapshot.');
    const updates = new Map<string, FeaturedPlayer>();
    for (const name of selected) {
        const existing = packet.players.find(player => key(player.name) === key(name)) ?? unknownPlayer(name);
        const matches = found.filter(row => key(row.name) === key(name) && row.season === season);
        const row = matches.length === 1 ? matches[0] : undefined;
        if (row && [row.fpts, row.fpg].some(value => value !== null && !Number.isFinite(value))) {
            throw new Error(`Invalid archived fantasy statistics for ${name}.`);
        }
        if (!row || row.fpts === null || row.fpg === null) {
            const reason = matches.length > 1 ? 'ambiguous player identity' : row ? 'incomplete FPts/FP/G' : 'no player-season record';
            limitations.push(`Archived YOFHL stats for ${name}: ${reason} in ${season - 1}–${String(season).slice(-2)}. Resolve with sourced evidence or use an honest graphic fallback.`);
        }
        updates.set(key(name), { ...existing,
            headshot: existing.headshot ?? (row ? (portraits as Record<string, string>)[row.id.replaceAll('*', '')] ?? null : null),
            nhlTeam: row ? row.nhlTeam : existing.nhlTeam,
            positions: row ? row.positions : existing.positions,
            season: row ? season : null, fpts: row?.fpts ?? null, fpg: row?.fpg ?? null,
            // This archive stores rounded FP/G, not games played. Division would invent a GP total.
            games: null,
            statsSource: { ...source, season, playerId: row?.id ?? null },
        });
    }
    const existingNames = new Set(packet.players.map(player => key(player.name)));
    return { ...packet,
        players: [...packet.players.map(player => updates.get(key(player.name)) ?? player),
            ...[...updates].filter(([name]) => !existingNames.has(name)).map(([, player]) => player)],
        sources: [...packet.sources, source], limitations,
    };
}
