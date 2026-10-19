import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { checkDraft, loadLocalDraft, localPreviewAllowed, validSlug } from '@/lib/coachs-corner/production/local-drafts';
import LocalDraftPreview from '@/components/coachs-corner/local-draft-preview';
import { archivoItalic } from '@/components/coachs-corner/fonts';

export const dynamic = 'force-dynamic';
export const metadata = { title: "Coach's Corner draft review", robots: { index: false, follow: false } };

export default async function LocalDraftPage({ params }: { params: Promise<{ slug: string }> }) {
    if (!localPreviewAllowed(process.env.NODE_ENV, (await headers()).get('host'), !!process.env.VERCEL)) notFound();
    const { slug } = await params;
    if (!validSlug(slug)) notFound();
    let draft;
    try { draft = await loadLocalDraft(slug); }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') notFound();
        return <main className="mx-auto max-w-4xl p-8"><h1 className="text-2xl font-bold">Draft needs repair</h1><p className="mt-4">{(error as Error).message}</p><Link className="underline" href="/coachs-corner/local">All local drafts</Link></main>;
    }
    const report = await checkDraft(draft);
    const captured = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(draft.facts.capturedAt));
    return <main className={`${archivoItalic.variable} mx-auto max-w-7xl px-4 py-8`}>
        <Link className="text-sm underline" href="/coachs-corner/local">All local drafts</Link>
        <div className="my-4 flex flex-wrap items-baseline justify-between gap-3">
            <h1 className="text-3xl font-bold">{slug}</h1>
            <span className="rounded bg-ink px-3 py-1 text-sm font-bold text-white">Unpublished local draft</span>
        </div>
        <p className="mb-5 text-sm text-ink-muted">{draft.facts.kind === 'reference' ? 'Pilot reference' : `Week ${draft.facts.period?.number} · ${draft.facts.phase}`} · Facts captured {captured} Toronto time</p>
        <LocalDraftPreview key={draft.revision} slug={slug} script={draft.script} teams={draft.facts.teams} players={draft.facts.players} report={report} />
        <div className="mt-6 grid gap-4 md:grid-cols-2">
            <details className="rounded-xl border border-line-strong bg-white p-4"><summary className="cursor-pointer font-bold">Episode brief</summary><pre className="mt-3 whitespace-pre-wrap font-sans text-sm">{draft.brief}</pre></details>
            <details className="rounded-xl border border-line-strong bg-white p-4" open><summary className="cursor-pointer font-bold">Editorial review</summary><pre className="mt-3 whitespace-pre-wrap font-sans text-sm">{draft.review}</pre></details>
            <details className="rounded-xl border border-line-strong bg-white p-4 md:col-span-2"><summary className="cursor-pointer font-bold">Fact sources and limitations</summary>
                <ul className="my-3 list-disc space-y-1 pl-5 text-sm">{draft.facts.limitations.map((note, i) => <li key={i}>{note}</li>)}</ul>
                <ul className="space-y-2 text-sm">{draft.facts.sources.map((source, i) => <li key={i}><a className="break-all underline" href={source.url} target="_blank" rel="noreferrer">{source.url}</a> · {source.fetchedAt}</li>)}</ul>
            </details>
        </div>
    </main>;
}
