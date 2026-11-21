// Fantrax's HTTP API as the live season source reads it. Every response is checked here, and Fantrax's start
// year becomes the season year as league info is read. Free of Next imports; the fetch is injected for tests.
import { fantraxApiUrl, readLeagueInfo } from './api';
import { CORRECTION_WINDOW_MS } from './cache-policy';
import { discoverScoringSeason, globalFetch, loadRosterStats, loadScoringLeaders, type Fetcher } from './leaders';
import { loadPlayerTable } from './player-table';
import { loadSkaterTable } from './skater-table';
import { loadStandingsTable } from './standings-table';
import { type FantraxPlayoffs, type RosterStats, type ScheduledMatchup, type SeedPairing, type SourceCore, type SourceWeek, type WeekScores } from './live-season-source';

export type { Fetcher } from './leaders';
export type { TablePlayer } from './player-table';
export type { TableSkater } from './skater-table';
export type { TableStanding } from './standings-table';
export type { SourceCore, SourceWeek } from './live-season-source';

interface LeagueInfo {
    /** the season year; Fantrax's own start year is converted as the response is read */
    seasonYear: number;
    teamInfo: Record<string, { name: string; id: string }>;
    /** Fantrax's scoring periods are the weeks */
    scoringPeriods: SourceWeek[];
    rosterPeriods: SourceWeek[];
    matchups: { period: number; matchupList: RawMatchup[] }[];
    playoffs: Omit<FantraxPlayoffs, 'seeding'>;
}
interface RosterResponse {
    period: number;
    rosters: Record<string, { rosterItems: { id: string; position: string; status: string }[] }>;
}
/** a player's slot on a roster for the day */
export type RosterSlot = 'ACTIVE' | 'RESERVE' | 'INJURED_RESERVE' | 'MINORS';
const ROSTER_SLOTS: readonly string[] = ['ACTIVE', 'RESERVE', 'INJURED_RESERVE', 'MINORS'] satisfies RosterSlot[];
/** each Fantrax team's players on one daily roster period, with the slot each was in */
export type DayRosters = Record<string, { id: string; status: RosterSlot }[]>;
interface Standing {
    teamId: string;
    rank: number;
    points: string;
    totalPointsFor: number;
}
interface PlayerInfo { name: string; position: string; team?: string }
type PlayerDirectory = Record<string, PlayerInfo>;

/** the raw core responses, as the saved snapshot stores them */
export interface FantraxLeague {
    info: LeagueInfo;
    rosters: RosterResponse;
    standings: Standing[];
    fetchedAt: string;
}
type ScoringLeaders = { fetchedAt: string; players: Awaited<ReturnType<typeof loadScoringLeaders>> };

/** getMatchupScores as the saved snapshot stores it: keyed and labelled by Fantrax's period */
export interface MatchupScores {
    fetchedAt: string;
    period: number;
    matchups: {
        away: { teamId: string; score: number; gamesPlayed: number };
        home: { teamId: string; score: number; gamesPlayed: number };
    }[];
}

/** the saved snapshot (league.fantrax_snapshots): raw Fantrax responses from one capture */
export interface SavedLiveSeason {
    source: FantraxLeague;
    scores: Record<number, MatchupScores>;
    leaders: ScoringLeaders;
    rosterStats: RosterStats;
}

const HOUR = 3600 * 1000;
const easternClock = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const easternHour = (time: number) => Number(easternClock.format(time).slice(0, 2));

/**
 * A week ending at its last second. Fantrax ends a week a second before the next week's first game; an end at
 * midnight Eastern names the week's last day, so the week ends a second before the following midnight instead.
 */
export function endingAtItsLastSecond<T extends { endDate: string }>(period: T): T {
    const end = Date.parse(period.endDate);
    if (!Number.isFinite(end) || easternClock.format(end) !== '00:00:00' || end % 1000) return period;
    // a day is 23 or 25 hours long when the clocks change
    const next = end + 24 * HOUR, hour = easternHour(next);
    const midnight = hour === 23 ? next + HOUR : hour === 1 ? next - HOUR : next;
    return { ...period, endDate: new Date(midnight - 1000).toISOString() };
}

const toIso = (date: string) => new Date(date.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).toISOString();
const normalizePeriod = (period: SourceWeek): SourceWeek => ({ ...period, startDate: toIso(period.startDate), endDate: toIso(period.endDate) });
const normalizeScoringPeriod = (period: SourceWeek): SourceWeek => endingAtItsLastSecond(normalizePeriod(period));

/** Fantrax's "Last, First" player name as "First Last" */
export function playerName(name: string): string {
    const [last, first] = name.split(', ');
    return first ? `${first} ${last}` : last;
}

/** A player from Fantrax's player directory mapped to normalized archive positions and NHL team. */
export function directoryPlayer(player: PlayerInfo): { name: string; positions: string[]; nhlTeam: string | null } {
    const team = player.team?.trim();
    return {
        name: playerName(player.name),
        positions: player.position.split(',').map(position => position.trim()).filter(Boolean),
        nhlTeam: team && team !== '(N/A)' ? team : null,
    };
}

// Future playoff slots contain { TBD: true } on both sides, and an unseeded first round { seed: N } or { bye: true }:
// none of them are real teams or byes.
const publishedMatchups = (matchups: RawMatchup[]): ScheduledMatchup[] => matchups.filter(matchup => matchup.away.id || matchup.home.id);

type RawSide = ScheduledMatchup['away'] & { seed?: number; bye?: boolean };
type RawMatchup = { away: RawSide; home: RawSide };

/** the first playoff round's pairings by seed, while every side of it is still a seed or a bye */
function seedingOf(info: LeagueInfo): SeedPairing[] | undefined {
    const first = info.playoffs?.firstPlayoffPeriod;
    const round = info.matchups?.find(item => item.period === first)?.matchupList ?? [];
    const seed = (side: RawSide) => side.bye === true ? null : Number.isInteger(side.seed) ? side.seed! : undefined;
    const pairings = round.map(matchup => ({ away: seed(matchup.away), home: seed(matchup.home) }));
    return pairings.length && pairings.every(pairing => pairing.away !== undefined && pairing.home !== undefined)
        ? pairings as SeedPairing[] : undefined;
}

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

    /**
     * league info alone: the season year, its weeks and its daily roster periods, each in order, and its first
     * playoff week (null while Fantrax has none)
     */
    async function leagueInfo(leagueId: string): Promise<{ seasonYear: number; weeks: SourceWeek[]; rosterPeriods: SourceWeek[]; firstPlayoffWeek: number | null }> {
        const info = await request<LeagueInfo>('getLeagueInfo', { leagueId, excludePlayerInfo: 'true' });
        if (!Number.isInteger(info?.seasonYear) || !info.scoringPeriods?.length || !Array.isArray(info.rosterPeriods)) throw new Error('Fantrax returned incomplete league info');
        const inOrder = (periods: SourceWeek[], normalize: (period: SourceWeek) => SourceWeek) => periods.map(normalize).sort((a, b) => a.number - b.number);
        const firstPlayoffWeek = info.playoffs?.firstPlayoffPeriod;
        return {
            seasonYear: readLeagueInfo(info).seasonYear,
            weeks: inOrder(info.scoringPeriods, normalizeScoringPeriod),
            rosterPeriods: inOrder(info.rosterPeriods, normalizePeriod),
            firstPlayoffWeek: Number.isInteger(firstPlayoffWeek) ? firstPlayoffWeek! : null,
        };
    }

    /** every team's roster on a past (or the current) daily roster period, each player with their slot that day */
    async function dayRosters(leagueId: string, period: number): Promise<DayRosters> {
        const response = await request<RosterResponse>('getTeamRosters', { leagueId, period: String(period) });
        // Fantrax answers a period outside the season with the nearest one, so the period must be the one asked for.
        const teams = response?.period === period && response.rosters && typeof response.rosters === 'object' ? Object.entries(response.rosters) : [];
        if (!teams.length || !teams.every(([, roster]) => Array.isArray(roster?.rosterItems) && roster.rosterItems.every(item =>
            typeof item?.id === 'string' && !!item.id && ROSTER_SLOTS.includes(item.status)))) {
            throw new Error(`Fantrax returned invalid rosters for roster period ${period}`);
        }
        return Object.fromEntries(teams.map(([id, roster]) => [id, roster.rosterItems.map(item => ({ id: item.id, status: item.status as RosterSlot }))]));
    }

    /** the website standings table: rank, W/L/T and points for and against, season to date */
    const standingsTable = (leagueId: string) => loadStandingsTable(leagueId, fetcher);
    /** every player who scored (either sign) or is rostered, season to date; the season sync's read */
    const playerTable = (leagueId: string, seasonYear: number) => loadPlayerTable(leagueId, seasonYear, fetcher);
    /** every NHL skater, with skater categories for those who have played, season to date; the season sync's read */
    const skaterTable = async (leagueId: string, seasonYear: number) => (await loadSkaterTable(leagueId, seasonYear, { fetcher })).skaters;

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

    const scoringLeaders = async (leagueId: string, seasonYear: number, seasonCode: string): Promise<ScoringLeaders> => ({
        players: await loadScoringLeaders(leagueId, seasonYear, seasonCode, fetcher), fetchedAt: new Date().toISOString(),
    });

    const rosterStats = async (leagueId: string, seasonYear: number, seasonCode: string): Promise<RosterStats> => ({
        players: await loadRosterStats(leagueId, seasonYear, seasonCode, fetcher), fetchedAt: new Date().toISOString(),
    });

    /** Every request a saved snapshot needs. Rejects unless all of them succeed and the scores cover the schedule. */
    async function capture(leagueId: string, options: {
        now?: number;
        scoringSeason?: (leagueId: string, seasonYear: number) => Promise<string>;
    } = {}): Promise<SavedLiveSeason> {
        const now = options.now ?? Date.now();
        const source = await league(leagueId);
        const weeks = source.info.scoringPeriods.map(normalizeScoringPeriod).filter(week =>
            Date.parse(week.startDate) <= now && Date.parse(week.endDate) + CORRECTION_WINDOW_MS > now);
        const season = await (options.scoringSeason ?? scoringSeason)(leagueId, source.info.seasonYear);
        const [leaders, stats, scores] = await Promise.all([
            scoringLeaders(leagueId, source.info.seasonYear, season),
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

    return { league, leagueInfo, dayRosters, standingsTable, playerTable, skaterTable, playerDirectory, weekScores, scoringSeason, scoringLeaders, rosterStats, capture };
}

/** The port's core snapshot from raw responses, fresh or saved: Fantrax's periods become weeks. */
export function readCore(league: FantraxLeague, players: PlayerDirectory): SourceCore {
    const { info, rosters, standings, fetchedAt } = league;
    const lineup = info.rosterPeriods?.find(period => period.number === rosters.period);
    const seeding = seedingOf(info);
    return {
        fetchedAt, seasonYear: info.seasonYear,
        teams: Object.entries(info.teamInfo).map(([id, team]) => ({ id, name: team.name })),
        weeks: info.scoringPeriods.map(normalizeScoringPeriod).sort((a, b) => a.number - b.number),
        lineupPeriod: lineup ? normalizePeriod(lineup) : null,
        schedule: (info.matchups ?? []).map(round => ({ week: round.period, matchups: publishedMatchups(round.matchupList) })),
        standings: standings.map(standing => ({ teamId: standing.teamId, rank: standing.rank ?? null, record: standing.points ?? null, points: standing.totalPointsFor ?? null })),
        rosters: Object.fromEntries(Object.entries(rosters.rosters).map(([id, roster]) => [id, roster.rosterItems ?? []])),
        players,
        playoffs: { ...info.playoffs, ...(seeding ? { seeding } : {}) },
    };
}

export const toWeekScores = (scores: MatchupScores): WeekScores => ({ fetchedAt: scores.fetchedAt, week: scores.period, matchups: scores.matchups });
