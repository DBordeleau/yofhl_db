import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PageTitle from '@/components/page-title';
import PickemWeekSection from '@/components/pickem/pickem-week-section';
import WeekSwitcher from '@/components/pickem/week-switcher';
import { seasonLabel } from '@/lib/league';
import { pickem } from '@/lib/pickem/pickem';
import { PICKEM_LAUNCH } from '@/lib/pickem/settings';

export const metadata: Metadata = {
    title: "Pick'em · YOFHL",
    description: "One Pick'em week: pick every matchup until the lock, then see how the picks split.",
};

// Any Pick'em week, read for nobody like /pickem: pick controls until the lock, the breakdown from then on. A week
// turns into its breakdown at its lock, so it is rebuilt every minute.
export const revalidate = 60;

export default async function PickemWeekPage({ params }: { params: Promise<{ week: string }> }) {
    if (!PICKEM_LAUNCH) notFound();
    const { week: asked } = await params;
    if (!/^\d{1,3}$/.test(asked)) notFound();
    const read = await pickem.readWeek({ now: Date.now(), week: Number(asked), asker: 'nobody' });
    if (read.status === 'no-week') notFound();
    return <main className="mx-auto max-w-3xl px-4 py-10 md:px-8">
        <PageTitle eyebrow={read.status === 'week' ? seasonLabel(read.week.seasonYear) : undefined} title="Pick'em" />
        {read.status === 'week' && <WeekSwitcher weeks={read.weeks} selected={read.week.week} />}
        {read.status === 'week'
            ? <PickemWeekSection week={read.week} link={{ href: '/pickem', label: 'Next week to lock' }} />
            : <p className="mt-8 text-center text-ink-soft">Matchups are unavailable right now. Try again soon.</p>}
    </main>;
}
