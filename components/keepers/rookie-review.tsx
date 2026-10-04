'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { reviewRookie } from '@/app/admin/keepers/actions';
import { CALDER_SEASON, CALDER_SEASON_LABEL, currentRookieReview, type KeeperSubmission } from '@/lib/keepers/model';

export default function RookieReview({ submission }: { submission: KeeperSubmission }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();
    if (!submission.rookieId) return null;
    const rookie = submission.roster.find(player => player.id === submission.rookieId);
    const review = currentRookieReview(submission.rookieReviews[submission.rookieId]);
    if (submission.rookieSeason !== CALDER_SEASON) return <p className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-950">The owner must confirm eligibility for the {CALDER_SEASON_LABEL} Calder Memorial Trophy before this rookie can be reviewed.</p>;
    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault(); setBusy(true); setError('');
        const form = new FormData(event.currentTarget);
        const button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        form.set('status', button?.value ?? '');
        try {
            const result = await reviewRookie(form);
            if (result.error) setError(result.error);
            else router.refresh();
        } catch { setError('Could not confirm this review. Reload and check its status.'); }
        finally { setBusy(false); }
    }
    return <form onSubmit={submit} className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h4 className="text-sm font-extrabold">Free rookie: {rookie?.name} · {CALDER_SEASON_LABEL} Calder Memorial Trophy</h4>
        <p className="mt-1 text-xs text-amber-950">{review?.status === 'approved' ? 'Approved' : review?.status === 'rejected' ? 'Rejected — owner correction required' : 'Owner declared Calder eligibility. Awaiting your review.'}</p>
        <input type="hidden" name="franchiseId" value={submission.franchiseId} /><input type="hidden" name="version" value={submission.version} /><input type="hidden" name="rookieId" value={submission.rookieId} />
        <label className="mt-3 block text-xs font-bold">Note to owner (required when rejecting)<textarea name="note" defaultValue={review?.note ?? ''} maxLength={500} rows={2} className="mt-1 block w-full rounded-lg border border-amber-200 bg-white p-2 text-sm font-normal" /></label>
        <div className="mt-3 flex flex-wrap gap-2"><button disabled={busy} name="status" value="approved" className="min-h-11 rounded-lg bg-ink px-4 text-xs font-bold text-white disabled:opacity-50">Approve eligibility</button><button disabled={busy} name="status" value="rejected" className="min-h-11 rounded-lg border border-red-300 bg-white px-4 text-xs font-bold text-red-800 disabled:opacity-50">Reject declaration</button></div>
        {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
    </form>;
}
