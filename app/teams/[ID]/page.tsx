import Link from 'next/link';
import { notFound } from 'next/navigation';
import FadeIn from '@/components/fade-in';
import FranchisePerformance from '@/components/franchise-performance';
import FranchiseHistory from '@/components/franchise-history';
import FranchiseTrophyCase from '@/components/franchise-trophy-case';
import FranchiseDraft from '@/components/franchise-draft';
import FranchiseContents from '@/components/franchise-contents';
import contentsStyles from '@/components/franchise-contents.module.css';
import TransactionHistory from '@/components/transaction-history';
import StatTable from '@/components/stat-table';
import TeamBadge from '@/components/team-badge';
import { JagrCupIcon } from '@/components/trophy-icons';
import { getFranchise, getFranchiseCards } from '@/lib/data/league';
import { getFranchiseDraft, getFranchiseHonors, getHistory, getHistorySeasons } from '@/lib/data/history';
import { formatFpts, seasonLabel, teamSeasonHref, winPercentage } from '@/lib/league';

export async function generateStaticParams() {
    return (await getFranchiseCards()).map((t) => ({ ID: String(t.ID) }));
}

const record = (team: { wins: number; losses: number; ties: number }) => `${team.wins}–${team.losses}–${team.ties}`;
const labelClass = 'text-[11px] font-bold uppercase tracking-[.12em]';

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
        { label: 'Jagr Cups', value: team.championships.length, gold: true },
        { label: 'Finals appearances', value: team.finals.length },
    ];

    return (
        <main className="mx-auto max-w-page px-4 pb-16 pt-6 md:px-8 md:pt-10 3xl:max-w-page-3xl 4xl:max-w-page-4xl">
            <Link href="/teams/stats" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-ink-muted hover:text-rink-blue">
                <span aria-hidden="true">←</span> All teams
            </Link>
            <FadeIn>
                <section className="navy-spotlight relative overflow-hidden rounded-3xl text-white" aria-label="Franchise overview">
                    <div className="flex flex-col items-center gap-6 px-5 py-8 text-center md:flex-row md:gap-9 md:px-10 md:py-10 md:text-left">
                        <TeamBadge logo={team.logo} abbreviation={team.abbreviation} teamName={team.name} size={140} sizeClass="h-[110px] w-[110px] md:h-[140px] md:w-[140px]" ring="glow" priority />
                        <div className="min-w-0 flex-1">
                            <div className={`${labelClass} text-gold-light`}>{team.foldedAfterSeason ? 'Defunct franchise' : 'Franchise'} · {team.seasons.length} seasons</div>
                            <h1 className="font-wide my-3 text-[28px] font-extrabold uppercase leading-tight md:text-[38px] lg:text-[44px]">{team.name}</h1>
                            <p className="text-sm font-semibold text-[#B9C6DA]">
                                {team.owner && <>{team.owner}<span className="mx-2">·</span></>}{team.firstSeason - 1}–{team.foldedAfterSeason ?? 'Present'}
                            </p>
                            {team.formerNames.length > 0 && <p className="mt-2 text-xs leading-relaxed text-[#B9C6DA]">Formerly {team.formerNames.join(' · ')}</p>}
                        </div>
                        {team.championships.length > 0 && (
                            <div className="hidden shrink-0 flex-col items-center gap-2 lg:flex">
                                <JagrCupIcon detailed className="h-24 w-[72px] drop-shadow-[0_8px_20px_rgba(240,199,94,.4)]" />
                                <span className="text-xs font-extrabold uppercase tracking-widest text-gold-light">{team.championships.length}× champion</span>
                            </div>
                        )}
                    </div>
                    <dl className="grid grid-cols-2 gap-px border-t border-white/10 bg-white/10 md:grid-cols-4">
                        {stats.map((stat) => (
                            <div key={stat.label} className="bg-ink/90 px-4 py-5 md:px-6">
                                <dt className={`${labelClass} min-h-8 text-[#B9C6DA]`}>{stat.label}</dt>
                                <dd className={`font-narrow tabular mt-2 whitespace-nowrap text-[clamp(1.375rem,6.5vw,1.875rem)] font-extrabold leading-none md:text-[36px] ${stat.gold ? 'text-gold-light' : ''}`}>{stat.value}</dd>
                            </div>
                        ))}
                    </dl>
                    <div className="banner-stripes h-3.5" />
                </section>
            </FadeIn>

            <div className={contentsStyles.layout}>
                <FranchiseContents key={id} teamName={team.name} sections={sections} />
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
                                        <Link key={year} href={won ? `/champions/${year}#championship-roster` : teamSeasonHref(year, id, season?.finalRound ?? null)} className={`group flex items-center gap-4 rounded-2xl border p-5 transition-transform hover:-translate-y-0.5 ${won ? 'border-gold-light bg-gradient-to-br from-gold-tint to-white shadow-card' : 'border-line bg-white'}`}>
                                            {won ? <JagrCupIcon detailed className="h-14 w-[42px] shrink-0" /> : <span className="font-narrow flex h-14 w-[42px] shrink-0 items-center justify-center text-3xl font-extrabold text-ink-faint" aria-hidden="true">2</span>}
                                            <div className="min-w-0 flex-1">
                                                <div className={`${labelClass} ${won ? 'text-gold-deep' : 'text-ink-muted'}`}>{won ? 'Jagr Cup champion' : 'Runner-up'}</div>
                                                <div className="font-wide mt-1 text-xl font-extrabold group-hover:underline">{seasonLabel(year)}</div>
                                                {season?.owner && <p className="mt-1 text-sm text-ink-muted">{season.owner}</p>}
                                            </div>
                                            <span className="text-ink-muted" aria-hidden="true">↗</span>
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
                        <StatTable mode="all-time" topPlayers={team.leaders} currentPage={1} />
                    </section>

                    <TransactionHistory key={`team-history-${id}`} scope={scope} initial={transactions} seasons={historySeasons} />
                    <FranchiseDraft key={`team-draft-${id}`} picks={draft} />
                </div>
            </div>
        </main>
    );
}
