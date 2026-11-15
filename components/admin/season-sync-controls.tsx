'use client';

import { syncSeasonStats } from '@/app/admin/fantrax-actions';
import type { SeasonSyncStatus } from '@/lib/season-sync/status';
import { ADMIN_BUTTON, AdminActionStatus, easternTime as time, useAdminAction } from './admin-action';
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

function changes({ teamSeasons, playerSeasons, playoffGames, championshipRoster, skaterCategories, regularSeasonGames, weeks }: SeasonSyncStatus['changed']) {
    const parts = [
        playerSeasons && plural(playerSeasons, 'player season'),
        teamSeasons && plural(teamSeasons, 'team season'),
        regularSeasonGames && plural(regularSeasonGames, 'regular-season game'),
        weeks && plural(weeks, 'week'),
        playoffGames && plural(playoffGames, 'playoff game'),
        championshipRoster && plural(championshipRoster, 'championship roster player'),
        skaterCategories && `category totals for ${plural(skaterCategories, 'skater')}`,
    ].filter(Boolean);
    return parts.length ? parts.join(', ') : 'nothing';
}

// The season sync's status and its "Sync season stats" button, beside the Fantrax controls.
export default function SeasonSyncControls({ status }: { status: SeasonSyncStatus | null }) {
    // a failed run is recorded on the status row, so the panel refreshes either way
    const { pending, result, run } = useAdminAction({ refreshAfterError: true });

    return <section aria-labelledby="season-sync-heading" aria-busy={pending} className="mb-6 rounded-3xl border border-line bg-white p-5 shadow-card">
        <h2 id="season-sync-heading" className="font-wide text-xl font-extrabold">Season sync</h2>
        <p className="mt-2 text-sm text-ink-soft">Writes the live season into the archive daily at 6 a.m. Eastern (7 a.m. in daylight time).</p>
        {status ? <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="font-bold">Last run</dt><dd>{time(status.lastRunAt)}</dd>
            <dt className="font-bold">Last success</dt><dd>{status.lastSuccessAt ? time(status.lastSuccessAt) : 'Never'}</dd>
            {status.lastSuccessAt && <><dt className="font-bold">Changed</dt><dd>{changes(status.changed)}</dd></>}
            {status.autoRosterFranchiseId !== null && <><dt className="font-bold">Championship roster</dt><dd>Written automatically, not yet saved in the roster editor</dd></>}
            {status.frozenAt && <><dt className="font-bold">Frozen</dt><dd>{time(status.frozenAt)}</dd></>}
        </dl> : <p className="mt-3 text-sm text-ink-soft">Not run yet.</p>}
        {status?.lastError && <p role="alert" className="mt-3 text-sm text-rink-red">Last error: {status.lastError}</p>}
        {!!status?.warnings.length && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm font-semibold text-gold-deep">
            {status.warnings.map(warning => <li key={warning}>{warning}</li>)}
        </ul>}
        <button type="button" className={`${ADMIN_BUTTON} mt-4`} disabled={pending} onClick={() => run(syncSeasonStats)}>Sync season stats</button>
        <AdminActionStatus pending={pending} pendingText="Syncing…" result={result} />
    </section>;
}
