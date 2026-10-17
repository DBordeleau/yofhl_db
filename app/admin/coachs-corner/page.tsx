import Link from 'next/link';
import AdminHeader from '@/components/admin/admin-header';
import LoginForm from '@/components/admin/login-form';
import Arrow from '@/components/arrow';
import { adminConfigured, isAdmin } from '@/lib/admin/auth';
import { getAllEpisodes } from '@/lib/data/coachs-corner';

export const dynamic = 'force-dynamic';

const runtime = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`;

export default async function AdminCoachsCorner() {
    if (!(await isAdmin())) return <LoginForm next="/admin/coachs-corner" configured={adminConfigured()} />;
    const episodes = await getAllEpisodes();

    return (
        <>
            <AdminHeader title="Coach’s Corner" back />
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <p className="max-w-2xl text-sm text-ink-soft">Paste a script, check it in the preview, then publish. The newest published episode plays at <Link href="/coachs-corner" className="font-bold text-rink-blue hover:text-ink">/coachs-corner</Link>.</p>
                <Link href="/admin/coachs-corner/new" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-bold text-white hover:bg-[#232C4A]">New episode</Link>
            </div>
            {episodes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line-strong bg-white p-8 text-center">
                    <p className="font-wide text-lg font-extrabold">No episodes yet</p>
                    <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">Until one is published, the page plays the bundled opening-week pilot.</p>
                    <Link href="/admin/coachs-corner/new?from=pilot" className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-line-strong px-4 text-sm font-bold text-ink hover:border-rink-blue">Start from the pilot script</Link>
                </div>
            ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white shadow-card">
                    {episodes.map((e) => (
                        <li key={e.id}>
                            <Link href={`/admin/coachs-corner/${e.id}`} className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 hover:bg-ice">
                                <span className="font-narrow text-center text-2xl font-black tabular">{e.week ?? '—'}</span>
                                <span className="min-w-0">
                                    <span className="block truncate font-bold">{e.title}</span>
                                    <span className="mt-0.5 block text-xs text-ink-muted">/coachs-corner/{e.slug} · {runtime(e.durationMs)}</span>
                                </span>
                                <span className="flex items-center gap-3">
                                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${e.publishedAt ? 'bg-[#DDF3E6] text-[#1E7A4D]' : 'bg-award-single text-gold-deep'}`}>{e.publishedAt ? 'Published' : 'Draft'}</span>
                                    <Arrow className="text-xl" />
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
}
