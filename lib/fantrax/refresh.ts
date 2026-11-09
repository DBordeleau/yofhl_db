import { FANTRAX_LEAGUE_ID } from './config';
import { captureAndSave } from './fantrax-source';

// Legacy refresh for the cron, /api/revalidate and admin until #60 moves them onto refreshLiveSeason().
// Publishes only after every request succeeds, so a partial outage preserves the last snapshot.
export async function refreshCurrentSeason() {
    const data = await captureAndSave(FANTRAX_LEAGUE_ID);
    return { fetchedAt: data.source.fetchedAt, seasonYear: data.source.info.seasonYear };
}
