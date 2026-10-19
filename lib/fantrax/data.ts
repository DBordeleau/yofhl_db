import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { getArchivedPlayerIds, getFranchiseCards } from '@/lib/data/league';
import { automaticFinalPeriods, playerName, publishedMatchups, type LeagueSnapshot, type MatchupScores, type Period, type RosterStats, type ScheduledMatchup } from './model';
import { discoverScoringSeason, loadRosterStats, loadScoringLeaders } from './leaders';
import { CORRECTION_WINDOW_MS, DAY, FANTRAX_CURRENT_TAG, FANTRAX_TAG, scoresAreArchived } from './cache-policy';
import { FANTRAX_LEAGUE_ID } from './config';
import { getManualFinalPeriods } from './final-weeks';
import { getSavedCurrentSeason } from './snapshot-store';

export { FANTRAX_LEAGUE_ID, FANTRAX_LEAGUE_URL } from './config';

// Fantrax team IDs belong to this season; archive franchise IDs persist across seasons and renames.
const FRANCHISE_IDS: Record<string, number> = {
    p4zire2bmutybt24: 5, ewlj8cwqmutybt24: 8, '6pfjiq07mutybt24': 1,
    '4num7i90mutybt24': 2, '1cbgg930mutybt24': 6, ru2wvs6mmutybt24: 7,
    '7jmn4yymmutybt24': 4, a9lp9hbcmutybt24: 3, e3alkww9mutybt24: 9, kr34cpssmutybt24: 13,
};

interface LeagueInfo {
    seasonYear: number;
    teamInfo: Record<string, { name: string; id: string }>;
    scoringPeriods: Period[];
    rosterPeriods: Period[];
    matchups: { period: number; matchupList: ScheduledMatchup[] }[];
    playoffs: { numPlayoffTeams: number; lastRegularSeasonPeriod: number };
}
interface RosterResponse {
    period: number;
    rosters: Record<string, { rosterItems: { id: string; position: string; status: string }[] }>;
}
interface Standing {
    teamId: string;
    rank: number;
    points: string;
    totalPointsFor: number;
}
interface PlayerInfo { name: string; position: string; team?: string }

async function request<T>(endpoint: string, parameters: Record<string, string> = {}): Promise<T> {
    const url = new URL(`https://www.fantrax.com/fxea/general/${endpoint}`);
    url.search = new URLSearchParams(parameters).toString();
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Fantrax ${endpoint} returned ${response.status}`);
    return response.json();
}

const normalizePeriod = (period: Period): Period => ({
    ...period,
    startDate: new Date(period.startDate.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).toISOString(),
    endDate: new Date(period.endDate.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).toISOString(),
});

// Evening jobs refresh this cache; 24-hour expiry remains a fallback if a job is missed.
async function loadFantrax() {
    const fetchedAt = new Date().toISOString();
    const [info, rosters, standings] = await Promise.all([
        request<LeagueInfo>('getLeagueInfo', { leagueId: FANTRAX_LEAGUE_ID, excludePlayerInfo: 'true' }),
        request<RosterResponse>('getTeamRosters', { leagueId: FANTRAX_LEAGUE_ID }),
        request<Standing[]>('getStandings', { leagueId: FANTRAX_LEAGUE_ID }),
    ]);
    if (!info.teamInfo || !info.scoringPeriods?.length || !rosters.rosters || !Array.isArray(standings)) {
        throw new Error('Fantrax returned an incomplete league snapshot');
    }
    return { info, rosters, standings, fetchedAt };
}
const getDailyFantrax = unstable_cache(loadFantrax, ['fantrax-daily-v3', FANTRAX_LEAGUE_ID], { revalidate: DAY, tags: [FANTRAX_TAG, FANTRAX_CURRENT_TAG] });
const getSource = async () => (await getSavedCurrentSeason())?.source ?? getDailyFantrax();
async function loadPlayerDirectory() {
    const players = await request<Record<string, PlayerInfo>>('getPlayerIds', { sport: 'NHL' });
    if (!players || !Object.keys(players).length || !Object.values(players).every(player =>
        typeof player?.name === 'string' && typeof player.position === 'string')) throw new Error('Fantrax returned an invalid player directory');
    return players;
}
const getPlayerDirectory = unstable_cache(loadPlayerDirectory, ['fantrax-player-directory', 'NHL'], { revalidate: 7 * DAY, tags: [FANTRAX_TAG] });

export async function getLeagueSnapshot(options: { fresh?: boolean } = {}): Promise<LeagueSnapshot> {
    const [source, franchises, archivePlayers, players] = await Promise.all([
        options.fresh ? loadFantrax() : getSource(), getFranchiseCards(), getArchivedPlayerIds(),
        options.fresh ? loadPlayerDirectory() : getPlayerDirectory(),
    ]);
    const archiveIds = new Map(archivePlayers.map(player => [player.id.replace(/\*/g, ''), player.id]));
    const teams = Object.entries(source.info.teamInfo).map(([id, team]) => {
        const franchise = franchises.find(item => item.ID === FRANCHISE_IDS[id]);
        const standing = source.standings.find(item => item.teamId === id);
        return {
            id, franchiseId: franchise?.ID ?? null,
            name: franchise?.Team ?? team.name,
            abbreviation: franchise?.Abbreviation ?? team.name.split(' ').map(word => word[0]).join('').slice(0,5),
            logo: franchise?.LogoUrl ?? null, owner: franchise?.Owner ?? null,
            rank: standing?.rank ?? null, record: standing?.points ?? null, points: standing?.totalPointsFor ?? null,
            players: (source.rosters.rosters[id]?.rosterItems ?? []).map(item => ({
                id: item.id, name: playerName(players[item.id]?.name ?? item.id),
                position: players[item.id]?.position ?? item.position,
                lineupPosition: item.position,
                nhlTeam: players[item.id]?.team ?? '—', status: item.status,
                archiveId: archiveIds.get(item.id) ?? null,
            })).sort((a,b) => a.name.localeCompare(b.name)),
        };
    }).sort((a,b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.name.localeCompare(b.name));
    const snapshot: LeagueSnapshot = {
        fetchedAt: source.fetchedAt, seasonYear: source.info.seasonYear, teams,
        scoringPeriods: source.info.scoringPeriods.map(normalizePeriod).sort((a,b) => a.number - b.number),
        rosterPeriod: source.info.rosterPeriods.find(p => p.number === source.rosters.period)
            ? normalizePeriod(source.info.rosterPeriods.find(p => p.number === source.rosters.period)!) : null,
        schedule: source.info.matchups.map(round => ({ ...round, matchupList: publishedMatchups(round.matchupList) })),
        playoffTeams: source.info.playoffs.numPlayoffTeams,
        lastRegularSeasonPeriod: source.info.playoffs.lastRegularSeasonPeriod,
        finalPeriods: [],
    };
    snapshot.finalPeriods = [...new Set([...automaticFinalPeriods(snapshot, Date.now()), ...await getManualFinalPeriods(snapshot.seasonYear)])];
    return snapshot;
}

async function loadMatchupScores(period: number): Promise<MatchupScores> {
    const scores = await request<Omit<MatchupScores, 'fetchedAt'>>('getMatchupScores', {
        leagueId: FANTRAX_LEAGUE_ID, period: String(period),
    });
    if (!Array.isArray(scores.matchups) || !scores.matchups.length || scores.period !== period ||
        !scores.matchups.every(matchup => [matchup.away, matchup.home].every(team =>
            typeof team?.teamId === 'string' && !!team.teamId && Number.isFinite(team.score) && Number.isFinite(team.gamesPlayed)))) {
        throw new Error('Fantrax returned invalid matchup scores');
    }
    return { ...scores, fetchedAt: new Date().toISOString() };
}
// A new standings snapshot must never label scores from an older snapshot as Final.
const getDailyScores = (period: number, snapshotFetchedAt: string) => unstable_cache(() => loadMatchupScores(period),
    ['fantrax-matchup-scores-v2', FANTRAX_LEAGUE_ID, String(period), snapshotFetchedAt], { revalidate: DAY, tags: [FANTRAX_TAG] })();
const getArchivedScores = unstable_cache(loadMatchupScores, ['fantrax-final-scores', FANTRAX_LEAGUE_ID], { revalidate: false, tags: [FANTRAX_TAG] });
export async function getMatchupScores(period: number): Promise<MatchupScores | null> {
    const saved = await getSavedCurrentSeason();
    const source = saved?.source ?? await getDailyFantrax();
    const raw = source.info.scoringPeriods.find(item => item.number === period);
    if (!raw) throw new RangeError('Unknown scoring period');
    const normalized = normalizePeriod(raw);
    if (Date.now() < Date.parse(normalized.startDate)) return null;
    if (saved?.scores[period]) return saved.scores[period];
    // Fetch once more after the correction window before retaining a final result.
    return scoresAreArchived(normalized.endDate) ? getArchivedScores(period) : getDailyScores(period, source.fetchedAt);
}

// Resolve outside the daily caches: nested unstable_cache calls bypass the inner cache.
const getCachedScoringSeason = unstable_cache(discoverScoringSeason, ['fantrax-scoring-season'], { revalidate: 7 * DAY, tags: [FANTRAX_TAG] });
// Next supplies React.cache in server renders; standalone scripts use React 18.
const getScoringSeason = typeof cache === 'function' ? cache(getCachedScoringSeason) : getCachedScoringSeason;

async function loadLeaders(seasonYear: number, seasonCode: string) {
    const [players, archive] = await Promise.all([loadScoringLeaders(FANTRAX_LEAGUE_ID, seasonYear, seasonCode), getArchivedPlayerIds()]);
    const archiveIds = new Map(archive.map(player => [player.id.replace(/\*/g, ''), player.id]));
    return { fetchedAt: new Date().toISOString(), players: players.map(player => ({ ...player, archiveId: archiveIds.get(player.id) ?? null })) };
}
const getDailyLeaders = unstable_cache(loadLeaders, ['fantrax-scoring-leaders-top-10-per-game-v2', FANTRAX_LEAGUE_ID], { revalidate: DAY, tags: [FANTRAX_TAG, FANTRAX_CURRENT_TAG] });

const getDailyRosterStats = unstable_cache(async (seasonYear: number, seasonCode: string): Promise<RosterStats> => ({
    players: await loadRosterStats(FANTRAX_LEAGUE_ID, seasonYear, seasonCode), fetchedAt: new Date().toISOString(),
}), ['fantrax-roster-stats-v2', FANTRAX_LEAGUE_ID], { revalidate: DAY, tags: [FANTRAX_TAG, FANTRAX_CURRENT_TAG] });

export async function getScoringLeaders(seasonYear: number) {
    const saved = await getSavedCurrentSeason();
    if (saved?.source.info.seasonYear === seasonYear) return saved.leaders;
    return getDailyLeaders(seasonYear, await getScoringSeason(FANTRAX_LEAGUE_ID, seasonYear));
}
export async function getRosterStats(seasonYear: number) {
    const saved = await getSavedCurrentSeason();
    if (saved?.source.info.seasonYear === seasonYear) return saved.rosterStats;
    return getDailyRosterStats(seasonYear, await getScoringSeason(FANTRAX_LEAGUE_ID, seasonYear));
}

export interface CurrentSeasonData {
    source: Awaited<ReturnType<typeof loadFantrax>>;
    scores: Record<number, MatchupScores>;
    leaders: Awaited<ReturnType<typeof loadLeaders>>;
    rosterStats: RosterStats;
}

// Publish only after every request succeeds, so a partial outage preserves the last snapshot.
export async function captureCurrentSeason(): Promise<CurrentSeasonData> {
    const source = await loadFantrax();
    const now = Date.now();
    const periods = source.info.scoringPeriods.map(normalizePeriod).filter(period =>
        Date.parse(period.startDate) <= now && Date.parse(period.endDate) + CORRECTION_WINDOW_MS > now);
    const season = await getScoringSeason(FANTRAX_LEAGUE_ID, source.info.seasonYear);
    const [leaders, players, scores] = await Promise.all([
        loadLeaders(source.info.seasonYear, season), loadRosterStats(FANTRAX_LEAGUE_ID, source.info.seasonYear, season),
        Promise.all(periods.map(period => loadMatchupScores(period.number))),
    ]);
    for (const score of scores) {
        const scheduled = source.info.matchups.find(round => round.period === score.period)?.matchupList.filter(matchup => matchup.away.id && matchup.home.id) ?? [];
        if (scheduled.length !== score.matchups.length || !scheduled.every(matchup => score.matchups.some(result => result.away.teamId === matchup.away.id && result.home.teamId === matchup.home.id))) {
            throw new Error('Fantrax returned incomplete scheduled matchup scores');
        }
    }
    return { source, leaders, rosterStats: { players, fetchedAt: new Date().toISOString() },
        scores: Object.fromEntries(scores.map(score => [score.period, score])) };
}
