// The live season module: the current season as Fantrax has it now, already assembled. It only assembles; what
// it reads comes through the live season source port, so this file is free of Next and of Fantrax's responses
// (it borrows only the client's player name helper). Callers use the production binding in live-season.ts.
import { roundName } from '../league';
import { isFrozenSeason } from './cache-policy';
import { PLAYOFF_FORMAT } from './config';
import { playerName } from './fantrax-client';
import {
    liveFantraxLeagueId, liveFantraxSeasonYear, type FantraxTeamRow, type LiveSeasonSource, type RosterStats, type ScheduledMatchup,
    type SourceCore, type SourceWeek, type WeekScores,
} from './live-season-source';

export type { RosterStats, ScheduledMatchup, WeekScores } from './live-season-source';

export interface Week {
    number: number;
    /** ISO timestamps */
    startDate: string;
    endDate: string;
    /** "Week 5", or the playoff round: "Quarterfinals", "Semifinals", "Final" ("Round N" before them when Fantrax has more rounds) */
    name: string;
    /** "Week 5", or "Jagr Cup Playoff Quarterfinals" and so on */
    fullName: string;
    /** every week from Fantrax's first playoff week on is a playoff round, however many days it spans */
    stage: 'regular' | 'playoff';
    /** the playoff round, 1 for the first; null in the regular season */
    round: number | null;
    /** final once the week's scores are settled (or its end date has passed); never before it starts */
    phase: 'upcoming' | 'active' | 'final';
    /** marked final by hand in admin */
    manualFinal: boolean;
    /** published matchups; playoff slots appear once Fantrax seeds them */
    matchups: ScheduledMatchup[];
}

export interface LivePlayer {
    /** the Fantrax player ID */
    id: string;
    name: string;
    /** every position the player is eligible at, comma-separated ("C,LW") */
    position: string;
    /** the roster slot the player is in this lineup week */
    lineupPosition: string;
    /** "FA" for a free agent, "—" when Fantrax has no team for the player */
    nhlTeam: string;
    status: string;
    /** the archive has this player, so they have a player page */
    inArchive: boolean;
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
    players: LivePlayer[];
}

interface StandingsRow {
    team: LiveTeam;
    rank: number | null;
    record: string | null;
    points: number | null;
    /** one of the top seeds, who skip the first playoff round */
    bye: boolean;
    /** the playoff line is drawn beneath this row */
    playoffLineBelow: boolean;
}

interface Standings {
    rows: StandingsRow[];
    /** how many teams make the playoffs (the seeds, top seed first), the top `byeTeams` of them with a first-round bye */
    playoffTeams: number;
    byeTeams: number;
}

interface ScoringLeader {
    id: string;
    name: string;
    position: string;
    points: number;
    perGame: number | null;
    /** the live team the player is on, or null for a free agent or unknown team */
    team: LiveTeam | null;
    /** what Fantrax shows for the player's team ("FA" for a free agent) */
    fantraxTeam: string;
    /** the archive has this player, so they have a player page */
    inArchive: boolean;
}

/** the live season's playoffs as Fantrax has them; the season sync writes a bracket only when they fit the league's format */
export interface LivePlayoffs {
    /** the playoff weeks, in order: one round each */
    rounds: Week[];
    /** Fantrax's schedule from its first playoff week on is exactly the league's three rounds */
    fitsFormat: boolean;
}

type Availability<T> ={ status: 'available'; value: T } | { status: 'unavailable' };

export interface LiveSeason {
    seasonYear: number;
    fantraxLeagueId: string;
    fetchedAt: string;
    weeks: Week[];
    currentWeek: Week;
    /** the week the rosters belong to: Fantrax's lineup period, on a separate calendar from the matchup weeks */
    lineupWeek: SourceWeek | null;
    /** in standings order */
    teams: LiveTeam[];
    standings: Standings;
    playoffs: LivePlayoffs;
    /** the current week's scores; null while it hasn't started */
    scores: Availability<WeekScores | null>;
    leaders: Availability<{ fetchedAt: string; players: ScoringLeader[] }>;
    rosterStats: Availability<RosterStats>;
}

/**
 * what a scheduled refresh did: skipped a frozen season without contacting Fantrax, or captured and found the
 * capture unchanged (nothing saved) or published it
 */
export type ScheduledRefresh = { outcome: 'frozen' } | { outcome: 'unchanged' | 'published'; fetchedAt: string; seasonYear: number };

/** the whole live season is unavailable when its core snapshot (teams, schedule, weeks) can't be loaded */
type LiveSeasonResult = { status: 'available'; value: LiveSeason } | { status: 'unavailable'; fantraxLeagueId: string | null };

/** the live season's Fantrax league, for links to Fantrax; known even while the season is unavailable, unless league.fantrax_teams can't be read */
export const fantraxLeagueIdOf = (result: LiveSeasonResult): string | null =>
    result.status === 'available' ? result.value.fantraxLeagueId : result.fantraxLeagueId;

/**
 * Fantrax's first playoff week, or null when its settings give none. Each week from it on is one playoff round,
 * however long the week; every earlier week is the regular season.
 */
function firstPlayoffWeekOf(core: Pick<SourceCore, 'weeks' | 'playoffs'>): number | null {
    const { firstPlayoffPeriod, lastRegularSeasonPeriod } = core.playoffs;
    const first = firstPlayoffPeriod ?? (lastRegularSeasonPeriod === undefined ? undefined : lastRegularSeasonPeriod + 1);
    return first !== undefined && core.weeks.some(week => week.number >= first) ? first : null;
}

/** each week's playoff round (1 for the first), or null for a regular-season week */
function playoffRounds(core: Pick<SourceCore, 'weeks' | 'playoffs'>) {
    const first = firstPlayoffWeekOf(core);
    const playoffWeeks = first === null ? [] : core.weeks.map(week => week.number).filter(number => number >= first).sort((a, b) => a - b);
    const round = new Map(playoffWeeks.map((number, index) => [number, index + 1]));
    return { round, count: playoffWeeks.length, lastRegularWeek: first === null ? Infinity : first - 1 };
}

/**
 * The weeks whose results every team's standings record already counts. Fantrax can post regular-season results
 * before its next matchup week starts. They stop at the league's regular season: playoff weeks are only final by
 * date or by hand.
 */
function automaticFinalWeeks(core: Pick<SourceCore, 'weeks' | 'schedule' | 'teams' | 'standings' | 'playoffs'>, now: number): number[] {
    const { lastRegularWeek } = playoffRounds(core);
    const standings = new Map(core.standings.map(standing => [standing.teamId, standing.record]));
    const results = new Map(core.teams.map(team => {
        const record = standings.get(team.id);
        return [team.id, record && /^\d+-\d+-\d+$/.test(record) ? record.split('-').reduce((sum, value) => sum + Number(value), 0) : -1];
    }));
    const expected = new Map<string, number>();
    const final: number[] = [];
    for (const week of [...core.weeks].sort((a, b) => a.number - b.number)) {
        if (week.number > lastRegularWeek || now < Date.parse(week.startDate)) break;
        const round = core.schedule.find(item => item.week === week.number);
        // Missing schedule history cannot establish how many results a team should have.
        if (!round?.matchups.length) break;
        const playing = new Set<string>();
        for (const matchup of round.matchups) {
            if (!matchup.away.id || !matchup.home.id) continue; // An unpaired team has a bye.
            for (const id of [matchup.away.id, matchup.home.id]) {
                if (playing.has(id) || !results.has(id)) return final;
                playing.add(id);
                expected.set(id, (expected.get(id) ?? 0) + 1);
            }
        }
        if (playing.size && [...playing].every(id => results.get(id)! >= expected.get(id)!)) final.push(week.number);
    }
    return final;
}

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
        const rounds = playoffRounds(core);
        const final = new Set([...automaticFinalWeeks(core, now), ...manual]);
        return [...core.weeks].sort((a, b) => a.number - b.number).map(week => {
            const round = rounds.round.get(week.number) ?? null;
            const roundTitle = round === null ? null : roundName(round, rounds.count);
            const phase = now < Date.parse(week.startDate) ? 'upcoming'
                : final.has(week.number) || now > Date.parse(week.endDate) ? 'final' : 'active';
            return {
                number: week.number, startDate: week.startDate, endDate: week.endDate,
                name: roundTitle ?? `Week ${week.number}`,
                fullName: roundTitle ? `Jagr Cup Playoff ${roundTitle}` : `Week ${week.number}`,
                stage: round === null ? 'regular' : 'playoff', round, phase, manualFinal: manual.includes(week.number),
                matchups: core.schedule.find(round => round.week === week.number)?.matchups ?? [],
            };
        });
    }

    function assembleStandingRows(core: SourceCore, mapping: FantraxTeamRow[], franchises: Awaited<ReturnType<LiveSeasonSource['franchises']>>, archivedPlayerIds: Set<string>) {
        const franchiseFor = new Map(mapping.map(row => [row.fantraxTeamId, row.franchiseId]));
        const identities = new Map(franchises.map(franchise => [franchise.id, franchise]));
        const standings = new Map(core.standings.map(standing => [standing.teamId, standing]));
        return core.teams.map(team => {
            const franchiseId = franchiseFor.get(team.id);
            const franchise = franchiseId === undefined ? undefined : identities.get(franchiseId);
            if (!franchise) console.warn(`Fantrax team ${team.id} (${team.name}) ${franchiseId === undefined
                ? `has no franchise in league.fantrax_teams for ${core.seasonYear}`
                : `maps to franchise ${franchiseId}, which is missing from league.current_teams`}; showing its Fantrax name.`);
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
                        // Fantrax gives a free agent's NHL team as "(N/A)".
                        lineupPosition: item.position, nhlTeam: player?.team === '(N/A)' ? 'FA' : player?.team ?? '—', status: item.status, inArchive: archivedPlayerIds.has(item.id),
                    };
                }).sort((a, b) => a.name.localeCompare(b.name)),
            };
            const standing = standings.get(team.id);
            return { team: live, rank: standing?.rank ?? null, record: standing?.record ?? null, points: standing?.points ?? null };
        }).sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.team.name.localeCompare(b.team.name));
    }

    async function loadCore(fresh: boolean) {
        const [core, mapping, franchises, archivedPlayerIds] = await Promise.all([
            source.core({ fresh }), source.fantraxTeams(), source.franchises(), source.archivedPlayerIds(),
        ]);
        const fantraxLeagueId = liveFantraxLeagueId(mapping);
        return { core, mapping, franchises, archivedPlayerIds: new Set(archivedPlayerIds), fantraxLeagueId, manual: await source.manualFinalWeeks(core.seasonYear) };
    }

    /**
     * The live season at `now`. `fresh` (keepers) re-reads only the core snapshot and the player directory from
     * Fantrax, so rosters are current; scores, scoring leaders and roster stats still come from the caches, which
     * keeps the Fantrax requests per visit unchanged.
     */
    async function getLiveSeason(options: { now: number; fresh?: boolean }): Promise<LiveSeasonResult> {
        const { now, fresh = false } = options;
        let loaded: Awaited<ReturnType<typeof loadCore>>;
        try {
            loaded = await loadCore(fresh);
        } catch (error) {
            console.error('Live season unavailable:', error);
            const fantraxLeagueId = await source.fantraxTeams().then(liveFantraxLeagueId).catch(() => null);
            return { status: 'unavailable', fantraxLeagueId };
        }
        const { core, mapping, franchises, archivedPlayerIds, fantraxLeagueId, manual } = loaded;
        const weeks = assembleWeeks(core, manual, now);
        const ranked = assembleStandingRows(core, mapping, franchises, archivedPlayerIds);
        const teams = ranked.map(row => row.team);
        const { playoffs, playoffTeams, byeTeams } = assemblePlayoffs(core, weeks);
        const rows = ranked.map((row, index) => ({
            ...row, bye: index < byeTeams,
            playoffLineBelow: index === playoffTeams - 1 && index < ranked.length - 1,
        }));
        // Fantrax's lineup and matchup calendars differ: the current week is the first matchup week not yet over.
        const currentWeek = weeks.find(week => now <= Date.parse(week.endDate)) ?? weeks.at(-1)!;
        const [scores, leaders, rosterStats] = await Promise.all([
            section('scores', async () => currentWeek.phase === 'upcoming' ? null
                : source.weekScores(currentWeek, core)),
            section('scoring leaders', async () => {
                const raw = await source.scoringLeaders(core);
                return { fetchedAt: raw.fetchedAt, players: raw.players.map(player => ({
                    id: player.id, name: player.name, position: player.position, points: player.points, perGame: player.perGame,
                    team: teams.find(team => team.id === player.teamId) ?? null, fantraxTeam: player.team, inArchive: archivedPlayerIds.has(player.id),
                })) };
            }),
            section('roster stats', () => source.rosterStats(core)),
        ]);
        return { status: 'available', value: {
            seasonYear: core.seasonYear, fantraxLeagueId, fetchedAt: core.fetchedAt, weeks, currentWeek,
            lineupWeek: core.lineupPeriod, teams, standings: { rows, playoffTeams, byeTeams },
            playoffs, scores, leaders, rosterStats,
        } };
    }

    /** For /api/matchups. An unknown week throws a RangeError; a week that hasn't started has no scores yet. */
    async function getWeekScores(week: number): Promise<WeekScores | null> {
        const core = await source.core({ fresh: false });
        const found = core.weeks.find(item => item.number === week);
        if (!found) throw new RangeError('Unknown week');
        if (clock() < Date.parse(found.startDate)) return null;
        return source.weekScores(found, core);
    }

    /**
     * For the cron, /api/revalidate and the admin refresh: always captures. Publishes only if every Fantrax request
     * succeeds and the capture differs from the saved snapshot apart from its fetch times; `changed` says which.
     * `fetchedAt` is the capture's, whether or not it was published.
     */
    async function refreshLiveSeason(): Promise<{ fetchedAt: string; seasonYear: number; changed: boolean }> {
        const { fetchedAt, seasonYear, changed } = await source.capture();
        return { fetchedAt, seasonYear, changed };
    }

    /**
     * For the evening cron: nothing to do once the live season is a frozen season and the next season hasn't been
     * opened, which is answered from cache with no Fantrax request or query; otherwise a refresh, published only
     * if the capture changed.
     */
    async function scheduledRefresh({ now }: { now: number }): Promise<ScheduledRefresh> {
        const [mapping, saved] = await Promise.all([source.fantraxTeams(), source.savedSchedule()]);
        if (isFrozenSeason(saved, liveFantraxSeasonYear(mapping), now)) return { outcome: 'frozen' };
        const { fetchedAt, seasonYear, changed } = await refreshLiveSeason();
        return { outcome: changed ? 'published' : 'unchanged', fetchedAt, seasonYear };
    }

    /**
     * The live season's year (the latest season year in the Fantrax team mapping), or null when it maps none.
     * Read from the cached mapping, which only a league configuration change clears, so it costs nothing.
     */
    async function liveSeasonYear(): Promise<number | null> {
        return liveFantraxSeasonYear(await source.fantraxTeams()) ?? null;
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

    return { getLiveSeason, getWeekScores, liveSeasonYear, refreshLiveSeason, scheduledRefresh, setWeekFinal };
}

/**
 * The playoffs as Fantrax's settings and schedule have them, with the standings' playoff team and bye counts. They
 * come from the first round's seeding while the schedule gives it, then from its byes once seeded (a bye is a
 * pairing with one side), and only failing both from Fantrax's playoff team setting.
 */
function assemblePlayoffs(core: SourceCore, weeks: Week[]): { playoffs: LivePlayoffs; playoffTeams: number; byeTeams: number } {
    const rounds = weeks.filter(week => week.round !== null);
    const seeding = core.playoffs.seeding ?? [];
    const firstRound = rounds[0]?.matchups ?? [];
    const oneSided = (pairing: { away: unknown; home: unknown }) => (pairing.away === null) !== (pairing.home === null);
    let teams: number, byes: number;
    if (seeding.length) {
        teams = seeding.flatMap(pairing => [pairing.away, pairing.home]).filter(seed => seed !== null).length;
        byes = seeding.filter(oneSided).length;
    } else if (firstRound.length) {
        // Every team has a game in the seeded first round, consolation games included, so only the byes count:
        // each round halves the bracket, and the byes fill its first round.
        byes = firstRound.filter(matchup => oneSided({ away: matchup.away.id ?? null, home: matchup.home.id ?? null })).length;
        teams = 2 ** rounds.length - byes;
    } else {
        teams = core.playoffs.numPlayoffTeams ?? 0;
        byes = 0;
    }
    return { playoffs: { rounds, fitsFormat: rounds.length === PLAYOFF_FORMAT.rounds.length }, playoffTeams: teams, byeTeams: byes };
}