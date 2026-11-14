// Everything one run reads from Fantrax, checked against the opened season before anything is written. Each part
// of the season (team seasons, player seasons) turns its validated reads into one SyncWrite; a part that cannot be checked
// throws, which fails the whole run before any write. A part that is fine but has something the league owner
// should know adds a warning instead.
import type { OpenedSeason } from './opened-season';
import type { FantraxWeek, SeasonSyncPorts } from './ports';
import { playerSeasonRows, playerSeasonsWrites } from './player-seasons';
import { teamSeasonStandings, teamSeasonsWrite } from './team-seasons';
import type { SyncWrite } from './write';

export interface SeasonRead {
    writes: SyncWrite[];
    warnings: string[];
}

/** Fantrax's weeks for the opened season, checked to be the same season */
export async function readWeeks(ports: SeasonSyncPorts, season: OpenedSeason): Promise<FantraxWeek[]> {
    const info = await ports.fantrax.leagueInfo(season.leagueId);
    if (info.seasonYear !== season.seasonYear) {
        throw new Error(`Fantrax league ${season.leagueId} is the ${info.seasonYear} season, not ${season.seasonYear}.`);
    }
    if (!info.weeks.length) throw new Error(`Fantrax league ${season.leagueId} has no weeks.`);
    return info.weeks;
}

/** every other read, checked, as the writes that bring the archive up to date */
export async function readSeason(ports: SeasonSyncPorts, season: OpenedSeason): Promise<SeasonRead> {
    const [standings, players] = await Promise.all([
        ports.fantrax.standings(season.leagueId),
        ports.fantrax.players(season.leagueId, season.seasonYear),
    ]);
    return {
        writes: [
            teamSeasonsWrite(season.seasonYear, teamSeasonStandings(season, standings)),
            ...playerSeasonsWrites(season.seasonYear, playerSeasonRows(season, players)),
        ],
        warnings: [],
    };
}
