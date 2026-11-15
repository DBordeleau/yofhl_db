// Skater categories (GLOSSARY.md): each skater's goals, assists, shots, hits and blocks, from Fantrax's skater
// table, the read the record book's category export makes. They go onto the player seasons the player season part
// keeps and never create one. A skater the table lists with no games played gets zeros; a goalie, and a player the
// table doesn't list, gets none (null), as every season before 2027 has.
import { eachCategory, SKATER_CATEGORIES, type PlayerCategories, type PlayerStat } from '@/lib/records/player-stats';
import type { PlayerSeasonRow } from './player-seasons';
import type { FantraxSkater } from './ports';

/** a player season's skater categories, each null when not stored */
export type SkaterCategoryTotals = Record<PlayerStat, number | null>;

const NONE: SkaterCategoryTotals = eachCategory(() => null);
const ZEROS: PlayerCategories = eachCategory(() => 0);

/** Each kept player season with its skater categories from Fantrax's skater table, or a rejection when the table has an invalid or repeated skater. */
export function withSkaterCategories<Row extends PlayerSeasonRow>(rows: Row[], skaters: FantraxSkater[]): (Row & SkaterCategoryTotals)[] {
    const table = new Map<string, PlayerCategories>();
    for (const skater of skaters) {
        if (!skater.id || skater.id.includes('*')) throw new Error(`Fantrax's skater table has an invalid player (${JSON.stringify(skater.id)}).`);
        if (table.has(skater.id)) throw new Error(`Fantrax's skater table has player ${skater.id} more than once.`);
        if (skater.categories && SKATER_CATEGORIES.some(category => !Number.isInteger(skater.categories![category]) || skater.categories![category] < 0)) {
            throw new Error(`Fantrax's skater table has an invalid category total for player ${skater.id}.`);
        }
        table.set(skater.id, skater.categories ?? ZEROS);
    }
    return rows.map(row => ({ ...row, ...(row.positions.includes('G') ? NONE : table.get(row.id) ?? NONE) }));
}
