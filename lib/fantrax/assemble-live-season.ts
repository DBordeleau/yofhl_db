// The live season module: the current season as Fantrax has it now, already assembled. It only assembles; what
// it reads comes through the live season source port, so this file is free of Next and Fantrax specifics.
// Callers use the production binding in live-season.ts.
import { playerName, automaticFinalPeriods, type RosterStats, type ScheduledMatchup, type SnapshotPlayer } from './model';
import { PLAYOFF_FORMAT } from './config';
import type { CapturedSeason, FantraxTeamRow, LiveSeasonSource, SourceCore, SourceWeek } from './live-season-source';

export type PlayoffRound = (typeof PLAYOFF_FORMAT.rounds)[number];

export interface Week {
    number: number;
    /** ISO timestamps */
    startDate: string;
    endDate: string;
    /** "Week 5", or the playoff round: "Quarterfinals", "Semifinals", "Final" */
    name: string;
    /** "Week 5", or "Jagr Cup Quarterfinals" and so on */
    fullName: string;
    stage: 'regular' | PlayoffRound;
    /** final once the week's scores are settled (or its end date has passed); never before it starts */
    phase: 'upcoming' | 'active' | 'final';
    /** marked final by hand in admin */
    manualFinal: boolean;
    /** published matchups; playoff slots appear once Fantrax seeds them */
    matchups: ScheduledMatchup[];
}

export interface LiveTeam {
    /** the Fantrax team ID */
    id: string;
    franchiseId: number | null;
    /** the franchise's current identity, or Fantrax's name for an unmapped team */
    name: string;
    abbreviation: string;
    logo: string | null;
    owner: string | null;
    /** the team page, or null for an unmapped team */
    href: string | null;
    players: SnapshotPlayer[];
}

export interface StandingsRow {
    team: LiveTeam;
    rank: number | null;
    record: string | null;
    points: number | null;
    /** one of the top seeds, who skip the first playoff round */
    bye: boolean;
    /** the playoff line is drawn beneath this row */
    playoffLineBelow: boolean;
}

export interface Standings {
    rows: StandingsRow[];
    playoffTeams: number;
    byeTeams: number;
}

export interface WeekScores {
    fetchedAt: string;
    week: number;
    matchups: {
        away: { teamId: string; score: number; gamesPlayed: number };
        home: { teamId: string; score: number; gamesPlayed: number };
    }[];
}

export interface ScoringLeader {
    id: string;
    name: string;
    position: string;
    points: number;
    perGame: number | null;
    /** the live team the player is on, or null for a free agent or unknown team */
    team: LiveTeam | null;
    /** what Fantrax shows for the player's team ("FA" for a free agent) */
    fantraxTeam: string;
    archiveId: string | null;
}

export type Availability<T> = { status: 'available'; value: T } | { status: 'unavailable' };

export interface LiveSeason {
    seasonYear: number;
    fantraxLeagueId: string;
    fetchedAt: string;
    weeks: Week[];
    currentWeek: Week;
    /** the Fantrax lineup period the rosters belong to */
    lineupPeriod: SourceWeek | null;
    /** in standings order */
    teams: LiveTeam[];
    standings: Standings;
    /** the current week's scores; null while it hasn't started */
    scores: Availability<WeekScores | null>;
    leaders: Availability<{ fetchedAt: string; players: ScoringLeader[] }>;
    rosterStats: Availability<RosterStats>;
}

/** the whole live season is unavailable when its core snapshot (teams, schedule, weeks) can't be loaded */
export type LiveSeasonResult = { status: 'available'; value: LiveSeason } | { status: 'unavailable'; fantraxLeagueId: string | null };

const ROUND_NAMES: Record<PlayoffRound, string> = { Quarterfinals: 'Jagr Cup Quarterfinals', Semifinals: 'Jagr Cup Semifinals', Final: 'Jagr Cup Final' };

/** the playoff rounds are the last weeks of the season, in order; every earlier week is the regular season */
function stages(weeks: SourceWeek[]) {
    const numbers = weeks.map(week => week.number).sort((a, b) => a - b);
    const firstRound = numbers.length - PLAYOFF_FORMAT.rounds.length;
    const stage = new Map<number, Week['stage']>(numbers.map((number, index) => [number, index < firstRound ? 'regular' : PLAYOFF_FORMAT.rounds[index - firstRound]]));
    return { stage, lastRegularWeek: numbers[firstRound - 1] ?? 0, firstPlayoffWeek: numbers[Math.max(firstRound, 0)] ?? 0 };
}

/** the last week before the playoff rounds */
export const lastRegularSeasonWeek = (weeks: SourceWeek[]) => stages(weeks).lastRegularWeek;

const archiveLookup = (ids: string[]) => {
    const archive = new Map(ids.map(id => [id.replace(/\*/g, ''), id]));
    return (id: string) => archive.get(id) ?? null;
};

export function createLiveSeason(source: LiveSeasonSource, options: { now?: () => number } = {}) {
    const clock = options.now ?? (() => Date.now());

    async function section<T>(label: string, load: () => Promise<T>): Promise<Availability<T>> {
        try {
            return { status: 'available', value: await load() };
        } catch (error) {
            console.error(`Live season ${label} unavailable:`, error);
            return { status: 'unavailable' };
        }
    }

    function assembleWeeks(core: SourceCore, manual: number[], now: number): Week[] {
        const { stage, lastRegularWeek } = stages(core.weeks);
        const records = new Map(core.standings.map(standing => [standing.teamId, standing.record]));
        // Automatic final weeks stop at the league's regular season; playoff weeks are only final by date or by hand.
        const automatic = automaticFinalPeriods({
            scoringPeriods: core.weeks, lastRegularSeasonPeriod: lastRegularWeek,
            schedule: core.schedule.map(round => ({ period: round.week, matchupList: round.matchups })),
            teams: core.teams.map(team => ({ id: team.id, record: records.get(team.id) ?? null })),
        }, now);
        const final = new Set([...automatic, ...manual]);
        return [...core.weeks].sort((a, b) => a.number - b.number).map(week => {
            const weekStage = stage.get(week.number)!;
            const phase = now < Date.parse(week.startDate) ? 'upcoming'
                : final.has(week.number) || now > Date.parse(week.endDate) ? 'final' : 'active';
            return {
                number: week.number, startDate: week.startDate, endDate: week.endDate,
                name: weekStage === 'regular' ? `Week ${week.number}` : weekStage,
                fullName: weekStage === 'regular' ? `Week ${week.number}` : ROUND_NAMES[weekStage],
                stage: weekStage, phase, manualFinal: manual.includes(week.number),
                matchups: core.schedule.find(round => round.week === week.number)?.matchups ?? [],
            };
        });
    }

    function assembleTeams(core: SourceCore, mapping: FantraxTeamRow[], franchises: Awaited<ReturnType<LiveSeasonSource['franchises']>>, archiveId: (id: string) => string | null) {
        const franchiseFor = new Map(mapping.map(row => [row.fantraxTeamId, row.franchiseId]));
        const identities = new Map(franchises.map(franchise => [franchise.id, franchise]));
        const standings = new Map(core.standings.map(standing => [standing.teamId, standing]));
        return core.teams.map(team => {
            const franchiseId = franchiseFor.get(team.id);
            const franchise = franchiseId === undefined ? undefined : identities.get(franchiseId);
            if (!franchise) console.warn(`Fantrax team ${team.id} (${team.name}) has no franchise in league.fantrax_teams for ${core.seasonYear}; showing its Fantrax name.`);
            const live: LiveTeam = {
                id: team.id, franchiseId: franchise?.id ?? null,
                name: franchise?.name ?? team.name,
                abbreviation: franchise?.abbreviation ?? team.name.split(' ').map(word => word[0]).join('').slice(0, 5),
                logo: franchise?.logo ?? null, owner: franchise?.owner ?? null,
                href: franchise ? `/teams/${franchise.id}` : null,
                players: (core.rosters[team.id] ?? []).map(item => {
                    const player = core.players[item.id];
                    return {
                        id: item.id, name: playerName(player?.name ?? item.id), position: player?.position ?? item.position,
                        lineupPosition: item.position, nhlTeam: player?.team ?? '—', status: item.status, archiveId: archiveId(item.id),
                    };
                }).sort((a, b) => a.name.localeCompare(b.name)),
            };
            const standing = standings.get(team.id);
            return { team: live, rank: standing?.rank ?? null, record: standing?.record ?? null, points: standing?.points ?? null };
        }).sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.team.name.localeCompare(b.team.name));
    }

    async function loadCore(fresh: boolean) {
        const [core, mapping, franchises, archive] = await Promise.all([
            source.core({ fresh }), source.fantraxTeams(), source.franchises(), source.archivedPlayerIds(),
        ]);
        const fantraxLeagueId = mapping[0]?.fantraxLeagueId;
        if (!fantraxLeagueId) throw new Error('league.fantrax_teams has no Fantrax league for the live season');
        return { core, mapping, franchises, archiveId: archiveLookup(archive), fantraxLeagueId, manual: await source.manualFinalWeeks(core.seasonYear) };
    }

    async function getLiveSeason(options: { now: number; fresh?: boolean }): Promise<LiveSeasonResult> {
        const { now, fresh = false } = options;
        let loaded: Awaited<ReturnType<typeof loadCore>>;
        try {
            loaded = await loadCore(fresh);
        } catch (error) {
            console.error('Live season unavailable:', error);
            const fantraxLeagueId = await source.fantraxTeams().then(rows => rows[0]?.fantraxLeagueId ?? null, () => null);
            return { status: 'unavailable', fantraxLeagueId };
        }
        const { core, mapping, franchises, archiveId, fantraxLeagueId, manual } = loaded;
        const weeks = assembleWeeks(core, manual, now);
        const ranked = assembleTeams(core, mapping, franchises, archiveId);
        const teams = ranked.map(row => row.team);
        const rows = ranked.map((row, index) => ({
            ...row, bye: index < PLAYOFF_FORMAT.byes,
            playoffLineBelow: index === PLAYOFF_FORMAT.teams - 1 && index < ranked.length - 1,
        }));
        // Fantrax's lineup and matchup calendars differ: the current week is the first matchup week not yet over.
        const currentWeek = weeks.find(week => now <= Date.parse(week.endDate)) ?? weeks.at(-1)!;
        // Sections load as usual even when `fresh` is set: only the core snapshot (rosters included) is re-read.
        const [scores, leaders, rosterStats] = await Promise.all([
            section('scores', async () => currentWeek.phase === 'upcoming' ? null
                : toWeekScores(await source.weekScores(currentWeek, core))),
            section('scoring leaders', async () => {
                const raw = await source.scoringLeaders(core.seasonYear);
                return { fetchedAt: raw.fetchedAt, players: raw.players.map(player => ({
                    id: player.id, name: player.name, position: player.position, points: player.points, perGame: player.perGame,
                    team: teams.find(team => team.id === player.teamId) ?? null, fantraxTeam: player.team, archiveId: archiveId(player.id),
                })) };
            }),
            section('roster stats', () => source.rosterStats(core.seasonYear)),
        ]);
        return { status: 'available', value: {
            seasonYear: core.seasonYear, fantraxLeagueId, fetchedAt: core.fetchedAt, weeks, currentWeek,
            lineupPeriod: core.lineupPeriod, teams, standings: { rows, playoffTeams: PLAYOFF_FORMAT.teams, byeTeams: PLAYOFF_FORMAT.byes },
            scores, leaders, rosterStats,
        } };
    }

    const toWeekScores = (scores: WeekScores): WeekScores => ({ fetchedAt: scores.fetchedAt, week: scores.week, matchups: scores.matchups });

    /** For /api/matchups. An unknown week throws a RangeError; a week that hasn't started has no scores yet. */
    async function getWeekScores(week: number): Promise<WeekScores | null> {
        const core = await source.core({ fresh: false });
        const found = core.weeks.find(item => item.number === week);
        if (!found) throw new RangeError('Unknown week');
        if (clock() < Date.parse(found.startDate)) return null;
        return toWeekScores(await source.weekScores(found, core));
    }

    /** For the cron, /api/revalidate and the admin refresh. Publishes only if every Fantrax request succeeds. */
    async function refreshLiveSeason(): Promise<{ fetchedAt: string; seasonYear: number }> {
        const core = await source.capture();
        warnOnPlayoffDrift(core);
        return { fetchedAt: core.fetchedAt, seasonYear: core.seasonYear };
    }

    /** The admin's manual final toggle. Only a started week of the live season can be marked. */
    async function setWeekFinal(week: number, final: boolean): Promise<void> {
        const core = await source.core({ fresh: false });
        const found = core.weeks.find(item => item.number === week);
        if (!found || clock() < Date.parse(found.startDate)) throw new RangeError('Only a started week in the live season can be marked final');
        // A failed refresh must not leave a week marked final over stale scores.
        if (final) await refreshLiveSeason();
        await source.setManualFinalWeek(core.seasonYear, week, final);
    }

    return { getLiveSeason, getWeekScores, refreshLiveSeason, setWeekFinal };
}

// Fantrax's playoff settings are wrong for this league until its support fixes them; say so once per capture.
function warnOnPlayoffDrift(core: CapturedSeason) {
    const { lastRegularWeek, firstPlayoffWeek } = stages(core.weeks);
    const fantrax = core.playoffs;
    const drift = [
        fantrax.numPlayoffTeams !== undefined && fantrax.numPlayoffTeams !== PLAYOFF_FORMAT.teams
            ? `${fantrax.numPlayoffTeams} playoff teams (the league has ${PLAYOFF_FORMAT.teams})` : null,
        fantrax.lastRegularSeasonPeriod !== undefined && fantrax.lastRegularSeasonPeriod !== lastRegularWeek
            ? `a regular season ending at week ${fantrax.lastRegularSeasonPeriod} (the league's ends at week ${lastRegularWeek})` : null,
        fantrax.firstPlayoffPeriod !== undefined && fantrax.firstPlayoffPeriod !== firstPlayoffWeek
            ? `playoffs starting at week ${fantrax.firstPlayoffPeriod} (the league's start at week ${firstPlayoffWeek})` : null,
    ].filter(Boolean);
    if (drift.length) console.warn(`Fantrax's playoff settings disagree with the league's playoff format: Fantrax has ${drift.join(', ')}.`);
}
