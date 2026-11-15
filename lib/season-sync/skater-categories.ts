// Skater categories (GLOSSARY.md): each skater's goals, assists, shots, hits and blocks, from Fantrax's skater
// table, the read the record book's category export makes. They go onto the player seasons the player season part
// keeps and never create one. A skater the table lists with no games played gets zeros; a goalie, and a player the
// table doesn't list, gets none (null), as every season before 2027 has.
import { PLAYER_STATS, type PlayerCategories, type PlayerStat } from '@/lib/records/player-stats';
import type { PlayerSeasonRow } from './player-seasons';
import type { FantraxSkater } from './ports';

/** a player season's skater categories, each null when not stored */
export type SkaterCategoryTotals = Record<PlayerStat, number | null>;

const NONE: SkaterCategoryTotals = { goals: null, assists: null, shots: null, hits: null, blocks: null };
const ZEROS: PlayerCategories = { goals: 0, assists: 0, shots: 0, hits: 0, blocks: 0 };

/** Each kept player season with its skater categories from Fantrax's skater table, or a rejection when the table has an invalid or repeated skater. */
export function withSkaterCategories<Row extends PlayerSeasonRow>(rows: Row[], skaters: FantraxSkater[]): (Row & SkaterCategoryTotals)[] {
    const table = new Map<string, PlayerCategories>();
    for (const skater of skaters) {
        if (!skater.id || skater.id.includes('*')) throw new Error(`Fantrax's skater table has an invalid player (${JSON.stringify(skater.id)}).`);
        if (table.has(skater.id)) throw new Error(`Fantrax's skater table has player ${skater.id} more than once.`);
        if (skater.categories && PLAYER_STATS.some(({ id }) => !Number.isInteger(skater.categories![id]) || skater.categories![id] < 0)) {
            throw new Error(`Fantrax's skater table has an invalid category total for player ${skater.id}.`);
        }
        table.set(skater.id, skater.categories ?? ZEROS);
    }
    return rows.map(row => ({ ...row, ...(row.positions.includes('G') ? NONE : table.get(row.id) ?? NONE) }));
}
