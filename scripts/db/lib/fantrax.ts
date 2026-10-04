import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

// parsers for the three Fantrax exports we keep per season:
//   "<YYYY-YYYY> Player Stats.csv"  one row per NHL player
//   "<YYYY-YYYY> Team Stats.csv"     standings tables (one per division) + the last two scoring periods
//   "<YYYY-YYYY> Playoffs.csv"       playoff standings + one table per round

export interface PlayerStatRow {
    id: string;
    name: string;
    nhlTeam: string | null;
    positions: string[];
    fantasyTeam: string | null; // abbreviation, null for free agents and waivers
    fpts: number;
    fpg: number;
}

export interface StandingRow {
    division: number;
    divisionRank: number;
    team: string;
    wins: number;
    losses: number;
    ties: number;
    fptsFor: number;
    fptsAgainst: number;
}

export interface PlayoffGameRow {
    round: number;
    away: string;
    awayScore: number;
    home: string;
    homeScore: number;
}

interface Section {
    title: string;
    header: string[];
    rows: string[][];
}

const toNumber = (value: string | undefined) => {
    const n = parseFloat((value ?? '').replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
};

const readCsv = (file: string): string[][] =>
    parse(readFileSync(file, 'utf8'), { bom: true, relax_column_count: true, skip_empty_lines: false });

// Fantrax "standings" style exports are several tables stacked with blank lines between them,
// each starting with a one-cell title row and then a header row
const readSections = (file: string): Section[] => {
    const sections: Section[] = [];
    let current: Section | null = null;
    for (const row of readCsv(file)) {
        const cells = row.filter((cell) => cell !== '');
        if (cells.length === 0) {
            current = null;
            continue;
        }
        if (!current) {
            if (row.length !== 1) throw new Error(`${file}: expected a section title, got ${row.join(',')}`);
            current = { title: row[0], header: [], rows: [] };
            sections.push(current);
        } else if (current.header.length === 0) {
            current.header = row;
        } else {
            current.rows.push(row);
        }
    }
    return sections;
};

const column = (section: Section, name: string, file: string) => {
    const index = section.header.indexOf(name);
    if (index === -1) throw new Error(`${file}: "${section.title}" has no ${name} column`);
    return index;
};

export const parsePlayerStats = (file: string): PlayerStatRow[] => {
    const records: Record<string, string>[] = parse(readFileSync(file, 'utf8'), { bom: true, columns: true });
    return records.map((r) => {
        const status = r.Status?.trim() ?? '';
        // "FA" and waiver claims like "W <small>(Sat)</small>" mean the player was unrostered
        const fantasyTeam = status === '' || status === 'FA' || status.startsWith('W ') ? null : status;
        return {
            id: r.ID,
            name: r.Player,
            nhlTeam: r.Team && r.Team !== '(N/A)' ? r.Team : null,
            positions: (r.Position ?? '').split(',').map((p) => p.trim()).filter(Boolean),
            fantasyTeam,
            fpts: toNumber(r.FPts),
            fpg: toNumber(r['FP/G']),
        };
    });
};

export const parseStandings = (file: string): StandingRow[] => {
    const tables = readSections(file).filter((s) => s.title === 'Standings');
    if (tables.length === 0) throw new Error(`${file}: no Standings table`);
    return tables.flatMap((table, i) => {
        const col = (name: string) => column(table, name, file);
        const ties = table.header.indexOf('T');
        return table.rows.map((r) => ({
            division: i + 1,
            divisionRank: parseInt(r[col('Rk')], 10),
            team: r[col('Team')],
            wins: toNumber(r[col('W')]),
            losses: toNumber(r[col('L')]),
            ties: ties === -1 ? 0 : toNumber(r[ties]),
            fptsFor: toNumber(r[col('FPtsF')]),
            fptsAgainst: toNumber(r[col('FPtsA')]),
        }));
    });
};

export const parsePlayoffs = (file: string): PlayoffGameRow[] =>
    readSections(file)
        .filter((s) => s.title.startsWith('Playoffs - Round'))
        .flatMap((section) => {
            const round = parseInt(section.title.replace(/\D+/g, ''), 10);
            const away = column(section, 'Away', file);
            const home = column(section, 'Home', file);
            // some seasons export "FPts, Adj, Total" per side; Total includes commissioner adjustments
            const totalAfter = (start: number, end: number) => {
                const total = section.header.findIndex((h, i) => h === 'Total' && i > start && i < end);
                return total === -1 ? start + 1 : total;
            };
            const awayScore = totalAfter(away, home);
            const homeScore = totalAfter(home, section.header.length);
            return section.rows.map((r) => ({
                round,
                away: r[away],
                awayScore: toNumber(r[awayScore]),
                home: r[home],
                homeScore: toNumber(r[homeScore]),
            }));
        });
