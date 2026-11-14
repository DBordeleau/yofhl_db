'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { syncSeasonStats } from '@/app/admin/fantrax-actions';
import type { SeasonSyncStatus } from '@/lib/season-sync/status';

const time = (value: string) => `${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))} ET`;
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

function changes({ teamSeasons, playerSeasons, playoffGames }: SeasonSyncStatus['changed']) {
    const parts = [
        playerSeasons && plural(playerSeasons, 'player season'),
        teamSeasons && plural(teamSeasons, 'team season'),
        playoffGames && plural(playoffGames, 'playoff game'),
    ].filter(Boolean);
    return parts.length ? parts.join(', ') : 'nothing';
}

// The season sync's status and its "Sync season stats" button, beside the Fantrax controls.
export default function SeasonSyncControls({ status }: { status: SeasonSyncStatus | null }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [result, setResult] = useState<{ message: string } | { error: string } | null>(null);
    const run = () => {
        setResult(null);
        startTransition(async () => {
            try {
                const value = await syncSeasonStats();
                setResult(value);
                router.refresh();
            } catch {
                setResult({ error: 'The request failed. Reload the page and try again.' });
            }
        });
    };

    return <section aria-labelledby="season-sync-heading" aria-busy={pending} className="mb-6 rounded-3xl border border-line bg-white p-5 shadow-card">
        <h2 id="season-sync-heading" className="font-wide text-xl font-extrabold">Season sync</h2>
        <p className="mt-2 text-sm text-ink-soft">Writes the live season into the archive every morning at 11:00 UTC.</p>
        {status ? <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="font-bold">Last run</dt><dd>{time(status.lastRunAt)}</dd>
            <dt className="font-bold">Last success</dt><dd>{status.lastSuccessAt ? time(status.lastSuccessAt) : 'Never'}</dd>
            {status.lastSuccessAt && <><dt className="font-bold">Changed</dt><dd>{changes(status.changed)}</dd></>}
            {status.frozenAt && <><dt className="font-bold">Frozen</dt><dd>{time(status.frozenAt)}</dd></>}
        </dl> : <p className="mt-3 text-sm text-ink-soft">Not run yet.</p>}
        {status?.lastError && <p role="alert" className="mt-3 text-sm text-rink-red">Last error: {status.lastError}</p>}
        {!!status?.warnings.length && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm font-semibold text-gold-deep">
            {status.warnings.map(warning => <li key={warning}>{warning}</li>)}
        </ul>}
        <button type="button" className="mt-4 min-h-11 rounded-xl bg-ink px-4 text-sm font-bold text-white hover:bg-[#232C4A] disabled:cursor-wait disabled:opacity-50" disabled={pending} onClick={run}>Sync season stats</button>
        <div className="mt-3 text-sm" aria-live="polite">{pending ? 'Syncing…' : result && ('error' in result ? <p role="alert" className="text-rink-red">{result.error}</p> : <p>{result.message}</p>)}</div>
    </section>;
}
