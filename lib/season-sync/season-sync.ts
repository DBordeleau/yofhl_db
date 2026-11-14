// The season sync wired to production: its Fantrax reads go to Fantrax over HTTP, fresh on every run (none of the
// live season's caches or its saved snapshot). The playoff bracket comes from the live season module itself, so it
// follows the evening refresh's snapshot of Fantrax's schedule, final weeks and scores.
import { createFantraxClient } from '@/lib/fantrax/fantrax-client';
import { getLiveSeason, getWeekScores } from '@/lib/fantrax/live-season';
import { createSeasonSync } from './create-season-sync';

const client = createFantraxClient();

export const seasonSync = createSeasonSync({
    fantrax: { leagueInfo: leagueId => client.leagueInfo(leagueId), standings: leagueId => client.standingsTable(leagueId) },
    liveSeason: { getLiveSeason, getWeekScores },
});
