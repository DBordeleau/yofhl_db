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

export function playerName(name: string): string {
    const [last, first] = name.split(', ');
    return first ? `${first} ${last}` : last;
}
