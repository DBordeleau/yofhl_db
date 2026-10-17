import Link from 'next/link';
import { notFound } from 'next/navigation';
import CareerTable from '@/components/career-table';
import CompareButton from '@/components/compare-button';
import ExploreNext from '@/components/explore-next';
import ShareButton from '@/components/share/share-button';
import { playerShareCard } from '@/lib/share/model';
import { comparisonHref } from '@/lib/compare/state';
import FadeIn from '@/components/fade-in';
import JohnnyGaudreauMemorial from '@/components/johnny-gaudreau-memorial';
import PlayerExtras from '@/components/player-extras';
import PlayerHero from '@/components/player-hero';
import TransactionHistory from '@/components/transaction-history';
import type { TrophyItem } from '@/components/trophy-case';
import { getBannerSeasons, getPlayer, getTopPlayerIds } from '@/lib/data/league';
import { playerHref, playerSlug } from '@/lib/player-url';
import { getHistory, getHistorySeasons } from '@/lib/data/history';
import { awardSlug, seasonLabel } from '@/lib/league';
import Arrow from '@/components/arrow';

// Popular profiles build ahead of time; other profiles cache on their first visit.
export async function generateStaticParams() {
    return (await getTopPlayerIds(50)).map(({ id }) => ({ ID: playerSlug(id) }));
}

const JOHNNY_GAUDREAU_ID = '*02b81*';
// 2018–19 through 2023–24 Player Stats CSVs: 2,177.50 FPts, with 36 players ahead.
const JOHNNY_GAUDREAU_HISTORICAL_RANK_NOTE = '#37 on August 29, 2024';

export async function generateMetadata({ params }: { params: Promise<{ ID: string }> }) {
    const player = await getPlayer(decodeURIComponent((await params).ID));
    if (player?.id === JOHNNY_GAUDREAU_ID) {
        return {
            title: 'Remembering Johnny Gaudreau · YOFHL DB',
            description: 'In loving memory of Johnny Gaudreau, 1993–2024. Johnny Hockey, forever part of our game.',
        };
    }
    return { title: player ? `${player.name} · YOFHL DB` : 'YOFHL DB' };
}

// player header, season-by-season stats, trophy case and points chart at /player/[ID]
export default async function PlayerPage({ params }: { params: Promise<{ ID: string }> }) {
    const player = await getPlayer(decodeURIComponent((await params).ID));
    if (!player) notFound();
    const isMemorial = player.id === JOHNNY_GAUDREAU_ID;
    const ProfileContent = isMemorial ? 'div' : FadeIn;
    const compareAction = <div className="flex flex-wrap items-center gap-3"><CompareButton id={player.id} name={player.name} /><ShareButton card={playerShareCard(player)} dark /></div>;
    const scope = { playerId: player.id };
    const [transactions, historySeasons, archive] = await Promise.all([getHistory(scope), getHistorySeasons(scope), getBannerSeasons()]);
    const availableYears = new Set(archive.filter(season => season.team || season.playoffStatus === 'cancelled').map(season => season.year));
    const bestSeason = [...player.playerStats].filter(row => availableYears.has(row.Year)).sort((a, b) => b.FPts - a.FPts)[0];
    const latestAward = [...player.awards].sort((a, b) => b.Year - a.Year)[0];

    const awardsByYear = player.awards.reduce((acc, a) => {
        (acc[a.Year] ??= []).push(a.Award);
        return acc;
    }, {} as Record<number, string[]>);

    // Jagr Cups first, then individual awards, newest first within each
    const trophies: TrophyItem[] = [
        ...[...player.championships].reverse().map((c) => ({
            kind: 'cup' as const,
            name: 'Jagr Cup',
            detail: c.team,
            season: seasonLabel(c.season),
        })),
        ...[...player.awards].reverse().map((a) => ({
            kind: 'award' as const,
            name: a.Award,
            detail: a.description,
            season: seasonLabel(a.Year),
        })),
    ];

    return (
        <main className="mx-auto max-w-page px-4 pb-16 md:px-8 3xl:max-w-page-3xl 4xl:max-w-page-4xl">
            <Link href="/stats/all-time/all" className="mb-3 mt-5 inline-flex min-h-11 items-center gap-2 px-1 text-[15px] font-bold text-rink-blue hover:text-ink">
                <Arrow direction="left" />
                Leaderboards
            </Link>
            <ProfileContent>
                <PlayerHero
                    name={player.name}
                    positions={player.positions}
                    team={player.team}
                    championships={player.championships.length}
                    totalFPts={player.totalFPts}
                    fpg={player.fpg}
                    rank={player.rank}
                    rankNote={isMemorial ? JOHNNY_GAUDREAU_HISTORICAL_RANK_NOTE : undefined}
                    seasons={player.seasons}
                    actions={compareAction}
                    header={isMemorial ? <JohnnyGaudreauMemorial actions={compareAction} /> : undefined}
                />

                <nav className="mt-4 flex flex-wrap gap-x-6 text-sm font-bold text-ink-muted" aria-label="Player sections">
                    <a href="#career-stats" className="inline-flex min-h-11 items-center gap-1.5 hover:text-rink-blue">Season stats <Arrow direction="down" /></a>
                    <a href="#transactions" className="inline-flex min-h-11 items-center gap-1.5 hover:text-rink-blue">Transaction history <Arrow direction="down" /></a>
                </nav>
                {/* season-by-season stats lead; the trophy case and chart follow */}
                <div id="career-stats" className="mt-5 scroll-mt-6">
                    <CareerTable careerStats={player.playerStats} awardsByYear={awardsByYear} />
                </div>

                <PlayerExtras trophies={trophies} seasons={player.playerStats} />
                <TransactionHistory key={`player-history-${player.id}`} scope={scope} initial={transactions} seasons={historySeasons} />
                <ExploreNext currentHref={playerHref(player.id)} links={[
                    { href: comparisonHref({ ids: [player.id], metric: 'fpts' }), title: `Compare ${player.name}`, reason: 'Add another player and compare their seasons' },
                    player.team ? { href: `/teams/${player.team.id}`, title: player.team.name, reason: 'Last recorded team in the archive' } : null,
                    bestSeason ? { href: `/season/${bestSeason.Year}`, title: seasonLabel(bestSeason.Year), reason: 'Their highest-scoring available season' } : null,
                    latestAward ? { href: `/awards/${awardSlug(latestAward.Award)}`, title: latestAward.Award, reason: `Their latest award · ${seasonLabel(latestAward.Year)}` } : null,
                ]} />
            </ProfileContent>
        </main>
    );
}
