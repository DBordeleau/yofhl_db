import Link from 'next/link';
import { AwardTrophyIcon, JagrCupIcon } from '@/components/trophy-icons';
import type { FranchiseHonors } from '@/lib/history/model';
import { awardSlug, formatFpts, seasonLabel, teamSeasonHref } from '@/lib/league';

function PrimeMinisterIcon() {
    return (
        <svg viewBox="0 0 48 60" className="h-20 w-16 shrink-0 drop-shadow-[0_5px_8px_rgba(184,134,11,.2)]" aria-hidden="true">
            <path d="M13 7H6v7c0 7 5 11 11 11M35 7h7v7c0 7-5 11-11 11" fill="none" stroke="url(#yofhl-gold)" strokeWidth="3" />
            <path d="M12 3h24v13c0 8-5 14-12 14s-12-6-12-14Z" fill="url(#yofhl-gold)" stroke="#8A6410" strokeWidth=".6" />
            <path d="m24 8 2 6 4-2-1 5 4 1-7 5v3h-4v-3l-7-5 4-1-1-5 4 2Z" fill="#8A6410" />
            <path d="M21 30h6v10h-6zM16 40h16v5H16z" fill="url(#yofhl-gold)" />
            <rect x="10" y="45" width="28" height="12" rx="2" fill="#12182E" stroke="#B8860B" />
            <rect x="18" y="49" width="12" height="4" rx="1" fill="url(#yofhl-gold)" />
            <path d="M15 7v8c0 5 2 9 5 11" fill="none" stroke="white" strokeOpacity=".65" strokeLinecap="round" />
        </svg>
    );
}

export default function FranchiseTrophyCase({ franchiseId, championships, honors }: { franchiseId: number; championships: number[]; honors: FranchiseHonors }) {
    const awards = [...new Set(honors.awards.map((a) => a.name))].map((name) => ({
        name,
        wins: honors.awards.filter((a) => a.name === name),
    }));
    const total = championships.length + honors.primeMinisters.length + honors.awards.length;
    return (
        <section id="trophy-case" className="mt-9 scroll-mt-6 overflow-hidden rounded-3xl border border-line bg-white shadow-card" aria-labelledby="trophy-case-title">
            <div className="navy-spotlight flex items-center justify-between gap-4 px-5 py-5 text-white md:px-6">
                <h2 id="trophy-case-title" className="font-wide text-xl font-extrabold uppercase">Trophy case</h2>
                <span className="rounded-full border border-gold-light/40 px-3 py-1 text-sm font-bold text-gold-light">{total} honors</span>
            </div>
            <div className="grid gap-4 p-4 md:grid-cols-2 md:p-6">
                <div className="rounded-2xl border border-gold-light/50 bg-gradient-to-br from-gold-tint/70 to-white p-5">
                    <div className="flex items-center gap-5">
                        <JagrCupIcon detailed className="h-20 w-[60px] shrink-0 drop-shadow-[0_5px_8px_rgba(184,134,11,.2)]" />
                        <div><p className="font-narrow tabular text-4xl font-extrabold text-gold-deep">{championships.length}</p><h3 className="font-wide mt-1 text-lg font-extrabold">Jagr Cups</h3></div>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                        {[...championships].sort((a, b) => b - a).map((year) => <Link key={year} href={`/champions/${year}`} className="metal-gold rounded-full px-3 py-2 text-xs font-extrabold text-[#2B1D00] hover:underline">{seasonLabel(year)}</Link>)}
                        {!championships.length && <span className="text-sm text-ink-muted">No championships yet</span>}
                    </div>
                </div>
                <div className="rounded-2xl border border-gold-light/50 bg-gradient-to-br from-gold-tint/70 to-white p-5">
                    <div className="flex items-center gap-5"><PrimeMinisterIcon /><div><p className="font-narrow tabular text-4xl font-extrabold text-gold-deep">{honors.primeMinisters.length}</p><h3 className="font-wide mt-1 text-lg font-extrabold">Prime Minister’s Trophies</h3></div></div>
                    <p className="mt-4 text-xs text-ink-muted">Most regular-season fantasy points in the league.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {honors.primeMinisters.map((win) => <Link key={win.year} href={teamSeasonHref(win.year, franchiseId)} title={`${formatFpts(win.points)} fantasy points`} className="metal-gold rounded-full px-3 py-2 text-xs font-extrabold text-[#2B1D00] hover:underline">{seasonLabel(win.year)}</Link>)}
                        {!honors.primeMinisters.length && <span className="text-sm text-ink-muted">No trophies yet</span>}
                    </div>
                </div>
            </div>
            <div className="border-t border-line-soft p-4 md:p-6">
                <h3 className="mb-4 flex items-baseline gap-3 font-wide text-base font-extrabold uppercase">Individual awards <span className="tabular text-gold-deep">{honors.awards.length}</span></h3>
                {awards.length ? <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {awards.map(({ name, wins }) => <details key={name} className="group rounded-2xl border border-line bg-ice open:bg-white">
                        <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                            <AwardTrophyIcon className="h-12 w-11 shrink-0" />
                            <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold">{wins[0].label}</span><span className="mt-1 block text-xs text-ink-muted">{wins[0].description}</span></span>
                            <span className="font-narrow tabular text-2xl font-extrabold text-gold-deep">{wins.length}</span>
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink-muted transition-colors group-open:border-gold-light group-open:bg-gold-tint group-open:text-gold-deep" aria-hidden="true">
                                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 transition-transform duration-300 ease-out group-open:rotate-180 motion-reduce:transition-none"><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </span>
                        </summary>
                        <ul className="mx-4 border-t border-line-soft py-2">
                            {wins.map((win) => <li key={`${win.year}-${win.playerId}`} className="flex items-baseline justify-between gap-3 py-2 text-sm"><Link className="font-bold hover:text-rink-blue hover:underline" href={`/player/${encodeURIComponent(win.playerId)}`}>{win.player}</Link><span className="shrink-0 text-xs text-ink-muted">{seasonLabel(win.year)}</span></li>)}
                        </ul>
                        <Link href={`/awards/${awardSlug(name)}`} className="mx-4 mb-4 inline-block text-xs font-bold text-rink-blue hover:underline">Award history ↗</Link>
                    </details>)}
                </div> : <p className="text-sm text-ink-muted">No individual awards recorded for this franchise.</p>}
            </div>
        </section>
    );
}
