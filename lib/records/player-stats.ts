export const PLAYER_STATS = [
    { id: 'goals', label: 'Goals', column: 'G' },
    { id: 'assists', label: 'Assists', column: 'A' },
    { id: 'shots', label: 'Shots on goal', column: 'SOG' },
    { id: 'hits', label: 'Hits', column: 'Hit' },
    { id: 'blocks', label: 'Blocks', column: 'Blk' },
] as const;
export type PlayerStat = typeof PLAYER_STATS[number]['id'];
export type PlayerCategories = Record<PlayerStat, number>;
/** the skater categories (GLOSSARY.md), in the skater table's order: also the player_seasons columns that store them */
export const SKATER_CATEGORIES: readonly PlayerStat[] = PLAYER_STATS.map(stat => stat.id);
/** a value for each skater category */
export const eachCategory = <T>(value: (category: PlayerStat) => T) =>
    Object.fromEntries(SKATER_CATEGORIES.map(category => [category, value(category)])) as Record<PlayerStat, T>;
export interface CategorySeason extends PlayerCategories { id: string; year: number }

