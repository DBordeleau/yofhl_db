// The one definition of which seasons the site shows (see "Seasons" in GLOSSARY.md).
// Pure and serializable so the header, banners and picker can take it as a prop.

export const seasonLabel = (year: number) => `${year - 1}–${String(year).slice(2)}`;

export interface SeasonRow {
    year: number;
    playoffStatus: 'complete' | 'cancelled';
    team: string | null;
}

export interface SeasonArchive<T extends SeasonRow = SeasonRow> {
    /** every season in the database, oldest first */
    seasons: T[];
    /** seasons with a champion or cancelled playoffs, newest first */
    published: T[];
    latest: T | null;
    /** the newest unpublished season, while one is being played or imported */
    current: T | null;
}

const published = (season: SeasonRow) => season.team !== null || season.playoffStatus === 'cancelled';

export function seasonArchive<T extends SeasonRow>(rows: T[]): SeasonArchive<T> {
    const seasons = [...rows].sort((a, b) => a.year - b.year);
    const newestFirst = [...seasons].reverse();
    const list = newestFirst.filter(published);
    return { seasons, published: list, latest: list[0] ?? null, current: newestFirst.find(season => !published(season)) ?? null };
}

export const isPublished = (archive: SeasonArchive, year: number) => archive.published.some(season => season.year === year);

/** the published seasons either side of a year, for prev/next controls */
export function neighbours(archive: SeasonArchive, year: number): { newer: number | null; older: number | null } {
    const years = archive.published.map(season => season.year);
    return { newer: years.filter(value => value > year).at(-1) ?? null, older: years.find(value => value < year) ?? null };
}
