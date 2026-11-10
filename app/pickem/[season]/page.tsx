import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import PageTitle from '@/components/page-title';
import PickemLeaderboard from '@/components/pickem/pickem-leaderboard';
import PickemSeasonSummary from '@/components/pickem/pickem-season-summary';
import PickemWeekSection from '@/components/pickem/pickem-week-section';
import SeasonSwitcher from '@/components/pickem/season-switcher';
import WeekSwitcher from '@/components/pickem/week-switcher';
import { seasonLabel } from '@/lib/league';
import { pickem } from '@/lib/pickem/pickem';
import { PICKEM_LAUNCH } from '@/lib/pickem/settings';

export const metadata: Metadata = {
    title: "Pick'em · YOFHL",
    description: "A past season's Pick'em: its winner, its Pick'em leaderboard and every locked week.",
};

// A past season's Pick'em, by season year, read for nobody from Pick'em's own record: its Pick'em leaderboard and
// its last week, with every other week at /pickem/[season]/week/[week]. The season being played lives at /pickem.
export const revalidate = 60;

export default async function PickemSeasonPage({ params }: { params: Promise<{ season: string }> }) {
    if (!PICKEM_LAUNCH) notFound();
    const { season } = await params;
    if (!/^\d{4}$/.test(season)) notFound();
    const seasonYear = Number(season);
    const now = Date.now();
    const [standings, read] = await Promise.all([
        pickem.readLeaderboard({ now, seasonYear }),
        pickem.readWeek({ now, seasonYear, asker: 'nobody' }),
    ]);
    if (standings.status === 'no-season') notFound();
    if (standings.status === 'leaderboard' && standings.beingPlayed) redirect('/pickem');
    return <main className="mx-auto max-w-3xl px-4 py-10 md:px-8">
        <PageTitle eyebrow={seasonLabel(seasonYear)} title="Pick'em" />
        {standings.status === 'leaderboard' ? <>
            <SeasonSwitcher seasons={standings.seasons} selected={seasonYear} beingPlayed={null} />
            <PickemSeasonSummary seasonYear={seasonYear} winners={standings.leaderboard.winners} />
            <PickemLeaderboard entries={standings.leaderboard.entries} />
        </> : <p className="mt-8 text-center text-ink-soft">This season is unavailable right now. Try again soon.</p>}
        {read.status === 'week' && <>
            <WeekSwitcher weeks={read.weeks} selected={read.week.week} base={`/pickem/${seasonYear}/week`} />
            <PickemWeekSection week={read.week} />
        </>}
    </main>;
}
