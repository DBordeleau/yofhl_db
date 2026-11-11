import type { Metadata } from 'next';
import { pickemPrize } from '@/components/pickem/prizes';
import { seasonLabel } from '@/lib/league';
import type { PickemLeaderboardEntry, PickemWeek } from '@/lib/pickem/create-pickem';

// What each Pick'em page tells search results, the browser tab and a link dropped in the group chat: the week and
// season it shows, and what there is to do there.

const lockTime = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

function page(path: string, title: string, description: string): Metadata {
    return {
        title: `${title} · YOFHL`,
        description,
        alternates: { canonical: path },
        openGraph: { type: 'website', siteName: 'YOFHL', title, description },
        twitter: { card: 'summary', title, description },
    };
}

/** A week's page: before the lock it asks for picks; from the lock on it shows how they split */
export function pickemWeekMetadata(path: string, week: PickemWeek | null, seasonYear: number | null): Metadata {
    const season = seasonYear ? seasonLabel(seasonYear) : null;
    if (!week) return page(path, season ? `Pick'em · ${season}` : "Pick'em",
        'YOFHL owners call the winner of every regular-season matchup and race for the top of the Pick\'em leaderboard.');
    const title = `${week.name} Pick'em · ${seasonLabel(week.seasonYear)}`;
    const count = week.matchups.length;
    const matchups = count === 1 ? `the ${week.name} YOFHL matchup` : `all ${count} ${week.name} YOFHL matchups`;
    if (week.phase === 'locked') return page(path, title,
        `How the owners' Pick'em picks split on ${matchups}, who called each one, and the ${seasonLabel(week.seasonYear)} Pick'em leaderboard.`);
    const prize = pickemPrize(week.seasonYear);
    return page(path, title, `Call the winner of ${matchups} before picks lock ${lockTime.format(new Date(week.lock))} ET.` +
        (prize ? ` First place on the ${seasonLabel(week.seasonYear)} Pick'em leaderboard wins a ${prize.season} ${prize.what}.` : ''));
}

/** A past season's page: who won it, and every week's picks */
export function pickemSeasonMetadata(seasonYear: number, winners: PickemLeaderboardEntry[]): Metadata {
    const season = seasonLabel(seasonYear);
    const names = winners.map(winner => winner.franchise.name);
    const won = names.length ? ` Won by ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]}.` : '';
    return page(`/pickem/${seasonYear}`, `${season} Pick'em`,
        `The ${season} YOFHL Pick'em, where owners called the winner of every regular-season matchup.${won} The final Pick'em leaderboard and every week's picks.`);
}
