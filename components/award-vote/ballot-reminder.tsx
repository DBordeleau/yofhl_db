'use client';

// The header's nudge to cast a ballot, while an award vote is open, its ballot lock ahead, and the owner's franchise
// has submitted none (the owner session's header answer decides).
import Link from 'next/link';
import Arrow from '@/components/arrow';
import type { BallotNudge } from '@/lib/award-vote/read-ballot-nudge';

const easternFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Toronto', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

export default function BallotReminder({ nudge }: { nudge: BallotNudge }) {
    return <aside aria-label="Award vote ballot reminder" className="border-y border-line bg-ice text-ink">
        <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 text-sm md:px-8 3xl:max-w-page-3xl 4xl:max-w-page-4xl">
            <p className="min-w-0 flex-1"><strong className="block font-extrabold">Cast your award vote ballot.</strong><span className="mt-1 block text-xs text-ink-soft">Ballot lock {easternFormat.format(new Date(nudge.ballotLock))} Eastern.</span></p>
            <Link href="/owner/ballot" className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-xl bg-ink px-4 font-bold text-white transition-colors hover:bg-jagr-dark-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rink-blue focus-visible:ring-offset-2 sm:w-auto">Open ballot <Arrow className="ml-2" /></Link>
        </div>
    </aside>;
}
