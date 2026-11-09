import type { Diagnostic, PlayerRef, TeamRef } from './script';

// Scripts refer to teams loosely: an abbreviation (HH), an owner's first name (Jeremy) or a word from
// the team name (Hooterville). Every surface resolves them here, against one studio team list: the
// draft check against the fact packet's, the editor and Publish against the live one, and an episode
// page against its team snapshot (GLOSSARY.md).

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

export type TeamMatch =
    | { kind: 'team'; team: StudioTeam }
    | { kind: 'unknown' }
    | { kind: 'ambiguous'; candidates: StudioTeam[] };
export type ResolvedTeamRef = TeamRef & TeamMatch;

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

// in order: the first tier with any match decides. Only the current abbreviation counts.
const TIERS: ((team: StudioTeam, key: string) => boolean)[] = [
    (t, key) => norm(t.abbreviation) === key,
    (t, key) => !!t.ownerFirst && norm(t.ownerFirst) === key,
    (t, key) => norm(t.name) === key,
    (t, key) => key.length > 2 && t.name.split(/\s+/).some(word => norm(word) === key),
];

const matchTeam = (teams: StudioTeam[], ref: string): TeamMatch => {
    const key = norm(ref);
    if (!key) return { kind: 'unknown' };
    for (const tier of TIERS) {
        const found = [...new Map(teams.filter(t => tier(t, key)).map(t => [t.id, t])).values()];
        if (found.length === 1) return { kind: 'team', team: found[0] };
        if (found.length > 1) return { kind: 'ambiguous', candidates: found };
    }
    return { kind: 'unknown' };
};

export const resolveTeams = (teams: StudioTeam[], refs: TeamRef[]): ResolvedTeamRef[] =>
    refs.map(ref => ({ ...ref, ...matchTeam(teams, ref.ref) }));

/** the monitor's lookup: the team a cue was checked against, or none when it's unknown or ambiguous */
export const findTeam = (teams: StudioTeam[], ref: string | undefined): StudioTeam | null => {
    if (!ref) return null;
    const match = matchTeam(teams, ref);
    return match.kind === 'team' ? match.team : null;
};

/** The wording the draft check, the editor and Publish share. A cue that isn't exactly one team is an error. */
export const teamDiagnostics = (teams: StudioTeam[], refs: TeamRef[]): Diagnostic[] =>
    resolveTeams(teams, refs).flatMap((result): Diagnostic[] => {
        if (result.kind === 'team') return [];
        const message = result.kind === 'unknown'
            ? `No team matches “${result.ref}”. Use an abbreviation (${teams.map(t => t.abbreviation).join(', ')}), an owner’s first name or a team name.`
            : `“${result.ref}” matches ${result.candidates.length} teams: ${result.candidates
                .map(t => `${t.abbreviation} (${t.name}, ${t.owner ?? 'no owner'})`).join(', ')}. Use the abbreviation of the one you mean.`;
        return [{ line: result.line, severity: 'error', message }];
    });

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

/** by Fantrax id when the cue has one, then by name among rows stored before ids; a bare name by name */
export const findPlayer = (players: StudioPlayer[], ref: PlayerRef) => {
    const named = (p: StudioPlayer) => norm(p.name) === norm(ref.name);
    return (ref.id ? players.find(p => p.id === ref.id) ?? players.find(p => !p.id && named(p)) : players.find(named)) ?? null;
};
