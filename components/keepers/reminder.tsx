'use client';

import Link from 'next/link';
import { useKeeperDeadline } from './use-deadline';
import Arrow from '@/components/arrow';

export interface KeeperReminderState { status: 'missing' | 'invalid' | 'roster_changed' | 'submitted'; serverNow: string }
export default function KeeperReminder({ state }: { state: KeeperReminderState }) {
    const closed = useKeeperDeadline(state.serverNow);
    if (closed || state.status === 'submitted') return null;
    return <aside aria-label="Keeper deadline reminder" className="border-y border-yellow-300 bg-yellow-50 text-ink">
        <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 text-sm md:px-8 3xl:max-w-page-3xl 4xl:max-w-page-4xl">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-yellow-300 bg-yellow-200/70" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 4.2 2.5 17.7A2 2 0 0 0 4.2 21h15.6a2 2 0 0 0 1.7-3.3L13.7 4.2a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></svg></span>
            <p className="min-w-0 flex-1"><strong className="block font-extrabold">{state.status === 'missing' ? 'Submit your keepers.' : state.status === 'roster_changed' ? 'Your roster changed. Review your keepers.' : 'Your keeper list needs a correction.'}</strong><span className="mt-1 block text-xs text-ink-soft">Due Friday, Oct 9 at 7 p.m. Eastern.</span></p>
            <Link href="/owner/keepers" className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-xl bg-ink px-4 font-bold text-white transition-colors hover:bg-jagr-dark-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rink-blue focus-visible:ring-offset-2 sm:w-auto">{state.status === 'missing' ? 'Choose keepers' : 'Review keepers'} <Arrow className="ml-2" /></Link>
        </div>
    </aside>;
}
