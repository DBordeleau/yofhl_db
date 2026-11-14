// The season sync wired to production: its Fantrax reads go to Fantrax over HTTP, fresh on every run (none of the
// live season's caches or its saved snapshot).
import { createFantraxClient } from '@/lib/fantrax/fantrax-client';
import { createSeasonSync } from './create-season-sync';

const client = createFantraxClient();

export const seasonSync = createSeasonSync({
    fantrax: {
        leagueInfo: leagueId => client.leagueInfo(leagueId),
        standings: leagueId => client.standingsTable(leagueId),
        players: (leagueId, seasonYear) => client.playerTable(leagueId, seasonYear),
    },
});
