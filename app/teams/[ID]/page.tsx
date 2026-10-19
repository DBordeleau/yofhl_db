import { playerHref } from '@/lib/player-url';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import FranchiseHistory from '@/components/franchise-history';
import FranchiseTrophyCase from '@/components/franchise-trophy-case';
import FranchiseDraft from '@/components/franchise-draft';
import PageContents from '@/components/page-contents';
import TransactionHistory from '@/components/transaction-history';
import FranchiseLeaders from '@/components/franchise-leaders';
import TeamBadge from '@/components/team-badge';
import TeamBranding from '@/components/team-branding/team-branding';
import { JagrCupIcon } from '@/components/trophy-icons';
import { awardHref } from '@/lib/awards';
import { getFranchise, getFranchiseCards } from '@/lib/data/league';
import { getFranchiseDraft, getFranchiseHonors, getHistory, getHistorySeasons } from '@/lib/data/history';
import { formatFpts, seasonLabel, winPercentage } from '@/lib/league';
import Arrow from '@/components/arrow';
import ExploreNext from '@/components/explore-next';
import ShareButton from '@/components/share/share-button';
import { teamShareCard } from '@/lib/share/model';
import { teamComparisonHref } from '@/lib/compare/state';
import franchise from '@/components/franchise.module.css';
import stage from '@/components/franchise-stage.module.css';
import { getBannerSeasons } from '@/lib/data/league';

export async function generateStaticParams() {
    return (await getFranchiseCards()).map((t) => ({ ID: String(t.ID) }));
}

export default async function TeamPage({ params }: { params: Promise<{ ID: string }> }) {
    const id = Number((await params).ID);
    const team = Number.isInteger(id) ? await getFranchise(id) : null;
    if (!team) notFound();
    const scope = { franchiseId: id };
    const [honors, draft, transactions, historySeasons, archive] = await Promise.all([
        getFranchiseHonors(id), getFranchiseDraft(id), getHistory(scope, 'trade'), getHistorySeasons(scope), getBannerSeasons(),
    ]);
    const availableYears = new Set(archive.filter(season => season.team || season.playoffStatus === 'cancelled').map(season => season.year));
    const recentCup = [...team.championships].filter(year => availableYears.has(year)).sort((a, b) => b - a)[0];
    const recentSeason = team.seasons.filter(season => availableYears.has(season.year)).sort((a, b) => b.year - a.year)[0];

    const leadingPlayer = team.leaders[0];
    const cups = team.championships.length;
    const differential = team.fptsFor - team.fptsAgainst;
    const playoffSeasons = team.seasons.filter((s) => s.playoffStatus !== 'cancelled' && s.playoffRound !== null).length;
    const eligibleSeasons = team.seasons.filter((s) => s.playoffStatus !== 'cancelled').length;
    const sections = [
        { id: 'trophy-case', label: 'Trophy case' },
        { id: 'season-history', label: 'Seasons' },
        { id: 'franchise-leaders', label: 'All-time leaders' },
        { id: 'draft-history', label: 'Draft history' },
        { id: 'transactions', label: 'Transactions' },
    ];

    return (
        <main className="pb-16">
            <TeamBranding as="section" teamId={team.id} data-brand-layout="profile" className={stage.stage} aria-label="Franchise overview">
                <div data-brand-part="surface" className={`navy-spotlight ${stage.surface}`}>
                    <div className={`${franchise.wrap} ${stage.inner}`}>
                        <div className={stage.top}>
                            <Link href="/teams/stats" className={stage.back}><Arrow direction="left" /> All teams</Link>
                            <ShareButton card={teamShareCard(team)} />
                        </div>
                        <div className={stage.identity}>
                            <TeamBadge logo={team.logo} abbreviation={team.abbreviation} teamName={team.name} size={140} sizeClass="h-[84px] w-[84px] md:h-[128px] md:w-[128px] 3xl:h-[160px] 3xl:w-[160px]" ring="glow" priority />
                            <div className="min-w-0">
                                <h1 className={stage.name}>{team.name}</h1>
                                <p className={stage.meta}>
                                    {team.foldedAfterSeason && <span className={stage.defunct}>Defunct</span>}
                                    {team.owner && <span>{team.owner}</span>}
                                    <span>{team.firstSeason - 1}–{team.foldedAfterSeason ?? 'Present'}</span>
                                    <span>{team.seasons.length} seasons</span>
                                </p>
                                {team.formerNames.length > 0 && <p className={stage.former}>Formerly {team.formerNames.join(' · ')}</p>}
                                {cups > 0 && <Link href={awardHref('Jagr Cup')} className={stage.champion}>
                                    <JagrCupIcon sizes="28px" className="h-7 w-7 shrink-0" />
                                    {cups === 1 ? 'Jagr Cup champion' : `${cups}-time Jagr Cup champion`}
                                </Link>}
                            </div>
                        </div>
                    </div>
                </div>
                <div className={stage.bar}>
                    <dl className={`${franchise.wrap} ${stage.stats}`}>
                        <div className={stage.stat}><dt>Record · W–L–T</dt><dd><span className={stage.value}>{team.wins}–{team.losses}–{team.ties}</span></dd></div>
                        <div className={stage.stat}><dt>Win percentage</dt><dd><span className={stage.value}>{winPercentage(team).toFixed(1)}%</span></dd></div>
                        <div className={stage.stat}><dt>Point differential</dt><dd>
                            <span className={`${stage.value} ${differential < 0 ? stage.negative : ''}`}>{differential >= 0 ? '+' : ''}{formatFpts(differential)}</span>
                            <span className={stage.sub}>{formatFpts(team.fptsFor)} PF · {formatFpts(team.fptsAgainst)} PA</span>
                        </dd></div>
                        <div className={stage.stat}><dt>Playoff seasons</dt><dd>
                            <span className={stage.value}>{playoffSeasons}<span className="text-[.6em] text-[#9FB0C8]"> / {eligibleSeasons}</span></span>
                        </dd></div>
                    </dl>
                </div>
                <div data-brand-part="stripes" className="banner-stripes h-3.5" />
            </TeamBranding>

            <FranchiseTrophyCase franchiseId={id} championships={team.championships} finals={team.finals} seasons={team.seasons} honors={honors} defunct={team.foldedAfterSeason !== null} />

            <PageContents key={id} variant="bar" title={team.name} contentId="franchise-sections" sections={sections} />

            <div id="franchise-sections" className={`${franchise.wrap} pt-10`}>
                <FranchiseHistory team={team} />

                <section id="franchise-leaders" className={franchise.section} aria-labelledby="leaders-title">
                    <div className={franchise.head}>
                        <h2 id="leaders-title">All-time leaders</h2>
                        <p className={franchise.headNote}>Fantasy points with this franchise</p>
                    </div>
                    <FranchiseLeaders players={team.leaders} />
                </section>
                <FranchiseDraft key={`team-draft-${id}`} picks={draft} franchiseId={id} hindsightEnabled />

                <TransactionHistory key={`team-history-${id}`} scope={scope} initial={transactions} seasons={historySeasons} />
                <ExploreNext currentHref={`/teams/${id}`} links={[
                    { href: teamComparisonHref(id), title: `Compare ${team.name}`, reason: 'Choose an opponent and explore their rivalry' },
                    leadingPlayer ? { href: playerHref(leadingPlayer.ID), title: leadingPlayer.Player, reason: 'The franchise’s all-time scoring leader' } : null,
                    recentCup ? { href: `/season/${recentCup}`, title: seasonLabel(recentCup), reason: 'Their latest Jagr Cup championship' }
                        : recentSeason ? { href: `/season/${recentSeason.year}`, title: seasonLabel(recentSeason.year), reason: 'Their latest available season' } : null,
                    { href: '/teams/stats', title: 'All franchises', reason: 'See how this team ranks across league history' },
                ]} />
            </div>
        </main>
    );
}
