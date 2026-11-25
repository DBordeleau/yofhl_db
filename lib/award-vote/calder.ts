// The Calder rule, which decides who is a rookie for the Teemu Trophy: a player is Calder-eligible for a season when
// they are under 26 on September 15 of its first year, have played no more than 25 NHL regular-season games in any
// earlier season, and have not played six or more in each of any two earlier seasons. Pure.
import { ageOn, type NhlPlayer } from '@/lib/nhl/model';

/** the day a season's rookies' ages are counted on: September 15 of its first year */
const ageDay = (seasonYear: number) => `${seasonYear - 1}-09-15`;

/**
 * Whether the NHL player is Calder-eligible for the season, or null when their record can't be judged (no birth
 * date, no season history, or a season's games missing): the admin decides on them by hand.
 */
export function calderEligible(player: Pick<NhlPlayer, 'birthDate' | 'seasons'>, seasonYear: number): boolean | null {
    const age = ageOn(player.birthDate, ageDay(seasonYear));
    if (age === null || player.seasons === null) return null;
    const seasons = Object.entries(player.seasons).map(([year, line]) => ({ seasonYear: Number(year), games: line.games }));
    if (seasons.some(({ games }) => games === null)) return null;
    if (age >= 26) return false;
    const earlier = seasons.filter(season => season.seasonYear < seasonYear).map(({ games }) => games!);
    if (earlier.some(games => games > 25)) return false;
    return earlier.filter(games => games >= 6).length < 2;
}

/**
 * Whether a player Fantrax says is `age` today (`YYYY-MM-DD`) could be under 26 on the season's age day, so is worth
 * looking up; a player of unknown age always is.
 */
export function mightBeCalderEligible(age: number | null, seasonYear: number, today: string): boolean {
    if (age === null) return true;
    // the oldest a rookie can be: born the day after the season's age day, 26 years before it
    const oldest = ageOn(`${seasonYear - 27}-09-16`, today);
    return oldest === null || age <= oldest;
}
