export interface Period {
    number: number;
    startDate: string;
    endDate: string;
}

export interface SnapshotPlayer {
    id: string;
    name: string;
    position: string;
    lineupPosition: string;
    nhlTeam: string;
    status: string;
    archiveId: string | null;
}

export interface RosterStats {
    fetchedAt: string;
    players: Record<string, { points: number | null; perGame: number | null }>;
}

export function sortRosterPlayers(players: SnapshotPlayer[], stats: RosterStats | null): SnapshotPlayer[] {
    return [...players].sort((a, b) =>
        (stats?.players[b.id]?.points ?? -Infinity) - (stats?.players[a.id]?.points ?? -Infinity) || a.name.localeCompare(b.name));
}

// Bench and IR players stay with their assigned position; minors remain separate.
export function rosterGroup(player: SnapshotPlayer): string {
    if (['ACTIVE', 'RESERVE', 'INJURED_RESERVE'].includes(player.status)) {
        return ['LW', 'C', 'RW', 'D', 'G'].includes(player.lineupPosition) ? player.lineupPosition : 'OTHER';
    }
    return player.status === 'MINORS' ? 'MINORS' : 'OTHER';
}

export interface SnapshotTeam {
    id: string;
    franchiseId: number | null;
    name: string;
    abbreviation: string;
    logo: string | null;
    owner: string | null;
    rank: number | null;
    record: string | null;
    points: number | null;
    players: SnapshotPlayer[];
}

export interface ScheduledMatchup {
    away: { id?: string; name?: string; TBD?: boolean };
    home: { id?: string; name?: string; TBD?: boolean };
}

// Future playoff slots contain { TBD: true } on both sides, not real teams or byes.
export function publishedMatchups(matchups: ScheduledMatchup[]): ScheduledMatchup[] {
    return matchups.filter(matchup => matchup.away.id || matchup.home.id);
}

export interface LeagueSnapshot {
    fetchedAt: string;
    seasonYear: number;
    teams: SnapshotTeam[];
    scoringPeriods: Period[];
    rosterPeriod: Period | null;
    schedule: { period: number; matchupList: ScheduledMatchup[] }[];
    playoffTeams: number;
    lastRegularSeasonPeriod: number;
    finalPeriods: number[];
}

export interface MatchupScores {
    fetchedAt: string;
    period: number;
    matchups: {
        away: { teamId: string; score: number; gamesPlayed: number };
        home: { teamId: string; score: number; gamesPlayed: number };
    }[];
}

// Fantrax has separate lineup and matchup calendars. Never derive either from week numbers.
export function selectPeriod(periods: Period[], requested: string | undefined, now: number): Period | null {
    const explicit = requested && /^\d+$/.test(requested) ? periods.find(p => p.number === Number(requested)) : null;
    return explicit || periods.find(p => now <= Date.parse(p.endDate)) || periods.at(-1) || null;
}

export function periodPhase(period: Period, now: number, finalPeriods: readonly number[] = []): 'upcoming' | 'active' | 'complete' {
    if (now < Date.parse(period.startDate)) return 'upcoming';
    if (finalPeriods.includes(period.number)) return 'complete';
    return now <= Date.parse(period.endDate) ? 'active' : 'complete';
}

// Fantrax can post regular-season results before its next matchup period starts.
export function automaticFinalPeriods(snapshot: {
    scoringPeriods: Period[]; schedule: LeagueSnapshot['schedule']; lastRegularSeasonPeriod: number;
    teams: Pick<SnapshotTeam, 'id' | 'record'>[];
}, now: number): number[] {
    const expected = new Map<string, number>();
    const records = new Map(snapshot.teams.map(team => [team.id,
        team.record && /^\d+-\d+-\d+$/.test(team.record) ? team.record.split('-').reduce((sum, value) => sum + Number(value), 0) : -1]));
    const final: number[] = [];
    const periods = [...snapshot.scoringPeriods].sort((a, b) => a.number - b.number);
    for (const period of periods) {
        if (period.number > snapshot.lastRegularSeasonPeriod || now < Date.parse(period.startDate)) break;
        const round = snapshot.schedule.find(item => item.period === period.number);
        // Missing schedule history cannot establish how many results a team should have.
        if (!round?.matchupList.length) break;
        const playing = new Set<string>();
        for (const matchup of round.matchupList) {
            if (!matchup.away.id || !matchup.home.id) continue; // An unpaired team has a bye.
            for (const id of [matchup.away.id, matchup.home.id]) {
                if (playing.has(id) || !records.has(id)) return final;
                playing.add(id);
                expected.set(id, (expected.get(id) ?? 0) + 1);
            }
        }
        if (playing.size && [...playing].every(id => records.get(id)! >= expected.get(id)!)) final.push(period.number);
    }
    return final;
}

export function shortDate(date: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric' }).format(new Date(date));
}

export function periodLabel(period: Period): string {
    return `${shortDate(period.startDate)} – ${shortDate(period.endDate)}`;
}

const PLAYOFF_ROUNDS = ['Grand Finals', 'Semifinals', 'Quarterfinals'];

// The last three weeks of the season are the Jagr Cup playoffs (Fantrax leaves their matchups unscheduled until
// seeding is known); every earlier week is a regular-season week.
export function weekName(period: number, seasonPeriods: number[]): { short: string; full: string; playoff: boolean } {
    const fromEnd = [...new Set(seasonPeriods)].sort((a, b) => b - a).indexOf(period);
    const round = fromEnd >= 0 ? PLAYOFF_ROUNDS[fromEnd] : undefined;
    return round ? { short: round, full: `Jagr Cup Playoff ${round}`, playoff: true } : { short: `Week ${period}`, full: `Week ${period}`, playoff: false };
}

export function playerName(name: string): string {
    const [last, first] = name.split(', ');
    return first ? `${first} ${last}` : last;
}
