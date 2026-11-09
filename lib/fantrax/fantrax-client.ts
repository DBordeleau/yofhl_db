// Fantrax's HTTP API as the live season source reads it. Every response is checked here, and Fantrax's start
// year becomes the season year as league info is read. Free of Next imports; the fetch is injected for tests.
import { fantraxApiUrl, readLeagueInfo } from './api';
import { CORRECTION_WINDOW_MS } from './cache-policy';
import { discoverScoringSeason, loadRosterStats, loadScoringLeaders, type Fetcher } from './leaders';
import { publishedMatchups, type MatchupScores, type Period, type RosterStats, type ScheduledMatchup } from './model';
import type { FantraxPlayoffs, SourceCore, SourceScores } from './live-season-source';

export type { Fetcher } from './leaders';

export interface LeagueInfo {
    /** the season year; Fantrax's own start year is converted as the response is read */
    seasonYear: number;
    teamInfo: Record<string, { name: string; id: string }>;
    scoringPeriods: Period[];
    rosterPeriods: Period[];
    matchups: { period: number; matchupList: ScheduledMatchup[] }[];
    playoffs: FantraxPlayoffs;
}
export interface RosterResponse {
    period: number;
    rosters: Record<string, { rosterItems: { id: string; position: string; status: string }[] }>;
}
export interface Standing {
    teamId: string;
    rank: number;
    points: string;
    totalPointsFor: number;
}
export interface PlayerInfo { name: string; position: string; team?: string }
export type PlayerDirectory = Record<string, PlayerInfo>;

/** the raw core responses, as the saved snapshot stores them */
export interface FantraxLeague {
    info: LeagueInfo;
    rosters: RosterResponse;
    standings: Standing[];
    fetchedAt: string;
}
export type ScoringLeaders = { fetchedAt: string; players: (Awaited<ReturnType<typeof loadScoringLeaders>>[number] & { archiveId: string | null })[] };

/** the saved snapshot (league.fantrax_snapshots): raw Fantrax responses from one capture */
export interface CurrentSeasonData {
    source: FantraxLeague;
    scores: Record<number, MatchupScores>;
    leaders: ScoringLeaders;
    rosterStats: RosterStats;
}

const globalFetch: Fetcher = (input, init) => fetch(input, init);

const toIso = (date: string) => new Date(date.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).toISOString();
export const normalizePeriod = (period: Period): Period => ({ ...period, startDate: toIso(period.startDate), endDate: toIso(period.endDate) });

export function createFantraxClient(fetcher: Fetcher = globalFetch) {
    async function request<T>(endpoint: string, parameters: Record<string, string> = {}): Promise<T> {
        const response = await fetcher(fantraxApiUrl(endpoint, parameters), { cache: 'no-store', signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error(`Fantrax ${endpoint} returned ${response.status}`);
        return response.json();
    }

    async function league(leagueId: string): Promise<FantraxLeague> {
        const fetchedAt = new Date().toISOString();
        const [info, rosters, standings] = await Promise.all([
            request<LeagueInfo>('getLeagueInfo', { leagueId, excludePlayerInfo: 'true' }),
            request<RosterResponse>('getTeamRosters', { leagueId }),
            request<Standing[]>('getStandings', { leagueId }),
        ]);
        if (!info?.teamInfo || !info.scoringPeriods?.length || !rosters?.rosters || !Array.isArray(standings)) {
            throw new Error('Fantrax returned an incomplete league snapshot');
        }
        return { info: readLeagueInfo(info), rosters, standings, fetchedAt };
    }

    async function playerDirectory(): Promise<PlayerDirectory> {
        const players = await request<PlayerDirectory>('getPlayerIds', { sport: 'NHL' });
        if (!players || !Object.keys(players).length || !Object.values(players).every(player =>
            typeof player?.name === 'string' && typeof player.position === 'string')) throw new Error('Fantrax returned an invalid player directory');
        return players;
    }

    async function weekScores(leagueId: string, week: number): Promise<MatchupScores> {
        const scores = await request<Omit<MatchupScores, 'fetchedAt'>>('getMatchupScores', { leagueId, period: String(week) });
        if (!Array.isArray(scores?.matchups) || !scores.matchups.length || scores.period !== week ||
            !scores.matchups.every(matchup => [matchup.away, matchup.home].every(team =>
                typeof team?.teamId === 'string' && !!team.teamId && Number.isFinite(team.score) && Number.isFinite(team.gamesPlayed)))) {
            throw new Error('Fantrax returned invalid matchup scores');
        }
        return { ...scores, fetchedAt: new Date().toISOString() };
    }

    const scoringSeason = (leagueId: string, seasonYear: number) => discoverScoringSeason(leagueId, seasonYear, fetcher);

    async function scoringLeaders(leagueId: string, seasonYear: number, seasonCode: string, archivedPlayerIds: () => Promise<string[]>): Promise<ScoringLeaders> {
        const [players, archive] = await Promise.all([loadScoringLeaders(leagueId, seasonYear, seasonCode, fetcher), archivedPlayerIds()]);
        const archiveIds = new Map(archive.map(id => [id.replace(/\*/g, ''), id]));
        return { fetchedAt: new Date().toISOString(), players: players.map(player => ({ ...player, archiveId: archiveIds.get(player.id) ?? null })) };
    }

    const rosterStats = async (leagueId: string, seasonYear: number, seasonCode: string): Promise<RosterStats> => ({
        players: await loadRosterStats(leagueId, seasonYear, seasonCode, fetcher), fetchedAt: new Date().toISOString(),
    });

    /** Every request a saved snapshot needs. Rejects unless all of them succeed and the scores cover the schedule. */
    async function capture(leagueId: string, options: {
        now?: number;
        scoringSeason?: (leagueId: string, seasonYear: number) => Promise<string>;
        archivedPlayerIds?: () => Promise<string[]>;
    } = {}): Promise<CurrentSeasonData> {
        const now = options.now ?? Date.now();
        const source = await league(leagueId);
        const weeks = source.info.scoringPeriods.map(normalizePeriod).filter(week =>
            Date.parse(week.startDate) <= now && Date.parse(week.endDate) + CORRECTION_WINDOW_MS > now);
        const season = await (options.scoringSeason ?? scoringSeason)(leagueId, source.info.seasonYear);
        const [leaders, stats, scores] = await Promise.all([
            scoringLeaders(leagueId, source.info.seasonYear, season, options.archivedPlayerIds ?? (async () => [])),
            rosterStats(leagueId, source.info.seasonYear, season),
            Promise.all(weeks.map(week => weekScores(leagueId, week.number))),
        ]);
        for (const score of scores) {
            const scheduled = source.info.matchups.find(round => round.period === score.period)?.matchupList.filter(matchup => matchup.away.id && matchup.home.id) ?? [];
            if (scheduled.length !== score.matchups.length || !scheduled.every(matchup => score.matchups.some(result => result.away.teamId === matchup.away.id && result.home.teamId === matchup.home.id))) {
                throw new Error('Fantrax returned incomplete scheduled matchup scores');
            }
        }
        return { source, leaders, rosterStats: stats, scores: Object.fromEntries(scores.map(score => [score.period, score])) };
    }

    return { league, playerDirectory, weekScores, scoringSeason, scoringLeaders, rosterStats, capture };
}

export type FantraxClient = ReturnType<typeof createFantraxClient>;

/** The port's core snapshot from raw responses, fresh or saved: Fantrax's periods become weeks. */
export function readCore(league: FantraxLeague, players: PlayerDirectory): SourceCore {
    const { info, rosters, standings, fetchedAt } = league;
    const lineup = info.rosterPeriods?.find(period => period.number === rosters.period);
    return {
        fetchedAt, seasonYear: info.seasonYear,
        teams: Object.entries(info.teamInfo).map(([id, team]) => ({ id, name: team.name })),
        weeks: info.scoringPeriods.map(normalizePeriod).sort((a, b) => a.number - b.number),
        lineupPeriod: lineup ? normalizePeriod(lineup) : null,
        schedule: (info.matchups ?? []).map(round => ({ week: round.period, matchups: publishedMatchups(round.matchupList) })),
        standings: standings.map(standing => ({ teamId: standing.teamId, rank: standing.rank ?? null, record: standing.points ?? null, points: standing.totalPointsFor ?? null })),
        rosters: Object.fromEntries(Object.entries(rosters.rosters).map(([id, roster]) => [id, roster.rosterItems ?? []])),
        players,
        playoffs: info.playoffs ?? {},
    };
}

export const toSourceScores = (scores: MatchupScores): SourceScores => ({ fetchedAt: scores.fetchedAt, week: scores.period, matchups: scores.matchups });
