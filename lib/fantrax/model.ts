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

export function periodPhase(period: Period, now: number): 'upcoming' | 'active' | 'complete' {
    if (now < Date.parse(period.startDate)) return 'upcoming';
    return now <= Date.parse(period.endDate) ? 'active' : 'complete';
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
