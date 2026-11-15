import Link from 'next/link';
import { redirect } from 'next/navigation';
import Arrow from '@/components/arrow';
import BallotEditor from '@/components/award-vote/ballot-editor';
import { awardVote } from '@/lib/award-vote/award-vote';
import { saveBallotDraft, submitBallot } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My ballot · YOFHL', robots: { index: false, follow: false } };

// The open award vote's ballot for the signed-in owner's franchise.
export default async function BallotPage() {
    const view = await awardVote.readOwnerBallot({});
    if (view.status === 'signed-out') redirect('/owner');
    return <main className="mx-auto max-w-[1080px] px-4 py-8 md:px-8">
        <Link href="/owner" className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-rink-blue hover:underline"><Arrow direction="left" /> Manage my team</Link>
        {view.status === 'no-vote'
            ? <section className="rounded-2xl border border-line bg-white p-8">
                <h1 className="text-2xl font-extrabold">No award vote is open</h1>
                <p className="mt-3 text-sm text-ink-soft">The ballot opens here once the league owner opens voting after the Final.</p>
            </section>
            : <BallotEditor view={view} saveAction={saveBallotDraft} submitAction={submitBallot} />}
    </main>;
}
