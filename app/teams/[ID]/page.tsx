import Link from 'next/link';
import { notFound } from 'next/navigation';
import FadeIn from '@/components/fade-in';
import FranchisePerformance from '@/components/franchise-performance';
import FranchiseHistory from '@/components/franchise-history';
import FranchiseTrophyCase from '@/components/franchise-trophy-case';
import FranchiseDraft from '@/components/franchise-draft';
import PageContents from '@/components/page-contents';
import contentsStyles from '@/components/page-contents.module.css';
import TransactionHistory from '@/components/transaction-history';
import FranchiseLeaders from '@/components/franchise-leaders';
import TeamBadge from '@/components/team-badge';
import TeamBranding from '@/components/team-branding/team-branding';
import { JagrCupIcon } from '@/components/trophy-icons';
import TrophySparkles from '@/components/trophy-sparkles';
import { getFranchise, getFranchiseCards, type FranchiseSeason } from '@/lib/data/league';
import { getFranchiseDraft, getFranchiseHonors, getHistory, getHistorySeasons } from '@/lib/data/history';
import { formatFpts, seasonLabel, teamSeasonHref, winPercentage } from '@/lib/league';
import Arrow from '@/components/arrow';

export async function generateStaticParams() {
    return (await getFranchiseCards()).map((t) => ({ ID: String(t.ID) }));
}

const record = (team: { wins: number; losses: number; ties: number }) => `${team.wins}–${team.losses}–${team.ties}`;
const labelClass = 'text-[11px] font-bold uppercase tracking-[.12em]';

// Deepest playoff run for a franchise without a title, with every season it happened.
const FINISHES = ['Finalist', 'Semifinalist', 'Quarterfinalist'];
function bestFinish(seasons: FranchiseSeason[]) {
    const runs = seasons.flatMap((s) => s.playoffStatus === 'cancelled' || s.playoffRound === null ? [] : [{ year: s.year, depth: (s.finalRound ?? s.playoffRound) - s.playoffRound, round: s.playoffRound }]);
    if (!runs.length) return null;
    const depth = Math.min(...runs.map((r) => r.depth));
    const best = runs.filter((r) => r.depth === depth).sort((a, b) => a.year - b.year);
    return { label: FINISHES[depth] ?? `Round ${best[0].round}`, runs: best };
}

export default async function TeamPage({ params }: { params: Promise<{ ID: string }> }) {
    const id = Number((await params).ID);
    const team = Number.isInteger(id) ? await getFranchise(id) : null;
    if (!team) notFound();
    const scope = { franchiseId: id };
    const [honors, draft, transactions, historySeasons] = await Promise.all([
        getFranchiseHonors(id), getFranchiseDraft(id), getHistory(scope, 'trade'), getHistorySeasons(scope),
    ]);

    const bestRecord = [...team.seasons].filter((s) => s.wins + s.losses + s.ties > 0)
        .sort((a, b) => winPercentage(b) - winPercentage(a) || b.wins - a.wins)[0];
    const bestScoring = [...team.seasons].sort((a, b) => b.fptsFor - a.fptsFor)[0];
    const leadingPlayer = team.leaders[0];
    const finals = [...team.finals].sort((a, b) => b - a);
    const sections = [
        { id: 'franchise-overview', label: 'Overview' },
        { id: 'trophy-case', label: 'Trophy case' },
        ...(finals.length ? [{ id: 'finals-history', label: 'Finals history' }] : []),
        { id: 'season-history', label: 'Season history' },
        { id: 'franchise-leaders', label: 'All-time leaders' },
        { id: 'transactions', label: 'Transactions' },
        { id: 'draft-history', label: 'Draft history' },
    ];
    const stats = [
        { label: 'Record · W–L–T', value: record(team) },
        { label: 'Win percentage', value: `${winPercentage(team).toFixed(1)}%` },
    ];
    const cups = [...team.championships].sort((a, b) => a - b);
    const finish = bestFinish(team.seasons);

    return (
        <main className="mx-auto max-w-page px-4 pb-16 pt-6 md:px-8 md:pt-10 3xl:max-w-page-3xl 4xl:max-w-page-4xl">
            <Link href="/teams/stats" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-ink-muted hover:text-rink-blue">
                <Arrow direction="left" /> All teams
            </Link>
            <FadeIn>
                <TeamBranding as="section" teamId={team.id} data-brand-layout="profile" className="navy-spotlight relative overflow-hidden rounded-3xl text-white" aria-label="Franchise overview">
                    <div data-brand-part="surface" className="flex flex-col items-center gap-6 px-5 py-8 text-center md:flex-row md:gap-9 md:px-10 md:py-10 md:text-left lg:min-h-[248px] lg:pr-72">
                        <TeamBadge logo={team.logo} abbreviation={team.abbreviation} teamName={team.name} size={140} sizeClass="h-[110px] w-[110px] md:h-[140px] md:w-[140px]" ring="glow" priority />
                        <div className="min-w-0 flex-1">
                            <div className={`${labelClass} text-gold-light`}>{team.foldedAfterSeason ? 'Defunct franchise' : 'Franchise'} · {team.seasons.length} seasons</div>
                            <h1 className="font-wide my-3 text-[28px] font-extrabold uppercase leading-tight md:text-[38px] lg:text-[44px]">{team.name}</h1>
                            <p className="text-sm font-semibold text-[#B9C6DA]">
                                {team.owner && <>{team.owner}<span className="mx-2">·</span></>}{team.firstSeason - 1}–{team.foldedAfterSeason ?? 'Present'}
                            </p>
                            {team.formerNames.length > 0 && <p className="mt-2 text-xs leading-relaxed text-[#B9C6DA]">Formerly {team.formerNames.join(' · ')}</p>}
                        </div>
                    </div>
                    <dl className="grid grid-cols-2 gap-px border-t border-white/10 bg-white/10 md:grid-cols-4">
                        {stats.map((stat) => (
                            <div key={stat.label} className="bg-ink/90 px-4 py-5 md:px-6">
                                <dt className={`${labelClass} min-h-8 text-[#B9C6DA]`}>{stat.label}</dt>
                                <dd className="font-narrow tabular mt-2 flex min-h-12 items-center whitespace-nowrap text-[clamp(1.375rem,6.5vw,1.875rem)] font-extrabold leading-none md:text-[36px]">{stat.value}</dd>
                            </div>
                        ))}
                        {cups.length > 0 ? (
                            <div className="champion-cell col-span-2 px-4 py-5 md:px-6">
                                <dt className={`${labelClass} text-gold-light`}>{cups.length === 1 ? 'Jagr Cup champion' : `${cups.length}-time Jagr Cup champions`}</dt>
                                <dd className="mt-3 flex items-center gap-5 md:gap-6">
                                    {cups.length === 1 ? (
                                        <Link href={`/season/${cups[0]}#championship-roster`} className="champion-cup group flex items-center gap-4 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-light">
                                            <span className="relative">
                                                <TrophySparkles seed={`${id}-${cups[0]}`} />
                                                <JagrCupIcon sizes="80px" className="relative h-[68px] w-[68px] md:h-20 md:w-20" />
                                            </span>
                                            <span>
                                                <span className="champion-count font-narrow tabular block text-[44px] font-black leading-none md:text-[52px]">{seasonLabel(cups[0])}</span>
                                                <span className="mt-1.5 block text-xs font-bold text-gold-light/80 group-hover:text-white">View the championship season <Arrow /></span>
                                            </span>
                                        </Link>
                                    ) : <>
                                        <span className="champion-count font-narrow tabular shrink-0 text-[64px] font-black leading-[.85] md:text-[76px]" aria-hidden="true">{cups.length}<span className="text-[.6em]">×</span></span>
                                        <ul className="flex min-w-0 flex-wrap gap-x-4 gap-y-3 border-l border-gold-light/25 pl-5 md:gap-x-5 md:pl-6">
                                            {cups.map((year) => (
                                                <li key={year}>
                                                    <Link href={`/season/${year}#championship-roster`} className="champion-cup group flex flex-col items-center gap-1.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-light" aria-label={`${seasonLabel(year)} Jagr Cup championship`}>
                                                        <span className="relative">
                                                            <TrophySparkles seed={`${id}-${year}`} />
                                                            <JagrCupIcon sizes="64px" className="relative h-14 w-14 md:h-16 md:w-16" />
                                                        </span>
                                                        <span className="tabular text-xs font-bold text-gold-light/80 group-hover:text-white">{seasonLabel(year)}</span>
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    </>}
                                </dd>
                            </div>
                        ) : (
                            <div className="col-span-2 bg-ink/90 px-4 py-5 md:px-6">
                                <dt className={`${labelClass} min-h-8 text-[#B9C6DA]`}>Jagr Cups</dt>
                                <dd className="mt-2 flex min-h-12 flex-wrap items-baseline gap-x-4 gap-y-1">
                                    <span className="font-narrow text-[clamp(1.375rem,6.5vw,1.875rem)] font-extrabold leading-none text-[#8D9AB0] md:text-[36px]">{team.foldedAfterSeason ? 'None' : 'None yet'}</span>
                                    {finish && <span className="text-sm font-semibold text-[#B9C6DA]">Best finish: {finish.label},{' '}
                                        {finish.runs.map((run, index) => <span key={run.year}>{index > 0 && ', '}<Link href={teamSeasonHref(run.year, id, run.round)} className="tabular text-white underline decoration-white/30 underline-offset-4 hover:text-gold-light hover:decoration-gold-light">{seasonLabel(run.year)}</Link></span>)}
                                    </span>}
                                </dd>
                            </div>
                        )}
                    </dl>
                    <div data-brand-part="stripes" className="banner-stripes h-3.5" />
                </TeamBranding>
            </FadeIn>

            <div className={contentsStyles.layout}>
                <PageContents key={id} title={team.name} contentId="franchise-sections" sections={sections} />
                <div id="franchise-sections" className={contentsStyles.sections}>
                    <div id="franchise-overview" className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]" role="region" aria-label="Franchise performance and records">
                        <FranchisePerformance seasons={team.seasons} championships={team.championships} />
                        <section className="rounded-3xl border border-line bg-white p-5 shadow-card md:p-6" aria-labelledby="records-title">
                            <h2 id="records-title" className="font-wide text-lg font-extrabold uppercase">Franchise records</h2>
                            <dl className="mt-4 divide-y divide-line-soft">
                                {bestRecord && (
                                    <div className="pb-4">
                                        <dt className={`${labelClass} text-ink-muted`}>Best win percentage</dt>
                                        <dd className="mt-1">
                                            <Link href={teamSeasonHref(bestRecord.year, id)} className="group block hover:text-rink-blue">
                                                <span className="tabular text-2xl font-extrabold">{winPercentage(bestRecord).toFixed(1)}%</span>
                                                <span className="mt-1 block text-sm text-ink-muted group-hover:underline">{seasonLabel(bestRecord.year)} · {record(bestRecord)}</span>
                                            </Link>
                                        </dd>
                                    </div>
                                )}
                                {bestScoring && (
                                    <div className="py-4">
                                        <dt className={`${labelClass} text-ink-muted`}>Highest-scoring season</dt>
                                        <dd className="mt-1">
                                            <Link href={teamSeasonHref(bestScoring.year, id)} className="group block hover:text-rink-blue">
                                                <span className="tabular text-2xl font-extrabold">{formatFpts(bestScoring.fptsFor)}</span>
                                                <span className="mt-1 block text-sm text-ink-muted group-hover:underline">{seasonLabel(bestScoring.year)} · fantasy points</span>
                                            </Link>
                                        </dd>
                                    </div>
                                )}
                                {leadingPlayer && (
                                    <div className="pt-4">
                                        <dt className={`${labelClass} text-ink-muted`}>All-time points leader</dt>
                                        <dd className="mt-1">
                                            <Link href={`/player/${encodeURIComponent(leadingPlayer.ID)}`} className="font-wide text-lg font-extrabold hover:text-rink-blue hover:underline">{leadingPlayer.Player}</Link>
                                            <span className="tabular mt-1 block text-sm text-ink-muted">{formatFpts(leadingPlayer.FPts)} FPts with this franchise</span>
                                        </dd>
                                    </div>
                                )}
                            </dl>
                        </section>
                    </div>

                    <FranchiseTrophyCase franchiseId={id} championships={team.championships} honors={honors} />

                    {finals.length > 0 && (
                        <section id="finals-history" className="mt-9 scroll-mt-6" aria-labelledby="finals-title">
                            <h2 id="finals-title" className="font-wide mb-4 text-xl font-extrabold uppercase">Finals history</h2>
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {finals.map((year) => {
                                    const won = team.championships.includes(year);
                                    const season = team.seasons.find((s) => s.year === year);
                                    return (
                                        <Link key={year} href={won ? `/season/${year}#championship-roster` : teamSeasonHref(year, id, season?.finalRound ?? null)} className={`group flex items-center gap-4 rounded-2xl border p-5 transition-transform hover:-translate-y-0.5 ${won ? 'border-gold-light bg-gradient-to-br from-gold-tint to-white shadow-card' : 'border-line bg-white'}`}>
                                            {won ? <JagrCupIcon sizes="64px" className="h-16 w-16 shrink-0" /> : <span className="font-narrow flex h-14 w-[42px] shrink-0 items-center justify-center text-3xl font-extrabold text-ink-faint" aria-hidden="true">2</span>}
                                            <div className="min-w-0 flex-1">
                                                <div className={`${labelClass} ${won ? 'text-gold-deep' : 'text-ink-muted'}`}>{won ? 'Jagr Cup champion' : 'Runner-up'}</div>
                                                <div className="font-wide mt-1 text-xl font-extrabold group-hover:underline">{seasonLabel(year)}</div>
                                                {season?.owner && <p className="mt-1 text-sm text-ink-muted">{season.owner}</p>}
                                            </div>
                                            <Arrow className="text-ink-muted" />
                                        </Link>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    <FranchiseHistory team={team} />

                    <section id="franchise-leaders" className="mt-9 scroll-mt-6" aria-labelledby="leaders-title">
                        <h2 id="leaders-title" className="font-wide text-xl font-extrabold uppercase">All-time leaders</h2>
                        <p className="mb-5 mt-2 text-sm text-ink-muted">Fantasy points recorded with this franchise.</p>
                        <FranchiseLeaders players={team.leaders} />
                    </section>

                    <TransactionHistory key={`team-history-${id}`} scope={scope} initial={transactions} seasons={historySeasons} />
                    <FranchiseDraft key={`team-draft-${id}`} picks={draft} />
                </div>
            </div>
        </main>
    );
}
