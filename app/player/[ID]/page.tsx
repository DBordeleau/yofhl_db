import Link from 'next/link';
import { notFound } from 'next/navigation';
import CareerTable from '@/components/career-table';
import CompareButton from '@/components/compare-button';
import FadeIn from '@/components/fade-in';
import JohnnyGaudreauMemorial from '@/components/johnny-gaudreau-memorial';
import PlayerExtras from '@/components/player-extras';
import PlayerHero from '@/components/player-hero';
import TransactionHistory from '@/components/transaction-history';
import type { TrophyItem } from '@/components/trophy-case';
import { getPlayer } from '@/lib/data/league';
import { getHistory, getHistorySeasons } from '@/lib/data/history';
import { seasonLabel } from '@/lib/league';

// Rendered per request from cached data rather than pre-built: Fantrax ids contain "*", which
// can't appear in file names on Windows, so static player pages would break local builds.
export const dynamic = 'force-dynamic';

const JOHNNY_GAUDREAU_ID = '*02b81*';

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
    const compareAction = <CompareButton id={player.id} name={player.name} />;
    const scope = { playerId: player.id };
    const [transactions, historySeasons] = await Promise.all([getHistory(scope), getHistorySeasons(scope)]);

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
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
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
                    seasons={player.seasons}
                    actions={compareAction}
                    header={isMemorial ? <JohnnyGaudreauMemorial actions={compareAction} /> : undefined}
                />

                <nav className="mt-4 flex flex-wrap gap-x-6 text-sm font-bold text-ink-muted" aria-label="Player sections">
                    <a href="#career-stats" className="inline-flex min-h-11 items-center hover:text-rink-blue">Season stats ↓</a>
                    <a href="#transactions" className="inline-flex min-h-11 items-center hover:text-rink-blue">Transaction history ↓</a>
                </nav>
                {/* season-by-season stats lead; the trophy case and chart follow */}
                <div id="career-stats" className="mt-5 scroll-mt-6">
                    <CareerTable careerStats={player.playerStats} awardsByYear={awardsByYear} />
                </div>

                <PlayerExtras trophies={trophies} seasons={player.playerStats} />
                <TransactionHistory key={`player-history-${player.id}`} scope={scope} initial={transactions} seasons={historySeasons} />
            </ProfileContent>
        </main>
    );
}
