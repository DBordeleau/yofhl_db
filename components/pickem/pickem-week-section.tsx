import Link from 'next/link';
import PickemBreakdown from '@/components/pickem/pickem-breakdown';
import PickemWeek from '@/components/pickem/pickem-week';
import PickemWhosIn from '@/components/pickem/pickem-whos-in';
import type { PickemWeek as Week } from '@/lib/pickem/create-pickem';

const lockTime = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

/** One Pick'em week as the public page shows it: pick controls until the lock, the breakdown from then on */
export default function PickemWeekSection({ week, link }: { week: Week; link?: { href: string; label: string } }) {
    const locked = week.phase === 'locked';
    return <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-wide text-xl font-extrabold uppercase">{week.name}</h2>
            <p className="text-sm font-bold text-ink-soft">{locked ? 'Locked' : 'Locks'} {lockTime.format(new Date(week.lock))} ET</p>
        </div>
        {link && <Link href={link.href} className="mt-2 inline-block text-sm font-bold text-rink-red underline">{link.label}</Link>}
        {week.whosIn && <PickemWhosIn whosIn={week.whosIn} />}
        {locked && week.breakdown
            ? <PickemBreakdown seasonYear={week.seasonYear} week={week.week} breakdown={week.breakdown} />
            : <PickemWeek key={week.week} seasonYear={week.seasonYear} week={week.week} matchups={week.matchups} locked={locked} />}
    </section>;
}
