import { notFound } from 'next/navigation';
import CareerTable from '@/components/career-table';
import CompareButton from '@/components/compare-button';
import ExploreNext from '@/components/explore-next';
import FPtsGraph from '@/components/fpts-graph';
import ShareButton from '@/components/share/share-button';
import { playerShareCard } from '@/lib/share/model';
import { comparisonHref } from '@/lib/compare/state';
import JohnnyGaudreauMemorial from '@/components/johnny-gaudreau-memorial';
import PageContents from '@/components/page-contents';
import PlayerHero from '@/components/player-hero';
import PlayerTrophyShelf, { shelfTrophies } from '@/components/player-trophy-shelf';
import styles from '@/components/player-page.module.css';
import TransactionHistory from '@/components/transaction-history';
import { isPublished } from '@/lib/seasons';
import { safeDecodeParam } from '@/lib/data/bounds';
import { getSeasonArchive, getPlayer, getTopPlayerIds } from '@/lib/data/league';
import { playerHref } from '@/lib/player-url';
import { pageMetadata } from '@/lib/site-metadata';
import { getHistory, getHistorySeasons } from '@/lib/data/history';
import { playerHonors } from '@/lib/data/award-archive';
import { seasonLabel } from '@/lib/league';
import { awardHref, type AwardSummary } from '@/lib/awards';

// Popular profiles build ahead of time; other profiles cache on their first visit.
export async function generateStaticParams() {
    return (await getTopPlayerIds(50)).map(({ id }) => ({ ID: id }));
}

const JOHNNY_GAUDREAU_ID = '02b81';
// 2018–19 through 2023–24 Player Stats CSVs: 2,177.50 FPts, with 36 players ahead.
const JOHNNY_GAUDREAU_HISTORICAL_RANK_NOTE = '#37 on August 29, 2024';

// A player the archive doesn't hold is a 404: their link falls back to what the site is (app/layout.tsx).
export async function generateMetadata({ params }: { params: Promise<{ ID: string }> }) {
    const playerId = safeDecodeParam((await params).ID);
    const player = playerId ? await getPlayer(playerId) : null;
    if (!player) return {};
    const memorial = player.id === JOHNNY_GAUDREAU_ID;
    return pageMetadata({
        path: playerHref(player.id),
        name: memorial ? 'Remembering Johnny Gaudreau' : player.name,
        description: memorial ? 'In loving memory of Johnny Gaudreau, 1993–2024. Johnny Hockey, forever part of our game.' : undefined,
    });
}

// player stage and trophy shelf, then season-by-season stats, the points chart and transactions at /player/[ID]
export default async function PlayerPage({ params }: { params: Promise<{ ID: string }> }) {
    const playerId = safeDecodeParam((await params).ID);
    const player = playerId ? await getPlayer(playerId) : null;
    if (!player) notFound();
    const honors = await playerHonors(player.id);
    const isMemorial = player.id === JOHNNY_GAUDREAU_ID;
    const compareAction = <><CompareButton href={comparisonHref({ ids: [player.id], metric: 'fpts' })} title="Compare this player with others" dark /><ShareButton card={playerShareCard(player, honors)} dark /></>;
    const scope = { playerId: player.id };
    const [transactions, historySeasons, archive] = await Promise.all([getHistory(scope), getHistorySeasons(scope), getSeasonArchive()]);
    const bestSeason = [...player.playerStats].filter(row => isPublished(archive, row.Year)).sort((a, b) => b.FPts - a.FPts)[0];
    const latestAward = [...honors.awards].sort((a, b) => b.year - a.year)[0];
    const played = player.playerStats.filter(row => row.FPts > 0).map(row => row.Year).sort((a, b) => a - b);
    const span = played.length > 1 ? `${seasonLabel(played[0])} to ${seasonLabel(played.at(-1)!)}` : played.length ? seasonLabel(played[0]) : null;

    const awardsByYear = honors.awards.reduce((acc, { year, ...award }) => {
        (acc[year] ??= []).push(award);
        return acc;
    }, {} as Record<number, AwardSummary[]>);

    const sections = [
        { id: 'career-stats', label: 'Seasons' },
        { id: 'fantasy-points', label: 'Fantasy points' },
        ...(transactions.total > 0 ? [{ id: 'transactions', label: 'Transactions' }] : []),
    ];

    return (
        <main className={styles.page}>
            <PlayerHero
                name={player.name}
                positions={player.positions}
                team={player.team}
                span={span}
                totalFPts={player.totalFPts}
                fpg={player.fpg}
                rank={player.rank}
                rankNote={isMemorial ? JOHNNY_GAUDREAU_HISTORICAL_RANK_NOTE : undefined}
                seasons={player.seasons}
                actions={compareAction}
                header={isMemorial ? <JohnnyGaudreauMemorial actions={<div className="flex flex-wrap items-center gap-3">{compareAction}</div>} /> : undefined}
            />
            <PlayerTrophyShelf trophies={shelfTrophies(honors)} seed={player.id} />

            <PageContents variant="bar" title={player.name} contentId="player-sections" sections={sections} />

            <div id="player-sections" className={`${styles.wrap} ${styles.sections}`}>
                <section id="career-stats" className={styles.block}>
                    <CareerTable careerStats={player.playerStats} awardsByYear={awardsByYear} careerFpg={player.fpg} />
                </section>
                <section id="fantasy-points" className={styles.block}>
                    <FPtsGraph playerStats={player.playerStats} />
                </section>
                {transactions.total > 0 && <TransactionHistory key={`player-history-${player.id}`} scope={scope} initial={transactions} seasons={historySeasons} />}
                <ExploreNext currentHref={playerHref(player.id)} links={[
                    { href: comparisonHref({ ids: [player.id], metric: 'fpts' }), title: `Compare ${player.name}`, reason: 'Add another player and compare their seasons' },
                    player.team ? { href: `/teams/${player.team.id}`, title: player.team.name, reason: 'Last recorded team in the archive' } : null,
                    bestSeason ? { href: `/season/${bestSeason.Year}`, title: seasonLabel(bestSeason.Year), reason: 'Their highest-scoring available season' } : null,
                    latestAward ? { href: awardHref(latestAward.name), title: latestAward.label, reason: `Their latest award · ${seasonLabel(latestAward.year)}` } : null,
                ]} />
            </div>
        </main>
    );
}
