import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PageTitle from '@/components/page-title';
import PickemWeek from '@/components/pickem/pickem-week';
import PickemWhosIn from '@/components/pickem/pickem-whos-in';
import WeekSwitcher from '@/components/pickem/week-switcher';
import { seasonLabel } from '@/lib/league';
import { pickem } from '@/lib/pickem/pickem';
import { PICKEM_LAUNCH } from '@/lib/pickem/settings';

export const metadata: Metadata = {
    title: "Pick'em · YOFHL",
    description: 'Owners call the winner of every regular-season matchup.',
};

// The public page reads for nobody; the next week to lock turns over at noon, so it is rebuilt every minute.
export const revalidate = 60;

/** The week asked for in `?week=`, or the next week to lock */
const weekParam = (value: string | string[] | undefined) => {
    const week = typeof value === 'string' && /^\d{1,2}$/.test(value) ? Number(value) : undefined;
    return week || undefined;
};

const lockTime = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

export default async function PickemPage({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
    if (!PICKEM_LAUNCH) notFound();
    const asked = weekParam((await searchParams).week);
    const now = Date.now();
    let read = await pickem.readWeek({ now, week: asked, asker: 'nobody' });
    if (asked !== undefined && read.status === 'no-week') read = await pickem.readWeek({ now, asker: 'nobody' });
    const week = read.status === 'week' ? read.week : null;
    return <main className="mx-auto max-w-3xl px-4 py-10 md:px-8">
        <PageTitle eyebrow={week ? seasonLabel(week.seasonYear) : undefined} title="Pick'em" />
        {read.status === 'week' && <WeekSwitcher weeks={read.weeks} selected={read.week.week} />}
        {week ? <section className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-wide text-xl font-extrabold uppercase">{week.name}</h2>
                <p className="text-sm font-bold text-ink-soft">{week.phase === 'locked' ? 'Locked' : 'Locks'} {lockTime.format(new Date(week.lock))} ET</p>
            </div>
            {week.whosIn && <PickemWhosIn whosIn={week.whosIn} />}
            <PickemWeek key={week.week} seasonYear={week.seasonYear} week={week.week} matchups={week.matchups} locked={week.phase === 'locked'} />
        </section> : <p className="mt-8 text-center text-ink-soft">
            {read.status === 'unavailable' ? 'Matchups are unavailable right now. Try again soon.' : 'No week is open for picks.'}
        </p>}
    </main>;
}
