import Link from 'next/link';
import { TrophyArt, JagrCupIcon } from '@/components/trophy-icons';
import { awardHref, getAwardDefinition } from '@/lib/awards';
import type { FranchiseHonors } from '@/lib/history/model';
import { formatFpts, seasonLabel, teamSeasonHref } from '@/lib/league';


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
                <div className="min-w-0 rounded-2xl border border-gold-light/50 bg-gradient-to-br from-gold-tint/70 to-white p-5">
                    <div className="flex items-center gap-3 max-[400px]:flex-col max-[400px]:text-center">
                        <JagrCupIcon sizes="128px" className="h-32 w-32 shrink-0 drop-shadow-[0_5px_8px_rgba(184,134,11,.2)]" />
                        <div><p className="font-narrow tabular text-4xl font-extrabold text-gold-deep">{championships.length}</p><h3 className="font-wide mt-1 text-lg font-extrabold"><Link href={awardHref("Jagr Cup")} className="hover:underline">Jagr Cups</Link></h3></div>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                        {[...championships].sort((a, b) => b - a).map((year) => <Link key={year} href={`/season/${year}`} className="metal-gold rounded-full px-3 py-2 text-xs font-extrabold text-[#2B1D00] hover:underline">{seasonLabel(year)}</Link>)}
                        {!championships.length && <span className="text-sm text-ink-muted">No championships yet</span>}
                    </div>
                </div>
                <div className="min-w-0 rounded-2xl border border-gold-light/50 bg-gradient-to-br from-gold-tint/70 to-white p-5">
                    <div className="flex items-center gap-3 max-[400px]:flex-col max-[400px]:text-center"><TrophyArt award="prime-minister" className="h-28 w-28" sizes="112px" /><div><p className="font-narrow tabular text-4xl font-extrabold text-gold-deep">{honors.primeMinisters.length}</p><h3 className="font-wide mt-1 text-lg font-extrabold"><Link href={awardHref("prime-minister")} className="hover:underline">Prime Minister’s Trophies</Link></h3></div></div>
                    <p className="mt-4 text-xs text-ink-muted">Most regular-season fantasy points in the league.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {honors.primeMinisters.map((win) => <Link key={win.year} href={teamSeasonHref(win.year, franchiseId)} title={`${formatFpts(win.points)} fantasy points`} className="metal-gold rounded-full px-3 py-2 text-xs font-extrabold text-[#2B1D00] hover:underline">{seasonLabel(win.year)}</Link>)}
                        {!honors.primeMinisters.length && <span className="text-sm text-ink-muted">No trophies yet</span>}
                    </div>
                </div>
            </div>
            <div className="border-t border-line-soft p-4 md:p-6">
                <h3 className="mb-4 flex items-baseline gap-3 font-wide text-base font-extrabold uppercase">Individual awards <span className="tabular text-gold-deep">{honors.awards.length}</span></h3>
                {awards.length ? <div className="grid items-start gap-3 md:grid-cols-2 3xl:grid-cols-3">
                    {awards.map(({ name, wins }) => <details key={name} className="group rounded-2xl border border-line bg-ice open:bg-white">
                        <summary className="flex cursor-pointer list-none items-center gap-2 p-3 sm:gap-3 sm:p-4 [&::-webkit-details-marker]:hidden">
                            <TrophyArt award={name} className="h-14 w-14 sm:h-16 sm:w-16" sizes="64px" />
                            <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold">{getAwardDefinition(name)?.label ?? wins[0].label}</span><span className="mt-1 block text-xs text-ink-muted">{getAwardDefinition(name)?.honor ?? wins[0].description}</span></span>
                            <span className="font-narrow tabular text-2xl font-extrabold text-gold-deep">{wins.length}</span>
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink-muted transition-colors group-open:border-gold-light group-open:bg-gold-tint group-open:text-gold-deep" aria-hidden="true">
                                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 transition-transform duration-300 ease-out group-open:rotate-180 motion-reduce:transition-none"><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </span>
                        </summary>
                        <ul className="mx-4 border-t border-line-soft py-2">
                            {wins.map((win) => <li key={`${win.year}-${win.playerId}`} className="flex items-baseline justify-between gap-3 py-2 text-sm"><Link className="font-bold hover:text-rink-blue hover:underline" href={`/player/${encodeURIComponent(win.playerId)}`}>{win.player}</Link><span className="shrink-0 text-xs text-ink-muted">{seasonLabel(win.year)}</span></li>)}
                        </ul>
                        <Link href={awardHref(name)} className="mx-4 mb-4 inline-block text-xs font-bold text-rink-blue hover:underline">Award history ↗</Link>
                    </details>)}
                </div> : <p className="text-sm text-ink-muted">No individual awards recorded for this franchise.</p>}
            </div>
        </section>
    );
}
