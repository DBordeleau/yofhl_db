// Legacy name for the cron, /api/revalidate and admin until #60 moves them onto refreshLiveSeason().
// Publishes only after every request succeeds, so a partial outage preserves the last snapshot.
export { refreshLiveSeason as refreshCurrentSeason } from './live-season';
