import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import PageTitle from '@/components/page-title';
import PickemWeekSection from '@/components/pickem/pickem-week-section';
import WeekSwitcher from '@/components/pickem/week-switcher';
import { seasonLabel } from '@/lib/league';
import { pickem } from '@/lib/pickem/pickem';
import { PICKEM_LAUNCH } from '@/lib/pickem/settings';

export const metadata: Metadata = {
    title: "Pick'em · YOFHL",
    description: "One locked Pick'em week of a past season: how the Pick'em picks split and who called it.",
};

// A locked week of a past season, read for nobody from Pick'em's own record. Weeks of the season being played live
// at /pickem/week/[week].
export const revalidate = 60;

export default async function PickemSeasonWeekPage({ params }: { params: Promise<{ season: string; week: string }> }) {
    if (!PICKEM_LAUNCH) notFound();
    const { season, week: asked } = await params;
    if (!/^\d{4}$/.test(season) || !/^\d{1,3}$/.test(asked)) notFound();
    const seasonYear = Number(season);
    const read = await pickem.readWeek({ now: Date.now(), seasonYear, week: Number(asked), asker: 'nobody' });
    if (read.status === 'no-week') notFound();
    if (read.status === 'week' && read.beingPlayed) redirect(`/pickem/week/${read.week.week}`);
    return <main className="mx-auto max-w-3xl px-4 py-10 md:px-8">
        <PageTitle eyebrow={seasonLabel(seasonYear)} title="Pick'em" />
        {read.status === 'week' ? <>
            <WeekSwitcher weeks={read.weeks} selected={read.week.week} base={`/pickem/${seasonYear}/week`} />
            <PickemWeekSection week={read.week} link={{ href: `/pickem/${seasonYear}`, label: `${seasonLabel(seasonYear)} Pick'em leaderboard` }} />
        </> : <p className="mt-8 text-center text-ink-soft">This season is unavailable right now. Try again soon.</p>}
    </main>;
}
