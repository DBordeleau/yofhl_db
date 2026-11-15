'use client';

// The Teemu Trophy's rookie review in admin: the rookies the NHL lookup found, the young players it could not match,
// and the young players it ruled out, each addable to or removable from the rookies until voting opens. A rehearsal
// is marked as one.
import { adjustRookie } from '@/app/admin/rookie-review-actions';
import type { RookieReview as Review, RookieReviewPlayer } from '@/lib/award-vote/create-award-vote';
import { AdminActionStatus, useAdminAction } from './admin-action';

const SMALL_BUTTON = 'min-h-11 rounded-xl border border-line-strong bg-white px-3 text-sm font-bold text-ink hover:border-rink-blue disabled:cursor-wait disabled:opacity-50';

const ADJUSTMENTS = { added: 'Added by you', removed: 'Removed by you' } as const;

export default function RookieReview({ year, review, rehearsal }: { year: number; review: Review; rehearsal: boolean }) {
    const { pending, result, run } = useAdminAction();
    const change = (player: RookieReviewPlayer) => run(() => adjustRookie(year, player.playerId, player.candidate ? 'remove' : 'add'));
    const list = (players: RookieReviewPlayer[], empty: string) => players.length ? <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm tabular-nums">
            <thead>
                <tr className="border-b border-line text-left text-xs uppercase text-ink-soft">
                    <th scope="col" className="px-2 py-2">Player</th>
                    <th scope="col" className="px-2 py-2 text-right">Age</th>
                    <th scope="col" className="px-2 py-2">NHL</th>
                    <th scope="col" className="px-2 py-2">On the ballot</th>
                    {review.adjustable && <th scope="col" className="px-2 py-2"><span className="sr-only">Change</span></th>}
                </tr>
            </thead>
            <tbody>
                {players.map(player => <tr key={player.playerId} className="border-b border-line/60">
                    <th scope="row" className="px-2 py-1.5 text-left font-semibold">
                        {player.name}
                        <span className="ml-2 text-xs font-normal text-ink-soft">{player.positions.join(', ')}{player.nhlTeam ? ` · ${player.nhlTeam}` : ''}</span>
                    </th>
                    <td className="px-2 py-1.5 text-right">{player.age ?? '—'}</td>
                    <td className="px-2 py-1.5">{player.nhlId
                        ? <a href={`https://www.nhl.com/player/${player.nhlId}`} target="_blank" rel="noreferrer" className="font-bold text-rink-blue hover:underline">{player.nhlId}</a>
                        : <span className="text-ink-soft">No match</span>}</td>
                    <td className="px-2 py-1.5">{player.candidate ? 'Yes' : 'No'}{player.adjustment && <span className="ml-2 text-xs text-ink-soft">{ADJUSTMENTS[player.adjustment]}</span>}</td>
                    {review.adjustable && <td className="px-2 py-1.5 text-right">
                        <button type="button" className={SMALL_BUTTON} disabled={pending} onClick={() => change(player)}>
                            {player.candidate ? 'Remove' : 'Add'}<span className="sr-only"> {player.name}</span>
                        </button>
                    </td>}
                </tr>)}
            </tbody>
        </table>
    </div> : <p className="mt-2 text-sm text-ink-soft">{empty}</p>;

    return <div>
        {rehearsal && <p className="mb-3 text-sm font-bold">Rehearsal: these rookies only change the rehearsal ballot, which owners never see.</p>}
        {!review.adjustable && <p className="text-sm text-ink-soft">Voting has opened, so the rookie list is final.</p>}
        <h3 className="mt-2 font-wide text-base font-extrabold uppercase">Rookies</h3>
        {list(review.rookies, 'No player is Calder-eligible by the NHL’s records.')}
        <h3 className="mt-6 font-wide text-base font-extrabold uppercase">No NHL match</h3>
        <p className="mt-1 text-sm text-ink-soft">Young players the NHL’s player search couldn’t match. Add any who are rookies.</p>
        {list(review.unmatched, 'Every young player was matched.')}
        <details className="mt-6">
            <summary className="cursor-pointer font-wide text-base font-extrabold uppercase">Not eligible</summary>
            <p className="mt-1 text-sm text-ink-soft">Young players whose NHL record rules them out. Add any matched to the wrong player.</p>
            {list(review.ineligible, 'None.')}
        </details>
        <AdminActionStatus pending={pending} pendingText="Saving…" result={result} />
    </div>;
}
