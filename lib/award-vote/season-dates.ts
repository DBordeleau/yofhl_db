// The season's date ranges the award vote reads Fantrax over, from that season's own Fantrax league info: the
// fantasy regular season, the playoff rounds and the Final. Pure, so every stat set takes its dates from here.
//
// A roster period (GLOSSARY.md) belongs to the week it starts in, and its game date is the Eastern calendar date it
// starts on (a period starting at 10:30 p.m. Eastern is that day's, though it is the next day in UTC). A stretch of
// weeks covers the game dates of the roster periods that start inside it. The regular season is every week before
// Fantrax's first playoff week, the playoff rounds are the rest, and the Final is the last week.
import type { DateRange } from './model';
import type { AwardVoteLeagueInfo } from './ports';

export interface SeasonDates {
    regularSeason: DateRange;
    /** every playoff round, the Final included */
    playoffRounds: DateRange;
    final: DateRange;
    /** the roster periods of the Final, in order */
    finalRosterPeriods: number[];
}

const EASTERN_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' });

/** the Eastern calendar date an instant falls on, `YYYY-MM-DD` */
export const easternDate = (instant: string | number) => EASTERN_DATE.format(new Date(instant));

export function seasonDates({ weeks, rosterPeriods, firstPlayoffWeek }: AwardVoteLeagueInfo): SeasonDates {
    const last = Math.max(...weeks.map(week => week.number));
    if (!weeks.some(week => week.number === firstPlayoffWeek) || !weeks.some(week => week.number < firstPlayoffWeek)) {
        throw new Error(`Fantrax's first playoff week ${firstPlayoffWeek} does not split the season's weeks`);
    }
    const weekOf = (instant: string) => weeks.find(week =>
        Date.parse(week.startDate) <= Date.parse(instant) && Date.parse(instant) <= Date.parse(week.endDate))?.number;
    const periods = rosterPeriods.map(period => ({ number: period.number, week: weekOf(period.startDate), date: easternDate(period.startDate) }));
    const over = (label: string, inside: (week: number) => boolean) => {
        const days = periods.filter(period => period.week !== undefined && inside(period.week));
        if (!days.length) throw new Error(`Fantrax's league info has no roster periods in the ${label}`);
        const dates = days.map(day => day.date).sort();
        return { range: { startDate: dates[0], endDate: dates.at(-1)! }, periods: days.map(day => day.number).sort((a, b) => a - b) };
    };
    const final = over('Final', week => week === last);
    return {
        regularSeason: over('regular season', week => week < firstPlayoffWeek).range,
        playoffRounds: over('playoff rounds', week => week >= firstPlayoffWeek).range,
        final: final.range,
        finalRosterPeriods: final.periods,
    };
}
