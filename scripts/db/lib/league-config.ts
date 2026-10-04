import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

// typed access to league/league.yml plus the name/abbreviation matching used by the importer

export interface Era {
    from: number;
    to?: number;
    name: string;
    abbreviations: string[];
    owner?: string;
    logo?: string;
    aliases?: string[];
}

export interface Franchise {
    id: number;
    folded?: number;
    eras: Era[];
}

export interface ScoreOverride {
    season: number;
    round: number;
    team: string; // abbreviation
    score: number;
    note: string;
}

export interface LeagueConfig {
    franchises: Franchise[];
    awards: { name: string; label?: string; description: string }[];
    seasons: Record<number, { playoffs?: 'cancelled'; consolation?: string[] }>;
    scoreOverrides: ScoreOverride[];
}

export interface TeamMatch {
    franchise: Franchise;
    era: Era;
}

export const loadLeagueConfig = (path = process.env.YOFHL_LEAGUE_CONFIG ?? 'league/league.yml'): LeagueConfig => {
    const config = parse(readFileSync(path, 'utf8')) as LeagueConfig;
    config.seasons ??= {};
    config.scoreOverrides ??= [];
    return config;
};

// styling differences shouldn't matter: "The Hamhung Hall Monitors" = "Hamhung Hall Monitors",
// "Jagrtown Ice Fellas" = "Jagrtown Icefellas", "Johnny T and the PJs" = "Johnny T & The PJs"
export const normalizeName = (name: string) =>
    name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/^the\s+/, '')
        .replace(/[^a-z0-9]/g, '');

const inEra = (era: Era, season: number) => season >= era.from && (era.to === undefined || season <= era.to);

export const eraFor = (franchise: Franchise, season: number) => franchise.eras.find((era) => inEra(era, season));

export const findByName = (config: LeagueConfig, season: number, fantraxName: string): TeamMatch | null => {
    const wanted = normalizeName(fantraxName);
    for (const franchise of config.franchises) {
        const era = eraFor(franchise, season);
        if (!era) continue;
        const names = [era.name, ...(era.aliases ?? [])].map(normalizeName);
        if (names.includes(wanted)) return { franchise, era };
    }
    return null;
};

export const findByAbbreviation = (config: LeagueConfig, season: number, abbreviation: string): TeamMatch | null => {
    for (const franchise of config.franchises) {
        const era = eraFor(franchise, season);
        if (era?.abbreviations.includes(abbreviation)) return { franchise, era };
    }
    return null;
};

const editDistance = (a: string, b: string) => {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let prev = row[0];
        row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const temp = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = temp;
        }
    }
    return row[b.length];
};

// closest era name across all franchises, to suggest a fix for an unmatched team name
export const suggestEra = (config: LeagueConfig, fantraxName: string) => {
    const wanted = normalizeName(fantraxName);
    let best: { franchise: Franchise; era: Era; distance: number } | null = null;
    for (const franchise of config.franchises) {
        for (const era of franchise.eras) {
            const distance = editDistance(wanted, normalizeName(era.name));
            if (!best || distance < best.distance) best = { franchise, era, distance };
        }
    }
    return best;
};
