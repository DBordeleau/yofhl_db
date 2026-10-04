import { notFound } from 'next/navigation';
import FadeIn from '@/components/fade-in';
import PlayoffBracket from '@/components/playoff-bracket';
import StandingsTable from '@/components/standings-table';
import SeasonArrival from '@/components/season-arrival';
import StatTable from '@/components/stat-table';
import TeamBadge from '@/components/team-badge';
import { JagrCupIcon } from '@/components/trophy-icons';
import { getBannerSeasons, getChampionRoster, getSeasonDetail } from '@/lib/data/league';

// every season with a banner is built ahead of time
export async function generateStaticParams() {
    return (await getBannerSeasons()).map((s) => ({ year: String(s.year) }));
}

// a season's page at /champions/[year]: champion and championship roster, playoff bracket, standings
export default async function ChampionsPage({ params }: { params: Promise<{ year: string }> }) {
    const { year } = await params;
    const seasonYear = parseInt(year, 10);
    const season = (await getBannerSeasons()).find((s) => s.year === seasonYear);
    if (!season) notFound();
    const detail = await getSeasonDetail(seasonYear);
    const playoffTeams = Array.from(new Set(detail.games.filter((g) => g.bracket === 'championship').flatMap((g) => [g.away.franchiseId, g.home.franchiseId])));
    const finalGame = detail.games.filter((g) => g.bracket === 'championship').sort((a, b) => b.round - a.round)[0];

    if (season.playoffStatus === 'cancelled') {
        return (
            <FadeIn key={seasonYear} className="flex flex-col gap-10">
                <SeasonArrival />
                <div className="mx-auto w-full max-w-board rounded-3xl border-2 border-dashed border-line-strong px-6 py-12 text-center">
                    <div className="text-xs font-bold uppercase tracking-[.2em] text-ink-muted">{season.label}</div>
                    <div className="font-wide mt-2 text-2xl font-extrabold uppercase">Playoffs cancelled</div>
                    <p className="mt-2 text-ink-muted">The {season.label} playoffs were cancelled due to the COVID-19 pandemic.</p>
                </div>
                <StandingsTable standings={detail.standings} championFranchiseId={null} playoffFranchiseIds={[]} />
            </FadeIn>
        );
    }

    const champ = await getChampionRoster(seasonYear);
    if (!champ) notFound();

    return (
        <div className="flex flex-col gap-10">
            <SeasonArrival />
            <FadeIn
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

                <div id="championship-roster" className="mx-auto mt-7 max-w-board scroll-mt-6 3xl:mx-0 3xl:mt-0 3xl:max-w-none">
                    {champ.rows.length ? (
                        <StatTable topPlayers={champ.rows} mode="champions" animationKey={year} />
                    ) : (
                        <p className="rounded-3xl border-2 border-dashed border-line-strong px-6 py-10 text-center font-semibold text-ink-faint">
                            The championship roster hasn&apos;t been set yet.
                        </p>
                    )}
                </div>
            </FadeIn>
            <PlayoffBracket games={detail.games} />
            <StandingsTable
                standings={detail.standings}
                championFranchiseId={finalGame?.winnerFranchiseId ?? null}
                playoffFranchiseIds={playoffTeams}
            />
        </div>
    );
}
