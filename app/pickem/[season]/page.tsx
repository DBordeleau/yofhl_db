import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import PickemPageView from '@/components/pickem/pickem-page';
import { pickem } from '@/lib/pickem/pickem';
import { PICKEM_LAUNCH } from '@/lib/pickem/settings';

export const metadata: Metadata = {
    title: "Pick'em · YOFHL",
    description: "A past season's Pick'em: its winner, its Pick'em leaderboard and every locked week.",
};

// A past season's Pick'em, by season year, read for nobody from Pick'em's own record: its last week beside its
// Pick'em leaderboard, with every other week at /pickem/[season]/week/[week]. The season being played lives at
// /pickem. Owners are not named on the strips: a past season's franchises may have changed hands since.
export const revalidate = 60;

export default async function PickemSeasonPage({ params }: { params: Promise<{ season: string }> }) {
    if (!PICKEM_LAUNCH) notFound();
    const { season } = await params;
    if (!/^\d{4}$/.test(season)) notFound();
    const seasonYear = Number(season);
    const now = Date.now();
    const [standings, read] = await Promise.all([
        pickem.readPickemLeaderboard({ now, seasonYear }),
        pickem.readWeek({ now, seasonYear, asker: 'nobody' }),
    ]);
    if (standings.status === 'no-season') notFound();
    if (standings.status === 'leaderboard' && standings.beingPlayed) redirect('/pickem');
    return <PickemPageView
        seasonYear={seasonYear}
        seasons={standings.status === 'leaderboard' ? { list: standings.seasons, beingPlayed: null } : undefined}
        week={read.status === 'week' ? read.week : null}
        weeks={read.status === 'week' ? read.weeks : null}
        base={`/pickem/${seasonYear}/week`}
        standings={standings.status === 'leaderboard' ? standings.leaderboard : 'unavailable'}
        message="This season is unavailable right now. Try again soon." />;
}
