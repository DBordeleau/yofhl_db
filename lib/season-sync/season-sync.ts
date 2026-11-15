// The season sync wired to production: its own Fantrax reads go to Fantrax over HTTP on every run, past the live
// season's caches and saved snapshot, regular-season week scores included. The playoff bracket instead comes from
// the live season module, so it follows the evening refresh's snapshot of Fantrax's schedule, final weeks and
// scores; a run fails while that snapshot is more than 36 hours old.
import { createFantraxClient, playerName, toWeekScores } from '@/lib/fantrax/fantrax-client';
import { getLiveSeason, getWeekScores } from '@/lib/fantrax/live-season';
import { createSeasonSync } from './create-season-sync';

const client = createFantraxClient();

export const seasonSync = createSeasonSync({
    fantrax: {
        leagueInfo: leagueId => client.leagueInfo(leagueId),
        standings: leagueId => client.standingsTable(leagueId),
        players: (leagueId, seasonYear) => client.playerTable(leagueId, seasonYear),
        dayRosters: (leagueId, rosterPeriod) => client.dayRosters(leagueId, rosterPeriod),
        playerDirectory: async () => Object.fromEntries(Object.entries(await client.playerDirectory()).map(([id, player]) =>
            [id, { name: playerName(player.name), positions: [player.position], nhlTeam: player.team ?? null }])),
        weekScores: async (leagueId, week) => toWeekScores(await client.weekScores(leagueId, week)),
    },
    liveSeason: { getLiveSeason, getWeekScores },
});
