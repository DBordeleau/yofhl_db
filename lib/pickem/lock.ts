// The lock (GLOSSARY.md): noon in America/Toronto on the calendar date, in America/Toronto, of the week's start.
// Computed from the live season's week start, so it follows daylight saving and weeks that don't start on Monday.

const TIME_ZONE = 'America/Toronto';
const wallClockFormat = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** Toronto's wall clock at `time`, as if it were UTC */
function wallClock(time: number) {
    const part = Object.fromEntries(wallClockFormat.formatToParts(time).map(({ type, value }) => [type, Number(value)]));
    return Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute, part.second);
}

/** how far Toronto's wall clock is from UTC at `time` */
const offsetAt = (time: number) => wallClock(time) - (time - time % 1000);

/** the lock of a week starting at `startDate` (ISO), as an ISO timestamp */
export function lockOf(startDate: string): string {
    const startDay = new Date(wallClock(Date.parse(startDate)));
    const noon = Date.UTC(startDay.getUTCFullYear(), startDay.getUTCMonth(), startDay.getUTCDate(), 12);
    // Noon is never inside a daylight saving jump (they happen overnight), so the offset in force a few hours
    // either side of it settles on the right one in a second pass.
    const firstGuess = noon - offsetAt(noon);
    return new Date(noon - offsetAt(firstGuess)).toISOString();
}
