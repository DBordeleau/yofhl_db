import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { listLocalDrafts, localPreviewAllowed } from '@/lib/coachs-corner/production/local-drafts';

export const dynamic = 'force-dynamic';
export const metadata = { title: "Local Coach's Corner drafts", robots: { index: false, follow: false } };

export default async function LocalDraftsPage() {
    if (!localPreviewAllowed(process.env.NODE_ENV, (await headers()).get('host'), !!process.env.VERCEL)) notFound();
    const slugs = await listLocalDrafts();
    return <main className="mx-auto max-w-4xl px-5 py-10">
        <p className="text-sm font-bold uppercase tracking-wider text-rink-red">Local production</p>
        <h1 className="mt-2 text-3xl font-bold">Coach&apos;s Corner drafts</h1>
        <p className="mt-3 text-ink-muted">Choose a draft to watch and review.</p>
        <ul className="mt-6 space-y-3">
            {slugs.map(slug => <li key={slug}><Link className="block rounded-xl border border-line-strong bg-white p-4 font-bold underline" href={`/coachs-corner/local/${slug}`}>{slug}</Link></li>)}
        </ul>
        {!slugs.length && <p className="mt-6">No local drafts yet. Start an episode with the produce-coachs-corner repository skill.</p>}
    </main>;
}
