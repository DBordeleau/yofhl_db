import type { SQL } from 'drizzle-orm';
import { nhlApi, playerSnapshot, snapshotMessage, type NhlPortraits } from '../player-snapshot';
import { refKey, type PlayerRef } from '../script';
import { unknownPlayer, type FactPacket, type FeaturedPlayer } from './facts';

const key = (name: string) => name.trim().toLowerCase();
const STALE = ['Player cards have no archived fantasy statistics in this reference preview.',
    'Featured players have NHL identity and birthplace only. Archived fantasy FPts/FP/G are not fetched; player/gap statistics need a separate sourced snapshot.'];

/** Freeze the player snapshot for one stats season without refreshing any live league observations. */
export async function captureArchivedStats(packet: FactPacket, refs: PlayerRef[], options: {
    season: number;
    query?: (query: SQL) => Promise<Record<string, unknown>[]>;
    portraits?: NhlPortraits;
    now?: () => Date;
}): Promise<FactPacket> {
    const { season } = options;
    if (!Number.isInteger(season) || season < 1 || season >= packet.season) {
        throw new Error('Archived stats season must be an ending year before the episode season.');
    }
    const cited = [...new Map(refs.filter(ref => ref.name.trim()).map(ref => [refKey(ref), { ...ref, name: ref.name.trim() }])).values()];
    if (!cited.length) return packet;
    // the same module publishing uses, so the draft shows exactly the numbers the episode will freeze
    const snapshot = await playerSnapshot(season, cited, { query: options.query, portraits: options.portraits ?? nhlApi });
    const source = { url: `yofhl-db:league.player_seasons?season_year=${season}`, fetchedAt: (options.now?.() ?? new Date()).toISOString() };
    // Each row joins the featured player it is (keeping birthplace evidence): the same id, or the same name
    // when the cue gave none. This capture's rows come first, so the preview's lookup always finds them.
    const others = [...packet.players];
    const rows = snapshot.players.map((row, i): FeaturedPlayer => {
        const ref = cited[i];
        const at = ref.id
            ? [others.findIndex(p => p.id === ref.id), others.findIndex(p => !p.id && key(p.name) === key(ref.name))].find(n => n >= 0) ?? -1
            : others.findIndex(p => key(p.name) === key(ref.name) && (!row.id || !p.id || p.id === row.id));
        const [existing] = at >= 0 ? others.splice(at, 1) : [unknownPlayer(row.name)];
        return { ...existing, ...row, statsSource: { ...source, season, playerId: row.id } };
    });
    const limitations = [...packet.limitations.filter(note => !note.startsWith('Archived YOFHL stats') && !STALE.includes(note)),
        ...snapshot.diagnostics.map(d => `Archived YOFHL stats: ${snapshotMessage(d, season).message} Resolve with sourced evidence or use an honest graphic fallback.`)];
    return { ...packet,
        players: [...rows, ...others],
        playerSnapshot: { season, refs: cited, diagnostics: snapshot.diagnostics },
        sources: [...packet.sources, source], limitations,
    };
}
