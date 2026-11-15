// The Calder rule, which decides who is a rookie for the Teemu Trophy: a player is Calder-eligible for a season when
// they are under 26 on September 15 of its first year, have played no more than 25 NHL regular-season games in any
// earlier season, and have not played six or more in each of any two earlier seasons. Pure.
import { nhlSeasonId } from '@/lib/fantrax/season';
import { playerAge } from '@/lib/keepers/player-details';
import type { NhlPlayerRecord } from './ports';

/** the day a season's rookies' ages are counted on: September 15 of its first year */
const ageDay = (seasonYear: number) => `${seasonYear - 1}-09-15`;

export function calderEligible(record: NhlPlayerRecord, seasonYear: number): boolean {
    const age = playerAge(record.birthDate, ageDay(seasonYear));
    if (age === null || age >= 26) return false;
    const earlier = record.seasons.filter(({ season }) => season < nhlSeasonId(seasonYear));
    if (earlier.some(({ games }) => games > 25)) return false;
    return earlier.filter(({ games }) => games >= 6).length < 2;
}

/**
 * Whether a player Fantrax says is `age` today (`YYYY-MM-DD`) could be under 26 on the season's age day, so is worth
 * looking up; a player of unknown age always is.
 */
export function mightBeCalderEligible(age: number | null, seasonYear: number, today: string): boolean {
    if (age === null) return true;
    // the oldest a rookie can be: born the day after the season's age day, 26 years before it
    const oldest = playerAge(`${seasonYear - 27}-09-16`, today);
    return oldest === null || age <= oldest;
}
