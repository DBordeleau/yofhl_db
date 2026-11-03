import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageContents from '@/components/page-contents';
import contentsStyles from '@/components/page-contents.module.css';
import styles from '@/components/season-page.module.css';
import PlayoffBracket from '@/components/playoff-bracket';
import StandingsTable from '@/components/standings-table';
import SeasonArrival from '@/components/season-arrival';
import SeasonLeaders from '@/components/season-leaders';
import SeasonDraft from '@/components/season-draft';
import SeasonPicker from '@/components/season-picker';
import ChampionRoster from '@/components/champion-roster';
import TeamBadge from '@/components/team-badge';
import Arrow from '@/components/arrow';
import { JagrCupIcon } from '@/components/trophy-icons';
import { getSeasonArchive, getChampionRoster, getSeasonDetail, getSingleSeasonLeaderboard } from '@/lib/data/league';
import { getSeasonDraft } from '@/lib/data/history';
import { seasonLabel } from '@/lib/league';
import { neighbours } from '@/lib/seasons';
import ExploreNext from '@/components/explore-next';
import ShareButton from '@/components/share/share-button';
import { seasonShareCard } from '@/lib/share/model';
import { playerHref } from '@/lib/player-url';

export async function generateMetadata({ params }: { params: Promise<{ year: string }> }) {
    const { year } = await params;
    return { title: `${seasonLabel(Number(year))} Season · YOFHL` };
}

// every published season is built ahead of time
export async function generateStaticParams() {
    return (await getSeasonArchive()).published.map((s) => ({ year: String(s.year) }));
}

// A season's champion, roster, bracket, standings, player leaders, and draft class.
export default async function SeasonPage({ params }: {
    params: Promise<{ year: string }>;
}) {
    const { year } = await params;
    if (!/^\d{4}$/.test(year)) notFound();
    const seasonYear = Number(year);
    const archive = await getSeasonArchive();
    const season = archive.published.find((s) => s.year === seasonYear);
    if (!season) notFound();
    const cancelled = season.playoffStatus === 'cancelled';
    const [detail, leaders, draft, champ] = await Promise.all([
        getSeasonDetail(seasonYear),
        getSingleSeasonLeaderboard('all', 1, '', seasonYear),
        getSeasonDraft(seasonYear),
        cancelled ? null : getChampionRoster(seasonYear),
    ]);
    const playoffTeams = Array.from(new Set(detail.games.filter((g) => g.bracket === 'championship').flatMap((g) => [g.away.franchiseId, g.home.franchiseId])));
    const finalGame = detail.games.filter((g) => g.bracket === 'championship').sort((a, b) => b.round - a.round)[0];
    if (!cancelled && !champ) notFound();
    const { newer: next, older: previous } = neighbours(archive, seasonYear);
    const label = seasonLabel(seasonYear);
    const leader = leaders.rows[0];
    const sections = [
        ...(champ ? [{ id: 'championship-roster', label: 'Champion’s roster' }] : []),
        ...(!cancelled && detail.games.length ? [{ id: 'playoffs', label: 'Playoffs' }] : []),
        { id: 'standings', label: 'Regular season' },
        { id: 'season-leaders', label: 'Top players' },
        { id: 'draft-class', label: 'Draft class' },
    ];

    return (
        <div className={styles.page}>
            <SeasonArrival />
            <section key={seasonYear} className={styles.hero} aria-label={`${label} season`}>
                {/* newer seasons sit to the left, older to the right, the same way the banners above run */}
                <div className={styles.heroTop}>
                    {next
                        ? <Link href={`/season/${next}`} className={`${styles.heroLink} ${styles.heroPrevNext}`}><Arrow direction="left" /> {seasonLabel(next)}</Link>
                        : <Link href="/#current-season" className={`${styles.heroLink} ${styles.heroPrevNext}`}><Arrow direction="left" /> Current season</Link>}
                    <div className={styles.heroActions}>
                        <ShareButton card={seasonShareCard(season, champ?.rows)} dark />
                        {previous ? <Link href={`/season/${previous}`} className={`${styles.heroLink} ${styles.heroPrevNext}`}>{seasonLabel(previous)} <Arrow /></Link> : null}
                    </div>
                </div>
                <div className={styles.heroBody}>
                    {champ ? <TeamBadge logo={champ.logo} abbreviation={champ.abbreviation} teamName={champ.team} size={150} sizeClass="h-[74px] w-[74px] sm:h-[110px] sm:w-[110px] md:h-[150px] md:w-[150px]" ring="glow" priority /> : null}
                    <div className={styles.heroText}>
                        <SeasonPicker year={seasonYear} seasons={archive.published} />
                        {champ ? <>
                            <h1>{champ.team}</h1>
                            <div className={styles.heroLine}>
                                <span className={styles.goldSlab}>Jagr Cup champions</span>
                                {champ.owner ? <span className={styles.owner}>{champ.owner}</span> : null}
                            </div>
                        </> : <>
                            <h1>Playoffs cancelled</h1>
                            <p className={styles.heroLine}><span className={styles.owner}>The {label} playoffs were cancelled due to the COVID-19 pandemic.</span></p>
                        </>}
                    </div>
                    {champ ? <JagrCupIcon sizes="210px" className={styles.cup} /> : null}
                </div>
                <span className={`banner-stripes ${styles.stripes}`} />
            </section>

            <PageContents key={`contents-${seasonYear}`} variant="bar" title={label} contentId="season-sections" sections={sections} />

            <div id="season-sections" className={`${contentsStyles.sections} ${styles.sections} flex flex-col gap-10`}>
                {champ ? <div id="championship-roster" key={champ.year} className={`${contentsStyles.anchor} mx-auto w-full max-w-board`}>
                    {champ.rows.length ? (
                        <ChampionRoster players={champ.rows} animationKey={year} />
                    ) : (
                        <p className="rounded-md border-2 border-dashed border-line-strong px-6 py-10 text-center font-semibold text-ink-faint">
                            The championship roster hasn&apos;t been set yet.
                        </p>
                    )}
                </div> : null}
                {!cancelled && <PlayoffBracket games={detail.games} />}
                <StandingsTable
                    standings={detail.standings}
                    championFranchiseId={cancelled ? null : finalGame?.winnerFranchiseId ?? null}
                    playoffFranchiseIds={cancelled ? [] : playoffTeams}
                />
                <SeasonLeaders key={`leaders-${seasonYear}`} year={seasonYear} initial={leaders} />
                <SeasonDraft key={`draft-${seasonYear}`} year={seasonYear} picks={draft} />
                {/* the neighbouring seasons already sit in the hero, so these point elsewhere */}
                <ExploreNext currentHref={`/season/${seasonYear}`} links={[
                    season.franchiseId && !cancelled ? { href: `/teams/${season.franchiseId}`, title: season.team!, reason: 'Explore the champion’s franchise history' } : null,
                    leader ? { href: playerHref(leader.ID), title: leader.Player, reason: 'This season’s fantasy points leader' } : null,
                ]} />
            </div>
        </div>
    );
}
