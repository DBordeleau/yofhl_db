import { playerHref } from '@/lib/player-url';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AwardTable from '@/components/award-table';
import RinkDivider from '@/components/rink-divider';
import { TrophyArt } from '@/components/trophy-icons';
import { AWARD_CATALOGUE, awardFromSlug, awardHref, awardSlug, awardSummary, findAward } from '@/lib/awards';
import type { AwardWinner } from '@/lib/data/league';
import { listed as listedAwards, winners as awardWinners } from '@/lib/data/award-archive';
import { seasonLabel } from '@/lib/league';
import Arrow from '@/components/arrow';
import ExploreNext from '@/components/explore-next';
import { getSeasonArchive } from '@/lib/data/league';
import PublishedTallyTable from '@/components/award-vote/published-tally';
import { awardVote } from '@/lib/award-vote/award-vote';
import { VOTED_AWARD_IDS, type VotedAwardId } from '@/lib/award-vote/model';
import { awardMetadata } from '@/lib/page-metadata';

export async function generateStaticParams() {
    // raw slugs, not awardHref: Next.js encodes route params itself, so encoded ones would double-encode
    return AWARD_CATALOGUE.map((award) => ({ award: awardSlug(award.name) }));
}

// An award the catalogue doesn't hold is a 404: its link falls back to what the site is (app/layout.tsx).
export async function generateMetadata({ params }: { params: Promise<{ award: string }> }) {
    const definition = findAward(awardFromSlug((await params).award));
    return definition ? awardMetadata(definition) : {};
}

export default async function AwardPage({ params }: { params: Promise<{ award: string }> }) {
    const name = awardFromSlug((await params).award);
    const definition = findAward(name);
    // an award the catalogue doesn't know has no page
    if (!definition) notFound();
    const teamAward = definition.scope === 'team';
    const award = awardSummary(definition);
    const [winners, listedAll] = await Promise.all([awardWinners(definition), listedAwards()]);
    // share cards only for a listed award
    const listed = listedAll.some(listedAward => listedAward.id === definition.id);
    // an award that isn't listed, reachable by its URL, has a page once a winner is published, released or not
    if (!listed && !winners.length) notFound();
    const latest = winners[0];
    const winnerHref = (winner: AwardWinner) => winner.PlayerID ? playerHref(winner.PlayerID) : winner.TeamID ? `/teams/${winner.TeamID}` : null;
    const latestHref = latest ? winnerHref(latest) : null;
    // a shared award: every winner of the latest season
    const latestWinners = latest ? winners.filter(winner => winner.Year === latest.Year) : [];
    const label = definition.label;
    const latestSeason = latest && (await getSeasonArchive()).published.find(season => season.year === latest.Year);
    const href = awardHref(award.name);
    // a voted award's published tallies, newest first; none for every other award and every season without a published award vote
    const votedAward = VOTED_AWARD_IDS.find((id): id is VotedAwardId => id === definition.id);
    const tallies = votedAward ? await awardVote.readPublishedTallies({ award: votedAward }) : [];

    return (
        <main className="mx-auto max-w-page px-4 pb-16 pt-5 md:px-8 md:pt-8 3xl:max-w-page-3xl 4xl:max-w-page-4xl">
            <Link href="/awards" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-ink-muted hover:text-rink-blue"><Arrow direction="left" /> All awards</Link>
            <section className="navy-spotlight relative overflow-hidden rounded-3xl border border-gold-light/20 text-white">
                <div className="grid items-center gap-3 px-5 pb-10 pt-5 md:grid-cols-[minmax(240px,.8fr)_minmax(0,1.2fr)] md:gap-8 md:px-10 md:py-12 lg:gap-14 lg:px-14">
                    <div className="relative flex justify-center">
                        <span className="trophy-pool absolute bottom-6 left-1/2 h-10 w-48 -translate-x-1/2 rounded-full md:bottom-8 md:w-64" />
                        <TrophyArt award={award.name} title={label} priority sizes="(min-width: 768px) 384px, 256px" className="relative h-64 w-64 max-w-full drop-shadow-[0_12px_28px_rgba(240,199,94,.18)] md:h-96 md:w-96" />
                    </div>
                    <div className="min-w-0 pb-4 text-center md:py-3 md:text-left">
                        <p className="text-xs font-extrabold uppercase tracking-[.2em] text-gold-light">{award.honor}</p>
                        <h1 className="font-wide mt-3 text-3xl font-extrabold uppercase leading-tight md:text-[40px] lg:text-[48px]">{label}</h1>
                        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-[#D8E2EF] md:mx-0 md:text-base">{definition.description}</p>
                        {latest && <div className="mt-6 border-t border-white/15 pt-5">
                            <p className="text-[11px] font-bold uppercase tracking-[.15em] text-gold-light">{latestWinners.length > 1 ? 'Latest winners' : 'Latest winner'} · {seasonLabel(latest.Year)}</p>
                            {latestWinners.map(winner => {
                                const href = winnerHref(winner);
                                return <div key={`${winner.PlayerID}-${winner.TeamID}`}>
                                    <p className="mt-2 text-xl font-extrabold">{href ? <Link href={href} className="underline-offset-4 hover:text-gold-light hover:underline">{winner.Winner} <Arrow /></Link> : winner.Winner}</p>
                                    {!teamAward && winner.Team && <p className="mt-1 text-sm text-[#AFC0D8]">{winner.Team}</p>}
                                    {definition.decidedBy === 'teamVote' && winner.Owner && <p className="mt-1 text-sm text-[#AFC0D8]">{winner.Owner}</p>}
                                </div>;
                            })}
                        </div>}
                    </div>
                </div>
                <div className="banner-stripes absolute inset-x-0 bottom-0 h-3.5" />
            </section>
            <RinkDivider />
            <section className="mx-auto max-w-board" aria-labelledby="winners-title">
                <div className="mb-4 flex items-baseline justify-between gap-4 px-1">
                    <h2 id="winners-title" className="font-wide text-xl font-extrabold uppercase md:text-2xl">Past winners</h2>
                    <span className="text-xs font-semibold text-ink-muted">{winners.length} awarded</span>
                </div>
                <AwardTable awardsData={winners} recipient={teamAward ? 'team' : 'player'}
                    award={listed ? { ...award, image: definition.image } : undefined} />
            </section>
            {tallies.length > 0 && <section className="mx-auto mt-10 max-w-board" aria-labelledby="tallies-title">
                <h2 id="tallies-title" className="font-wide mb-4 px-1 text-xl font-extrabold uppercase md:text-2xl">Tallies</h2>
                <div className="grid gap-6">
                    {tallies.map(tally => <PublishedTallyTable key={tally.seasonYear} tally={tally} />)}
                </div>
            </section>}
            <ExploreNext currentHref={href} links={[
                latestHref ? { href: latestHref, title: latest.Winner, reason: `Latest winner · ${seasonLabel(latest.Year)}` } : null,
                latestSeason ? { href: `/season/${latestSeason.year}`, title: seasonLabel(latestSeason.year), reason: 'Explore the latest award-winning season' } : null,
                { href: '/awards', title: 'All league awards', reason: 'Discover the league’s other honors' },
            ]} />
        </main>
    );
}
