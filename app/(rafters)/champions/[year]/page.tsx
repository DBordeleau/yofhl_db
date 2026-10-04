import { notFound } from 'next/navigation';
import FadeIn from '@/components/fade-in';
import PageContents from '@/components/page-contents';
import contentsStyles from '@/components/page-contents.module.css';
import PlayoffBracket from '@/components/playoff-bracket';
import StandingsTable from '@/components/standings-table';
import SeasonArrival from '@/components/season-arrival';
import SeasonLeaders from '@/components/season-leaders';
import StatTable from '@/components/stat-table';
import TeamBadge from '@/components/team-badge';
import { JagrCupIcon } from '@/components/trophy-icons';
import { getBannerSeasons, getChampionRoster, getSeasonDetail, getSingleSeasonLeaderboard } from '@/lib/data/league';

// every season with a banner is built ahead of time
export async function generateStaticParams() {
    return (await getBannerSeasons()).map((s) => ({ year: String(s.year) }));
}

// A season's champion, roster, bracket, standings, and position-filtered player leaders.
export default async function ChampionsPage({ params }: { params: Promise<{ year: string }> }) {
    const { year } = await params;
    const seasonYear = parseInt(year, 10);
    const season = (await getBannerSeasons()).find((s) => s.year === seasonYear);
    if (!season) notFound();
    const [detail, leaders] = await Promise.all([
        getSeasonDetail(seasonYear),
        getSingleSeasonLeaderboard('all', 1, '', seasonYear),
    ]);
    const playoffTeams = Array.from(new Set(detail.games.filter((g) => g.bracket === 'championship').flatMap((g) => [g.away.franchiseId, g.home.franchiseId])));
    const finalGame = detail.games.filter((g) => g.bracket === 'championship').sort((a, b) => b.round - a.round)[0];
    const cancelled = season.playoffStatus === 'cancelled';
    const champ = cancelled ? null : await getChampionRoster(seasonYear);
    if (!cancelled && !champ) notFound();
    const sections = [
        { id: 'season-overview', label: cancelled ? 'Overview' : 'Champion & roster' },
        ...(!cancelled && detail.games.length ? [{ id: 'playoffs', label: 'Playoffs' }] : []),
        { id: 'standings', label: 'Regular season' },
        { id: 'season-leaders', label: 'Top players' },
    ];

    return (
        <div className={contentsStyles.layout}>
            <SeasonArrival />
            <PageContents key={seasonYear} title={season.label} contentId="season-sections" sections={sections} />
            <div id="season-sections" className={`${contentsStyles.sections} flex flex-col gap-10`}>
                <div id="season-overview">
                    {champ ? <FadeIn
                        key={champ.year}
                        // wide screens: champion header becomes a sticky rail beside the roster
                        className="3xl:grid 3xl:grid-cols-[460px_minmax(0,880px)] 3xl:items-start 3xl:justify-center 3xl:gap-16"
                    >
                        <section className="relative flex flex-col items-center gap-5 overflow-hidden rounded-[22px] px-5 pb-[50px] pt-7 text-center text-white navy-spotlight md:flex-row md:gap-9 md:rounded-[28px] md:px-12 md:pb-[54px] md:pt-10 md:text-left 3xl:sticky 3xl:top-8 3xl:flex-col 3xl:gap-6 3xl:px-10 3xl:pb-16 3xl:text-center">
                            <TeamBadge logo={champ.logo} abbreviation={champ.abbreviation} teamName={champ.team} size={150} sizeClass="h-[110px] w-[110px] md:h-[150px] md:w-[150px]" ring="glow" priority />
                            <div className="min-w-0 flex-1">
                                <div className="text-[11px] font-extrabold uppercase tracking-[.2em] text-gold-light md:text-[13px] md:tracking-[.32em]">
                                    {champ.label} Jagr Cup Champions
                                </div>
                                <h1 className="font-wide my-3 text-[28px] font-extrabold uppercase leading-none md:mb-[18px] md:text-[46px]">{champ.team}</h1>
                                {champ.owner && (
                                    <>
                                        <div className="text-xs font-bold uppercase tracking-[.14em] text-[#9FB0C8]">Owner</div>
                                        <div className="font-wide mt-1 text-[22px] font-extrabold">{champ.owner}</div>
                                    </>
                                )}
                            </div>
                            <JagrCupIcon sizes="160px" className="hidden h-40 w-40 flex-none drop-shadow-[0_10px_24px_rgba(240,199,94,.45)] md:block" />
                            <span className="banner-stripes absolute inset-x-0 bottom-[18px] h-3.5" />
                        </section>

                        <div id="championship-roster" className={`${contentsStyles.anchor} mx-auto mt-7 max-w-board 3xl:mx-0 3xl:mt-0 3xl:max-w-none`}>
                            {champ.rows.length ? (
                                <StatTable topPlayers={champ.rows} mode="champions" animationKey={year} />
                            ) : (
                                <p className="rounded-3xl border-2 border-dashed border-line-strong px-6 py-10 text-center font-semibold text-ink-faint">
                                    The championship roster hasn&apos;t been set yet.
                                </p>
                            )}
                        </div>
                    </FadeIn> : (
                        <FadeIn key={seasonYear} className="rounded-3xl border-2 border-dashed border-line-strong px-6 py-12 text-center">
                            <div className="text-xs font-bold uppercase tracking-[.2em] text-ink-muted">{season.label}</div>
                            <h1 className="font-wide mt-2 text-2xl font-extrabold uppercase">Playoffs cancelled</h1>
                            <p className="mt-2 text-ink-muted">The {season.label} playoffs were cancelled due to the COVID-19 pandemic.</p>
                        </FadeIn>
                    )}
                </div>
                {!cancelled && <PlayoffBracket games={detail.games} />}
                <StandingsTable
                    standings={detail.standings}
                    championFranchiseId={cancelled ? null : finalGame?.winnerFranchiseId ?? null}
                    playoffFranchiseIds={cancelled ? [] : playoffTeams}
                />
                <SeasonLeaders key={`leaders-${seasonYear}`} year={seasonYear} initial={leaders} />
            </div>
        </div>
    );
}
