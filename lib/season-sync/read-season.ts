// Everything one run reads from Fantrax, checked against the current season before anything is written. Each part
// of the season (team seasons, player seasons, the weeks and regular-season games, the playoff bracket and the
// championship roster, which follows the bracket's champion) turns its validated reads into SyncWrites; a part that cannot be checked
// throws, which fails the whole run before any write. A part that is fine but has something the league owner
// should know adds a warning instead.
import type { LiveSeason } from '@/lib/fantrax/live-season';
import { readChampionshipRoster } from './championship-roster';
import type { CurrentSeason } from './current-season';
import { readBracket } from './playoffs';
import type { FantraxLeagueInfo, SeasonSyncPorts } from './ports';
import { playerSeasonRows, playerSeasonsWrites } from './player-seasons';
import { readRegularSeason } from './regular-season';
import { teamSeasonStandings, teamSeasonsWrite } from './team-seasons';
import type { SyncRunWrite } from './write';

/** Fantrax's league info for the current season (its weeks and daily roster periods), checked to be the same season */
export async function readLeagueInfo(ports: SeasonSyncPorts, season: CurrentSeason): Promise<FantraxLeagueInfo> {
    const info = await ports.fantrax.leagueInfo(season.leagueId);
    if (info.seasonYear !== season.seasonYear) {
        throw new Error(`Fantrax league ${season.leagueId} is the ${info.seasonYear} season, not ${season.seasonYear}.`);
    }
    if (!info.weeks.length) throw new Error(`Fantrax league ${season.leagueId} has no weeks.`);
    return info;
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
    const [standings, players, regularSeason, bracket] = await Promise.all([
        ports.fantrax.standings(season.leagueId),
        ports.fantrax.players(season.leagueId, season.seasonYear),
        readRegularSeason(ports, season, info, live, now),
        readBracket(ports, season, live, now),
    ]);
    const playerSeasons = playerSeasonRows(season, players);
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
