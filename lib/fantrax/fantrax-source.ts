// The production live season source: Fantrax over HTTP, the saved snapshot (league.fantrax_snapshots), manual
// final weeks and Next's caches. The live season's Fantrax league comes from league.fantrax_teams: its latest
// season year. Evening jobs refresh the caches; their 24-hour expiry remains a fallback if a job is missed.
import { sql } from 'drizzle-orm';
import { revalidateTag, unstable_cache } from 'next/cache';
import { cache } from 'react';
import { cached, rows } from '@/lib/data/db';
import { getArchivedPlayerIds, getFranchiseCards } from '@/lib/data/league';
import { DAY, FANTRAX_CURRENT_TAG, FANTRAX_TAG, finalWeeksTag, scoresAreArchived } from './cache-policy';
import { createFantraxClient, readCore, toSourceScores, type CurrentSeasonData, type FantraxLeague } from './fantrax-client';
import { finalWeekQuery, getManualFinalPeriods } from './final-weeks';
import type { FantraxTeamRow, LiveSeasonSource } from './live-season-source';
import type { MatchupScores, Period, RosterStats } from './model';
import { getSavedCurrentSeason, saveSnapshotQuery } from './snapshot-store';

export const fantraxClient = createFantraxClient();

export const latestFantraxTeamsQuery = sql`
    select season_year as "seasonYear", fantrax_league_id as "fantraxLeagueId", fantrax_team_id as "fantraxTeamId", franchise_id as "franchiseId"
    from league.fantrax_teams where season_year = (select max(season_year) from league.fantrax_teams)
    order by fantrax_team_id`;
// The importer fills the table from league.yml and clears the league cache.
const getFantraxTeams = cached(() => rows<FantraxTeamRow>(latestFantraxTeamsQuery), 'fantrax-teams');
async function liveLeagueId() {
    const leagueId = (await getFantraxTeams())[0]?.fantraxLeagueId;
    if (!leagueId) throw new Error('league.fantrax_teams has no Fantrax league; add the season\'s fantrax block to league.yml and import it');
    return leagueId;
}

const archivedPlayerIds = async () => (await getArchivedPlayerIds()).map(player => player.id);

const getDailyFantrax = (leagueId: string) => unstable_cache(() => fantraxClient.league(leagueId), ['fantrax-daily-v4', leagueId],
    { revalidate: DAY, tags: [FANTRAX_TAG, FANTRAX_CURRENT_TAG] })();
/** the saved snapshot's league responses, or the daily cache's when it is missing or more than a day old */
export const getFantraxLeague = async (leagueId: string): Promise<FantraxLeague> => (await getSavedCurrentSeason(leagueId))?.source ?? getDailyFantrax(leagueId);
export const getPlayerDirectory = unstable_cache(() => fantraxClient.playerDirectory(), ['fantrax-player-directory', 'NHL'], { revalidate: 7 * DAY, tags: [FANTRAX_TAG] });

// A new standings snapshot must never label scores from an older snapshot as Final.
const getDailyScores = (leagueId: string, week: number, snapshotFetchedAt: string) => unstable_cache(() => fantraxClient.weekScores(leagueId, week),
    ['fantrax-matchup-scores-v2', leagueId, String(week), snapshotFetchedAt], { revalidate: DAY, tags: [FANTRAX_TAG] })();
const getArchivedScores = (leagueId: string, week: number) => unstable_cache(() => fantraxClient.weekScores(leagueId, week),
    ['fantrax-final-scores', leagueId, String(week)], { revalidate: false, tags: [FANTRAX_TAG] })();
/** `week` has normalized dates */
export async function getCachedWeekScores(leagueId: string, week: Period, snapshotFetchedAt: string): Promise<MatchupScores> {
    const saved = await getSavedCurrentSeason(leagueId);
    if (saved?.scores[week.number]) return saved.scores[week.number];
    // Fetch once more after the correction window before retaining a final result.
    return scoresAreArchived(week.endDate) ? getArchivedScores(leagueId, week.number) : getDailyScores(leagueId, week.number, snapshotFetchedAt);
}

// Resolve outside the daily caches: nested unstable_cache calls bypass the inner cache.
const getCachedScoringSeason = unstable_cache((leagueId: string, seasonYear: number) => fantraxClient.scoringSeason(leagueId, seasonYear),
    ['fantrax-scoring-season'], { revalidate: 7 * DAY, tags: [FANTRAX_TAG] });
// Next supplies React.cache in server renders; standalone scripts use React 18.
const getScoringSeason = typeof cache === 'function' ? cache(getCachedScoringSeason) : getCachedScoringSeason;

const getDailyLeaders = unstable_cache((leagueId: string, seasonYear: number, seasonCode: string) =>
    fantraxClient.scoringLeaders(leagueId, seasonYear, seasonCode, archivedPlayerIds),
['fantrax-scoring-leaders-top-10-per-game-v2'], { revalidate: DAY, tags: [FANTRAX_TAG, FANTRAX_CURRENT_TAG] });
const getDailyRosterStats = unstable_cache((leagueId: string, seasonYear: number, seasonCode: string) =>
    fantraxClient.rosterStats(leagueId, seasonYear, seasonCode),
['fantrax-roster-stats-v2'], { revalidate: DAY, tags: [FANTRAX_TAG, FANTRAX_CURRENT_TAG] });

export async function getCachedLeaders(leagueId: string, seasonYear: number) {
    const saved = await getSavedCurrentSeason(leagueId);
    if (saved?.source.info.seasonYear === seasonYear) return saved.leaders;
    return getDailyLeaders(leagueId, seasonYear, await getScoringSeason(leagueId, seasonYear));
}
export async function getCachedRosterStats(leagueId: string, seasonYear: number): Promise<RosterStats> {
    const saved = await getSavedCurrentSeason(leagueId);
    if (saved?.source.info.seasonYear === seasonYear) return saved.rosterStats;
    return getDailyRosterStats(leagueId, seasonYear, await getScoringSeason(leagueId, seasonYear));
}

/** Capture every request, save the snapshot and publish it, only if every request succeeds. */
export async function captureAndSave(leagueId: string): Promise<CurrentSeasonData> {
    const data = await fantraxClient.capture(leagueId, { scoringSeason: getScoringSeason, archivedPlayerIds });
    await rows(saveSnapshotQuery(data, leagueId));
    revalidateTag(FANTRAX_CURRENT_TAG);
    return data;
}

export const fantraxSource: LiveSeasonSource = {
    fantraxTeams: getFantraxTeams,
    franchises: async () => (await getFranchiseCards()).map(card => ({
        id: card.ID, name: card.Team, abbreviation: card.Abbreviation, logo: card.LogoUrl, owner: card.Owner,
    })),
    archivedPlayerIds,
    async core({ fresh }) {
        const leagueId = await liveLeagueId();
        const [league, players] = await Promise.all([
            fresh ? fantraxClient.league(leagueId) : getFantraxLeague(leagueId),
            fresh ? fantraxClient.playerDirectory() : getPlayerDirectory(),
        ]);
        return readCore(league, players);
    },
    weekScores: async (week, core) => toSourceScores(await getCachedWeekScores(await liveLeagueId(), week, core.fetchedAt)),
    scoringLeaders: async seasonYear => getCachedLeaders(await liveLeagueId(), seasonYear),
    rosterStats: async seasonYear => getCachedRosterStats(await liveLeagueId(), seasonYear),
    manualFinalWeeks: async seasonYear => getManualFinalPeriods(seasonYear, await liveLeagueId()),
    async setManualFinalWeek(seasonYear, week, final) {
        await rows(finalWeekQuery(seasonYear, week, final, await liveLeagueId()));
        revalidateTag(finalWeeksTag(seasonYear));
    },
    async capture() {
        const { source } = await captureAndSave(await liveLeagueId());
        const { fetchedAt, seasonYear, weeks, playoffs } = readCore(source, {});
        return { fetchedAt, seasonYear, weeks, playoffs };
    },
};
