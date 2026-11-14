// Championship roster: written once the season has a champion, so rings are on the site the night the Final ends.
// The league owner trims it in the roster editor afterwards.
//
// The champion's run is the playoff weeks it played a game in (a bye week is not one). The roster is everyone on
// the champion's roster in any slot but the minors on any daily roster period starting inside those weeks: a
// single day counts, and injured reserve counts. A player with no player row or season this year (dropped since,
// with no points) is given both, named from Fantrax's player directory.
//
// The rule depends on what is stored, not on what this run changed (a level Final gets its winner from bracket
// review, between runs). The roster is written when the season has none, unless the league owner saved it empty for
// this champion; the status row then records the franchise it was written for, until the roster is saved in admin.
// If the champion changes while that record stands (a stat correction flips the Final), the automatic roster is
// replaced with the new champion's. A roster the league owner saved is left alone, with a warning if it was saved
// for another champion (the Final flipped since). Once written for the champion, the roster's daily reads are not
// made again.
import { sql } from 'drizzle-orm';
import { rows } from '@/lib/data/db';
import type { CurrentSeason } from './current-season';
import type { Champion } from './playoffs';
import type { FantraxDayRosters, FantraxLeagueInfo, SeasonSyncPorts } from './ports';
import type { SyncWrite } from './write';

export interface ChampionshipRosterRead {
    writes: SyncWrite[];
    warnings: string[];
    /** the players of the roster this run writes, which the player season part must keep */
    players: string[];
    /** the champion's franchise, when this run writes its automatic roster */
    autoRosterFranchiseId?: number;
}

const NOTHING: ChampionshipRosterRead = { writes: [], warnings: [], players: [] };
/** daily rosters read at once */
const READS_AT_ONCE = 7;

const rosterRecordQuery = (seasonYear: number) => sql`
    select (select count(*)::int from league.championship_rosters c where c.season_year = ${seasonYear}) as players,
           st.auto_roster_franchise_id as "autoRosterFranchiseId", st.saved_roster_franchise_id as "savedRosterFranchiseId"
    from (select 1) one
    left join league.season_sync_status st on st.season_year = ${seasonYear}`;

/** The championship roster to write in this run, if any, read from Fantrax and checked. `listed` are the players in Fantrax's player table this run. */
export async function readChampionshipRoster(ports: SeasonSyncPorts, season: CurrentSeason, info: FantraxLeagueInfo,
    champion: Champion | null, listed: ReadonlySet<string>): Promise<ChampionshipRosterRead> {
    if (!champion) return NOTHING;
    const team = season.teamOf(champion.teamSeasonId);
    if (!team) throw new Error(`The champion, team season ${champion.teamSeasonId}, is not a ${season.seasonYear} team the league configuration maps.`);
    const [record] = await rows<{ players: number; autoRosterFranchiseId: number | null; savedRosterFranchiseId: number | null }>(rosterRecordQuery(season.seasonYear));
    const franchise = team.franchiseId;
    const { autoRosterFranchiseId: auto, savedRosterFranchiseId: saved } = record;
    // none yet (unless saved empty for this champion), or an automatic one written for another champion
    const rosterDue = record.players === 0 ? saved !== franchise : auto !== null && auto !== franchise;
    if (!rosterDue) {
        // a roster saved for one champion when the Final has since flipped to another
        const flipped = record.players > 0 && auto === null && saved !== null && saved !== franchise;
        return flipped
            ? { ...NOTHING, warnings: [`The championship roster was saved in admin before ${champion.name} won the Final, so the season sync left it alone. Check it in the roster editor.`] }
            : NOTHING;
    }

    const days = champion.weeks.flatMap(number => {
        const week = info.weeks.find(candidate => candidate.number === number);
        const inWeek = week ? info.rosterPeriods.filter(period =>
            Date.parse(period.startDate) >= Date.parse(week.startDate) && Date.parse(period.startDate) <= Date.parse(week.endDate)) : [];
        if (!inWeek.length) throw new Error(`Fantrax has no daily roster periods in week ${number}, so ${champion.name}'s championship roster could not be read.`);
        return inWeek.map(period => period.number);
    });
    const rosters: FantraxDayRosters[] = [];
    for (let index = 0; index < days.length; index += READS_AT_ONCE) {
        rosters.push(...await Promise.all(days.slice(index, index + READS_AT_ONCE).map(day => ports.fantrax.dayRosters(season.leagueId, day))));
    }
    const players = [...new Set(rosters.flatMap((day, index) => {
        const roster = day[team.fantraxTeamId];
        if (!Array.isArray(roster)) throw new Error(`Fantrax's rosters for roster period ${days[index]} have no team ${team.fantraxTeamId}, the champion.`);
        return roster.filter(player => player.status !== 'MINORS').map(player => player.id);
    }))];
    if (!players.length) throw new Error(`Fantrax's rosters have no one on ${champion.name}'s roster outside the minors during its playoff run.`);

    // Players Fantrax's table doesn't list this run (dropped, with no points) may have no player row or season.
    const unlisted = players.filter(id => !listed.has(id));
    const directory = unlisted.length ? await ports.fantrax.playerDirectory() : {};
    const newcomers = unlisted.map(id => {
        const player = directory[id];
        if (!player?.name) throw new Error(`Fantrax's player directory has no player ${id}, on ${champion.name}'s championship roster.`);
        return { id, name: player.name, positions: player.positions, nhlTeam: player.nhlTeam };
    });
    return { writes: championshipRosterWrites(season.seasonYear, players, newcomers), warnings: [], players, autoRosterFranchiseId: franchise };
}

/**
 * The roster as four parts on disjoint rows: player rows and free-agent player seasons with no points for the
 * players Fantrax's table doesn't list and the archive doesn't have (the player season part leaves both alone),
 * the removal of roster players not on it, and the insert of those not yet on it.
 */
function championshipRosterWrites(seasonYear: number, players: string[], newcomers: { id: string; name: string; positions: string[]; nhlTeam: string | null }[]): SyncWrite[] {
    const payload = sql`jsonb_to_recordset(${JSON.stringify(newcomers)}::jsonb) as n(id text, name text, positions text[], "nhlTeam" text)`;
    const roster = sql`(select jsonb_array_elements_text(${JSON.stringify(players)}::jsonb))`;
    return [{
        // a new player and their season always come with a roster player, which is what counts
        count: null,
        change: 'roster',
        statement: sql`
            insert into league.players (id, name)
            select n.id, n.name from ${payload}
            where not exists (select 1 from league.players p where p.id = n.id)
            on conflict (id) do nothing
            returning id`,
    }, {
        count: null,
        change: 'roster',
        statement: sql`
            insert into league.player_seasons (player_id, season_year, team_season_id, nhl_team, positions, fpts, fpg)
            select n.id, ${seasonYear}, null, n."nhlTeam", n.positions, 0, 0 from ${payload}
            where not exists (select 1 from league.player_seasons ps where ps.player_id = n.id and ps.season_year = ${seasonYear})
            on conflict (player_id, season_year) do nothing
            returning player_id`,
    }, {
        count: 'championshipRoster',
        change: 'roster',
        statement: sql`
            delete from league.championship_rosters c
            where c.season_year = ${seasonYear} and c.player_id not in ${roster}
            returning c.player_id`,
    }, {
        count: 'championshipRoster',
        change: 'roster',
        statement: sql`
            insert into league.championship_rosters (season_year, player_id)
            select ${seasonYear}, r.id from jsonb_array_elements_text(${JSON.stringify(players)}::jsonb) as r(id)
            on conflict do nothing
            returning player_id`,
    }];
}
