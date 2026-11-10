import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PageTitle from '@/components/page-title';
import PickemWeek from '@/components/pickem/pickem-week';
import PickemWhosIn from '@/components/pickem/pickem-whos-in';
import { seasonLabel } from '@/lib/league';
import { pickem } from '@/lib/pickem/pickem';
import { PICKEM_LAUNCH } from '@/lib/pickem/settings';

export const metadata: Metadata = {
    title: "Pick'em · YOFHL",
    description: 'Owners call the winner of every regular-season matchup.',
};

// The public page reads for nobody; the next week to lock turns over at noon, so it is rebuilt every minute.
export const revalidate = 60;

const lockTime = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

export default async function PickemPage() {
    if (!PICKEM_LAUNCH) notFound();
    const read = await pickem.readWeek({ now: Date.now(), asker: 'nobody' });
    const week = read.status === 'week' ? read.week : null;
    return <main className="mx-auto max-w-3xl px-4 py-10 md:px-8">
        <PageTitle eyebrow={week ? seasonLabel(week.seasonYear) : undefined} title="Pick'em" />
        {week ? <section className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-wide text-xl font-extrabold uppercase">{week.name}</h2>
                <p className="text-sm font-bold text-ink-soft">Locks {lockTime.format(new Date(week.lock))} ET</p>
            </div>
            {week.whosIn && <PickemWhosIn whosIn={week.whosIn} />}
            <PickemWeek seasonYear={week.seasonYear} week={week.week} matchups={week.matchups} />
        </section> : <p className="mt-8 text-center text-ink-soft">
            {read.status === 'unavailable' ? 'Matchups are unavailable right now. Try again soon.' : 'No week is open for picks.'}
        </p>}
    </main>;
}
