import Link from 'next/link';
import AdminHeader from '@/components/admin/admin-header';
import LoginForm from '@/components/admin/login-form';
import { adminConfigured, isAdmin } from '@/lib/admin/auth';
import { getSeasonStatuses } from '@/lib/admin/data';

export const dynamic = 'force-dynamic';

const Check = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
    <li className="flex items-center gap-2 text-sm">
        <span className={`inline-flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-black ${ok ? 'bg-[#DDF3E6] text-[#1E7A4D]' : 'bg-award-single text-gold-deep'}`} aria-hidden="true">
            {ok ? '✓' : '!'}
        </span>
        <span className={ok ? 'text-ink-soft' : 'font-semibold text-ink'}>{children}</span>
        <span className="sr-only">{ok ? '(done)' : '(needs attention)'}</span>
    </li>
);

// season checklist at /admin
export default async function AdminHome() {
    if (!(await isAdmin())) return <LoginForm next="/admin" configured={adminConfigured()} />;
    const seasons = await getSeasonStatuses();

    return (
        <>
            <AdminHeader title="Seasons" />
            <Link href="/admin/lottery" className="mb-6 flex items-center justify-between gap-4 rounded-2xl bg-ink p-5 text-white hover:bg-[#232C4A]">
                <div><p className="font-wide text-lg font-extrabold">Draft lottery</p><p className="mt-1 text-sm text-slate-300">Schedule the live event, set odds and build the draft order.</p></div>
                <span aria-hidden="true" className="text-2xl">→</span>
            </Link>
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {seasons.map((s) => {
                    const playoffs = s.playoffStatus === 'complete';
                    const ready = s.teams > 0 && (!playoffs || (s.champion && s.roster > 0)) && s.awards >= s.awardsExpected;
                    return (
                        <li key={s.year} className="flex flex-col rounded-3xl border border-line bg-white p-5 shadow-card">
                            <div className="mb-3 flex items-baseline justify-between gap-2">
                                <span className="font-wide text-xl font-extrabold uppercase">{s.label}</span>
                                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${ready ? 'bg-[#DDF3E6] text-[#1E7A4D]' : 'bg-award-single text-gold-deep'}`}>
                                    {ready ? 'Complete' : 'Needs attention'}
                                </span>
                            </div>
                            <ul className="mb-4 space-y-1.5">
                                <Check ok={s.teams > 0}>Imported: {s.teams} teams, {s.players} players</Check>
                                {playoffs ? (
                                    <>
                                        <Check ok={!!s.champion}>{s.champion ? `Champion: ${s.champion}` : 'No champion in the bracket'}</Check>
                                        <Check ok={s.roster > 0}>{s.roster ? `Ring roster: ${s.roster} players` : 'Ring roster not set'}</Check>
                                    </>
                                ) : (
                                    <Check ok>Playoffs cancelled</Check>
                                )}
                                <Check ok={s.awards >= s.awardsExpected}>Awards: {s.awards} of {s.awardsExpected}</Check>
                                {s.overrides > 0 && <Check ok>{s.overrides} bracket correction{s.overrides === 1 ? '' : 's'}</Check>}
                            </ul>
                            <Link href={`/admin/seasons/${s.year}`} className="mt-auto inline-flex min-h-11 items-center justify-center rounded-xl bg-ink px-4 text-sm font-bold text-white hover:bg-[#232C4A]">
                                Edit {s.label}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </>
    );
}
