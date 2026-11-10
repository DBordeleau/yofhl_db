// The production live season source: Fantrax over HTTP, the saved snapshot (league.fantrax_snapshots), manual
// final weeks and Next's caches. The live season's Fantrax league comes from league.fantrax_teams: its latest
// season year. Evening jobs refresh the caches; their 24-hour expiry remains a fallback if a job is missed.
import { sql } from 'drizzle-orm';
import { revalidateTag, unstable_cache } from 'next/cache';
import { cache } from 'react';
import { cached, rows } from '@/lib/data/db';
import { getArchivedPlayerIds, getFranchiseCards } from '@/lib/data/league';
import { DAY, FANTRAX_CURRENT_TAG, FANTRAX_TAG, finalWeeksTag, scoresAreArchived } from './cache-policy';
import { createFantraxClient, readCore, toWeekScores, type SavedLiveSeason, type FantraxLeague } from './fantrax-client';
import { finalWeekQuery, getManualFinalPeriods } from './final-weeks';
import { liveFantraxLeagueId, type FantraxTeamRow, type LiveSeasonSource, type SourceCore, type SourceWeek } from './live-season-source';
import type { MatchupScores } from './model';
import { getSavedLiveSeason, saveSnapshotQuery } from './snapshot-store';

export const fantraxClient = createFantraxClient();

export const latestFantraxTeamsQuery = sql`
    select season_year as "seasonYear", fantrax_league_id as "fantraxLeagueId", fantrax_team_id as "fantraxTeamId", franchise_id as "franchiseId"
    from league.fantrax_teams where season_year = (select max(season_year) from league.fantrax_teams)
    order by fantrax_team_id`;
// The importer fills the table from league.yml and clears the league cache.
const getFantraxTeams = cached(() => rows<FantraxTeamRow>(latestFantraxTeamsQuery), 'fantrax-teams');
const liveLeagueId = async () => liveFantraxLeagueId(await getFantraxTeams());

const archivedPlayerIds = async () => (await getArchivedPlayerIds()).map(player => player.id);

const getDailyFantrax = (leagueId: string): Promise<FantraxLeague> => unstable_cache(() => fantraxClient.league(leagueId), ['fantrax-daily-v4', leagueId],
    { revalidate: DAY, tags: [FANTRAX_TAG, FANTRAX_CURRENT_TAG] })();
export const getPlayerDirectory = unstable_cache(() => fantraxClient.playerDirectory(), ['fantrax-player-directory', 'NHL'], { revalidate: 7 * DAY, tags: [FANTRAX_TAG] });

// A new standings snapshot must never label scores from an older snapshot as Final.
const getDailyScores = (leagueId: string, week: number, snapshotFetchedAt: string) => unstable_cache(() => fantraxClient.weekScores(leagueId, week),
    ['fantrax-matchup-scores-v2', leagueId, String(week), snapshotFetchedAt], { revalidate: DAY, tags: [FANTRAX_TAG] })();
const getArchivedScores = (leagueId: string, week: number) => unstable_cache(() => fantraxClient.weekScores(leagueId, week),
    ['fantrax-final-scores', leagueId, String(week)], { revalidate: false, tags: [FANTRAX_TAG] })();
async function getCachedWeekScores({ leagueId, saved }: CoreRead, week: SourceWeek, snapshotFetchedAt: string): Promise<MatchupScores> {
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

/** the saved snapshot's section when the snapshot is for `seasonYear`, otherwise the daily cache's */
const savedOrDaily = <T>(fromSaved: (saved: SavedLiveSeason) => T, daily: (leagueId: string, seasonYear: number, seasonCode: string) => Promise<T>) =>
    async ({ leagueId, saved }: CoreRead, seasonYear: number): Promise<T> => {
        if (saved?.source.info.seasonYear === seasonYear) return fromSaved(saved);
        return daily(leagueId, seasonYear, await getScoringSeason(leagueId, seasonYear));
    };
const getCachedLeaders = savedOrDaily(saved => saved.leaders, getDailyLeaders);
const getCachedRosterStats = savedOrDaily(saved => saved.rosterStats, getDailyRosterStats);

/** Capture every request, save the snapshot and publish it, only if every request succeeds. */
export async function captureAndSave(leagueId: string): Promise<SavedLiveSeason> {
    const data = await fantraxClient.capture(leagueId, { scoringSeason: getScoringSeason, archivedPlayerIds });
    await rows(saveSnapshotQuery(leagueId, data));
    revalidateTag(FANTRAX_CURRENT_TAG);
    return data;
}

/** what a core was read with: its league, and the saved snapshot (null when missing or more than a day old) */
type CoreRead = { leagueId: string; saved: SavedLiveSeason | null };
// One read of the live season looks the saved snapshot up once, as its core is built; week scores, scoring
// leaders and roster stats are served from the same lookup through the core they are passed.
const coreReads = new WeakMap<SourceCore, CoreRead>();
function readWith(core: SourceCore): CoreRead {
    const read = coreReads.get(core);
    if (!read) throw new Error('The Fantrax source was passed a core it did not return');
    return read;
}

export const fantraxSource: LiveSeasonSource = {
    fantraxTeams: getFantraxTeams,
    franchises: async () => (await getFranchiseCards()).map(card => ({
        id: card.ID, name: card.Team, abbreviation: card.Abbreviation, logo: card.LogoUrl, owner: card.Owner,
    })),
    archivedPlayerIds,
    async core({ fresh }) {
        const leagueId = await liveLeagueId();
        // A fresh core skips the saved snapshot's league responses; its scores, leaders and roster stats don't.
        const [saved, league, players] = await Promise.all([
            getSavedLiveSeason(leagueId),
            fresh ? fantraxClient.league(leagueId) : null,
            fresh ? fantraxClient.playerDirectory() : getPlayerDirectory(),
        ]);
        // The saved snapshot's league responses, or the daily cache's when it is missing or more than a day old.
        const core = readCore(league ?? saved?.source ?? await getDailyFantrax(leagueId), players);
        coreReads.set(core, { leagueId, saved });
        return core;
    },
    weekScores: async (week, core) => toWeekScores(await getCachedWeekScores(readWith(core), week, core.fetchedAt)),
    scoringLeaders: async core => getCachedLeaders(readWith(core), core.seasonYear),
    rosterStats: async core => getCachedRosterStats(readWith(core), core.seasonYear),
    manualFinalWeeks: async seasonYear => getManualFinalPeriods(await liveLeagueId(), seasonYear),
    async setManualFinalWeek(seasonYear, week, final) {
        await rows(finalWeekQuery(await liveLeagueId(), seasonYear, week, final));
        revalidateTag(finalWeeksTag(seasonYear));
    },
    async capture() {
        const { source } = await captureAndSave(await liveLeagueId());
        const { fetchedAt, seasonYear, weeks, playoffs } = readCore(source, {});
        return { fetchedAt, seasonYear, weeks, playoffs };
    },
};
