// What Pick'em's operations share: the launch setting, its weeks of the live season, and the shapes callers get.
import type { LiveSeason } from '@/lib/fantrax/live-season';
import { lockOf } from './lock';

/** The season year and week the first Pick'em starts at. Every later season starts at its own first week. */
export interface PickemLaunch {
    seasonYear: number;
    week: number;
}

/** A franchise in a matchup, with the identity it shows in that season */
export interface PickemFranchise {
    id: number;
    name: string;
    abbreviation: string;
    logo: string | null;
}

export interface PickemMatchup {
    away: PickemFranchise;
    home: PickemFranchise;
}

/** A matchup as Pick'em keys it: its two franchises, the lower id first */
export type MatchupPair = [low: number, high: number];

export const pairOf = (a: number, b: number): MatchupPair => a < b ? [a, b] : [b, a];
export const samePair = (a: MatchupPair, b: MatchupPair) => a[0] === b[0] && a[1] === b[1];
export const pairOfMatchup = (matchup: PickemMatchup) => pairOf(matchup.away.id, matchup.home.id);

/** One Pick'em pick: the matchup and the franchise picked to win it */
export interface PickemPick {
    matchup: MatchupPair;
    picked: number;
}

/** A Pick'em week of the live season, as the live season has it now */
export interface LivePickemWeek {
    seasonYear: number;
    week: number;
    /** "Week 5" */
    name: string;
    /** ISO timestamp */
    lock: string;
    matchups: PickemMatchup[];
}

/** The first week of a season's Pick'em, or null when that season has none */
export function firstPickemWeek(seasonYear: number, launch: PickemLaunch | null): number | null {
    if (!launch || seasonYear < launch.seasonYear) return null;
    return seasonYear === launch.seasonYear ? launch.week : 1;
}

/**
 * The live season's Pick'em weeks: its regular-season weeks from the contest's first week on, each with its lock
 * and pairings. A franchise with a bye, an unseeded slot and a Fantrax team with no franchise have no matchup.
 */
export function livePickemWeeks(live: LiveSeason, launch: PickemLaunch | null): LivePickemWeek[] {
    const first = firstPickemWeek(live.seasonYear, launch);
    if (first === null) return [];
    const franchises = new Map(live.teams.flatMap(team => team.franchiseId === null ? [] : [[team.id, {
        id: team.franchiseId, name: team.name, abbreviation: team.abbreviation, logo: team.logo,
    }] as const]));
    return live.weeks.filter(week => week.stage === 'regular' && week.number >= first).map(week => ({
        seasonYear: live.seasonYear, week: week.number, name: week.name, lock: lockOf(week.startDate),
        matchups: week.matchups.flatMap(({ away, home }) => {
            const awayFranchise = away.id ? franchises.get(away.id) : undefined;
            const homeFranchise = home.id ? franchises.get(home.id) : undefined;
            return awayFranchise && homeFranchise ? [{ away: awayFranchise, home: homeFranchise }] : [];
        }),
    }));
}
