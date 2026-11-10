import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import PickemPageView from '@/components/pickem/pickem-page';
import { pickem } from '@/lib/pickem/pickem';
import { PICKEM_LAUNCH } from '@/lib/pickem/settings';

export const metadata: Metadata = {
    title: "Pick'em · YOFHL",
    description: "One locked Pick'em week of a past season: how the Pick'em picks split and who called it.",
};

// A locked week of a past season, read for nobody from Pick'em's own record, beside that season's Pick'em
// leaderboard. Weeks of the season being played live at /pickem/week/[week].
export const revalidate = 60;

export default async function PickemSeasonWeekPage({ params }: { params: Promise<{ season: string; week: string }> }) {
    if (!PICKEM_LAUNCH) notFound();
    const { season, week: asked } = await params;
    if (!/^\d{4}$/.test(season) || !/^\d{1,3}$/.test(asked)) notFound();
    const seasonYear = Number(season);
    const now = Date.now();
    const [read, standings] = await Promise.all([
        pickem.readWeek({ now, seasonYear, week: Number(asked), asker: 'nobody' }),
        pickem.readPickemLeaderboard({ now, seasonYear }),
    ]);
    if (read.status === 'no-week') notFound();
    if (read.status === 'week' && read.beingPlayed) redirect(`/pickem/week/${read.week.week}`);
    return <PickemPageView
        seasonYear={seasonYear}
        seasons={standings.status === 'leaderboard' ? { list: standings.seasons, beingPlayed: null } : undefined}
        week={read.status === 'week' ? read.week : null}
        weeks={read.status === 'week' ? read.weeks : null}
        base={`/pickem/${seasonYear}/week`}
        standings={standings.status === 'leaderboard' ? standings.leaderboard : standings.status === 'unavailable' ? 'unavailable' : null}
        message="This season is unavailable right now. Try again soon." />;
}
