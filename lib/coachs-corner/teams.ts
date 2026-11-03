import type { PlayerRef } from './script';

// Scripts refer to teams loosely: an abbreviation (HH), an owner's first name (Jeremy) or a word from
// the team name (Hooterville). The monitor resolves them against the league's current franchises.

export interface StudioTeam {
    id: number;
    name: string;
    abbreviation: string;
    owner: string | null;
    ownerFirst: string | null;
    logo: string | null;
    primary: string;
    secondary: string;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

export const findTeam = (teams: StudioTeam[], ref: string | undefined): StudioTeam | null => {
    if (!ref) return null;
    const key = norm(ref);
    if (!key) return null;
    return teams.find(t => norm(t.abbreviation) === key)
        ?? teams.find(t => t.ownerFirst && norm(t.ownerFirst) === key)
        ?? teams.find(t => norm(t.name) === key)
        ?? teams.find(t => t.name.split(/\s+/).some(word => norm(word) === key && key.length > 2))
        ?? null;
};

// A row of an episode's player snapshot (GLOSSARY.md): a cited player's stats-season fantasy line and headshot.
export interface StudioPlayer {
    /** Fantrax id without asterisks; episodes published before ids were stored have none */
    id?: string | null;
    name: string;
    headshot: string | null;
    nhlTeam: string | null;
    positions: string[];
    season: number | null;
    fpts: number | null;
    fpg: number | null;
    games: number | null;
}

/** a championship banner in the rafters */
export interface StudioBanner {
    label: string;
    team: string;
    abbreviation: string;
    primary: string;
    secondary: string;
}

/** by Fantrax id when the cue has one, then by name: rows stored before ids, and bare names */
export const findPlayer = (players: StudioPlayer[], ref: PlayerRef) =>
    (ref.id ? players.find(p => p.id === ref.id) : undefined) ?? players.find(p => norm(p.name) === norm(ref.name)) ?? null;
