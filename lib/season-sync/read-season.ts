// Everything one run reads from Fantrax, checked against the current season before anything is written. Each part
// of the season (team seasons, player seasons with their skater categories, the weeks and regular-season games,
// the playoff bracket and the championship roster, which follows the bracket's champion) turns its validated reads
// into SyncWrites; a part that cannot be checked throws, which fails the whole run before any write. A part that is fine but has something the league owner
// should know adds a warning instead.
import type { LiveSeason } from '@/lib/fantrax/live-season';
import { readChampionshipRoster } from './championship-roster';
import type { CurrentSeason } from './current-season';
import { readBracket } from './playoffs';
import type { FantraxLeagueInfo, FantraxWeek, SeasonSyncPorts } from './ports';
import { playerSeasonRows, playerSeasonsWrites } from './player-seasons';
import { withSkaterCategories } from './skater-categories';
import { readRegularSeason } from './regular-season';
import { teamSeasonStandings, teamSeasonsWrite } from './team-seasons';
import type { SyncRunWrite } from './write';

const HOUR = 3600 * 1000;
const easternClock = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const easternHour = (time: number) => Number(easternClock.format(time).slice(0, 2));

/**
 * A week ending at its last second. Fantrax ends a week a second before the next week's first game; an end at
 * midnight Eastern names the week's last day, so the week ends a second before the following midnight instead.
 */
function endingAtItsLastSecond(week: FantraxWeek): FantraxWeek {
    const end = Date.parse(week.endDate);
    if (easternClock.format(end) !== '00:00:00' || end % 1000) return week;
    // a day is 23 or 25 hours long when the clocks change
    const next = end + 24 * HOUR, hour = easternHour(next);
    const midnight = hour === 23 ? next + HOUR : hour === 1 ? next - HOUR : next;
    return { ...week, endDate: new Date(midnight - 1000).toISOString() };
}

/** Fantrax's league info for the current season (its weeks, each ending at its last second, and daily roster periods), checked to be the same season */
export async function readLeagueInfo(ports: SeasonSyncPorts, season: CurrentSeason): Promise<FantraxLeagueInfo> {
    const info = await ports.fantrax.leagueInfo(season.leagueId);
    if (info.seasonYear !== season.seasonYear) {
        throw new Error(`Fantrax league ${season.leagueId} is the ${info.seasonYear} season, not ${season.seasonYear}.`);
    }
    if (!info.weeks.length) throw new Error(`Fantrax league ${season.leagueId} has no weeks.`);
    return { ...info, weeks: info.weeks.map(endingAtItsLastSecond) };
}

/** the live season, checked to be the current season: its weeks' stages and final weeks, and the playoff bracket */
async function liveSeasonOf(ports: SeasonSyncPorts, season: CurrentSeason, now: number): Promise<LiveSeason> {
    const result = await ports.liveSeason.getLiveSeason({ now });
    if (result.status !== 'available') throw new Error('The live season is unavailable, so its weeks could not be read.');
    const live = result.value;
    if (live.seasonYear !== season.seasonYear || live.fantraxLeagueId !== season.leagueId) {
        throw new Error(`The live season is Fantrax league ${live.fantraxLeagueId}'s ${live.seasonYear} season, not ${season.leagueId}'s ${season.seasonYear}.`);
    }
    return live;
}

/** every other read, checked, as the run's write: the writes that bring the archive up to date and their warnings */
export async function readSeason(ports: SeasonSyncPorts, season: CurrentSeason, info: FantraxLeagueInfo, now: number): Promise<SyncRunWrite> {
    const live = await liveSeasonOf(ports, season, now);
    const [standings, players, skaters, regularSeason, bracket] = await Promise.all([
        ports.fantrax.standings(season.leagueId),
        ports.fantrax.players(season.leagueId, season.seasonYear),
        ports.fantrax.skaters(season.leagueId, season.seasonYear),
        readRegularSeason(ports, season, info, live, now),
        readBracket(ports, season, live, now),
    ]);
    const playerSeasons = withSkaterCategories(playerSeasonRows(season, players), skaters);
    const roster = await readChampionshipRoster(ports, season, info, bracket.champion, new Set(playerSeasons.map(row => row.id)));
    return {
        writes: [
            teamSeasonsWrite(season.seasonYear, teamSeasonStandings(season, standings)),
            ...playerSeasonsWrites(season.seasonYear, playerSeasons, roster.players),
            ...regularSeason,
            ...bracket.writes,
            ...roster.writes,
        ],
        warnings: [...bracket.warnings, ...roster.warnings],
        autoRosterFranchiseId: roster.autoRosterFranchiseId,
    };
}
