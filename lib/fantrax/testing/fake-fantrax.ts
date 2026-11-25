// A fake Fantrax for tests of the production live season (a disposable league's `fetch`): a two-team league for
// 2027, mapped to two franchises by SEED. Also the season sync's production goalie read over a page a test gives.
import { createFantraxClient } from '../fantrax-client';

export const LEAGUE = 'league27';

/** the season sync's production goalie read (the Fantrax client's goalie table), with Fantrax answering every request with `page` */
export const goalieTableServing = (page: unknown) => (leagueId: string, seasonYear: number) =>
    createFantraxClient(async () => Response.json(page)).goalieTable(leagueId, seasonYear);

/** the two franchises and the Fantrax team mapping of FAKE_FANTRAX's league */
export const SEED = `
    insert into league.franchises (id, display_name, first_season) values (1, 'One', 2026), (2, 'Two', 2026);
    insert into league.fantrax_teams values (2027, '${LEAGUE}', 'a', 1), (2027, '${LEAGUE}', 'b', 2);
`;

/**
 * Fantrax with a two-team league whose week 1 is regular season and whose weeks 2–4 are the playoffs, the Final
 * ending on November 4, 2026; `settled` decides its standings and scores.
 */
export const fakeFantrax = (settled: () => boolean, onRequest = () => {}): typeof fetch => async (input, options) => {
    onRequest();
    const url = new URL(String(input));
    switch (url.pathname.split('/').pop()) {
        case 'getLeagueInfo': return Response.json({ seasonYear: 2026, teamInfo: { a: { name: 'A' }, b: { name: 'B' } }, rosterPeriods: [],
            playoffs: { numPlayoffTeams: 6, lastRegularSeasonPeriod: 1, firstPlayoffPeriod: 2 },
            // Weeks 2–4 are the league's three playoff rounds, which leaves week 1 in the regular season.
            scoringPeriods: [{ number: 1, startDate: '2026-10-12T13:00:00-0400', endDate: '2026-10-19T18:59:59-0400' },
                ...[2, 3, 4].map(number => ({ number, startDate: `2026-11-0${number}T13:00:00-0400`, endDate: `2026-11-0${number}T18:59:59-0400` }))],
            matchups: [{ period: 1, matchupList: [{ away: { id: 'a' }, home: { id: 'b' } }] }] });
        case 'getTeamRosters': return Response.json({ period: 1, rosters: {} });
        case 'getStandings': return Response.json([{ teamId: 'a', rank: 1, points: settled() ? '1-0-0' : '0-0-0' }, { teamId: 'b', rank: 2, points: settled() ? '0-1-0' : '0-0-0' }]);
        case 'getPlayerIds': return Response.json({ p: { name: 'Player', position: 'C' } });
        case 'getMatchupScores': return Response.json({ period: Number(url.searchParams.get('period')), matchups: [{ away: { teamId: 'a', score: settled() ? 20 : 10, gamesPlayed: 1 }, home: { teamId: 'b', score: 5, gamesPlayed: 1 } }] });
        case 'req': {
            const request = JSON.parse(String(options?.body)).msgs[0].data;
            const season = { code: 'SEASON_current_YEAR_TO_DATE', name: '2026-27 Reg Season - YTD', timeframeTypeCode: 'YEAR_TO_DATE' };
            return Response.json({ responses: [{ data: { displayedStatusOrTeam: request.statusOrTeamFilter, displayedPosOrGroup: 'ALL', displayedSortType: 'SCORE',
                displayedSortReversed: false, displayedView: 'STATS', displayedScoringCategoryType: '5', displayedSeasonOrProjection: season, seasonOrProjections: [season],
                paginatedResultSet: { pageNumber: 1, totalNumResults: 1 }, tableHeader: { cells: [{ key: 'status' }, { key: 'fptsPerGame' }, { key: 'fpts' }] },
                statsTable: [{ scorer: { scorerId: 'p', name: 'Player', posShortNames: 'C' }, cells: [{ content: 'A', teamId: 'a' }, { content: '10' }, { content: '20' }] }] } }] });
        }
        default: throw Error(`Unexpected request ${url.pathname}`);
    }
};
