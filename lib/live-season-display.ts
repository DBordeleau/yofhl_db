// How the home page and admin show the live season's weeks and rosters. Client components import these as
// values, so they live outside the live season module: its entry point pulls in the database and Next's cache.
import type { LivePlayer, RosterStats } from './fantrax/live-season';

export function shortDate(date: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric' }).format(new Date(date));
}

/** "Oct 12 – Oct 16", in the league's Eastern Time */
export function weekLabel(week: { startDate: string; endDate: string }): string {
    return `${shortDate(week.startDate)} – ${shortDate(week.endDate)}`;
}

export function sortRosterPlayers(players: LivePlayer[], stats: RosterStats | null): LivePlayer[] {
    return [...players].sort((a, b) =>
        (stats?.players[b.id]?.points ?? -Infinity) - (stats?.players[a.id]?.points ?? -Infinity) || a.name.localeCompare(b.name));
}

// Bench and IR players stay with their assigned position; minors remain separate.
export function rosterGroup(player: LivePlayer): string {
    if (['ACTIVE', 'RESERVE', 'INJURED_RESERVE'].includes(player.status)) {
        return ['LW', 'C', 'RW', 'D', 'G'].includes(player.lineupPosition) ? player.lineupPosition : 'OTHER';
    }
    return player.status === 'MINORS' ? 'MINORS' : 'OTHER';
}
