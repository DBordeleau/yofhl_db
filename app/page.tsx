import { playerHref } from '@/lib/player-url';
import type { Metadata } from 'next';
import Link from 'next/link';
import TeamBadge from '@/components/team-badge';
import TeamBranding from '@/components/team-branding/team-branding';
import { TrophyArt } from '@/components/trophy-icons';
import MatchupBrowser from '@/components/home/matchup-browser';
import RosterBrowser from '@/components/home/roster-browser';
import HeroRink from '@/components/home/hero-rink';
import HeroStudio from '@/components/home/hero-studio';
import SectionLink from '@/components/home/section-link';
import { fantraxLeagueUrl } from '@/lib/fantrax/config';
import { fantraxLeagueIdOf, getLiveSeason } from '@/lib/fantrax/live-season';
import { shortDate } from '@/lib/live-season-display';
import { getPublishedEpisodes } from '@/lib/data/coachs-corner';
import { formatFpts, seasonLabel } from '@/lib/league';
import { livePickemWeeks } from '@/lib/pickem/model';
import { PICKEM_LAUNCH } from '@/lib/pickem/settings';
import { pickemPrize } from '@/components/pickem/prizes';
import styles from '@/components/home/home.module.css';
import Arrow from '@/components/arrow';

export const metadata: Metadata = {
    title: 'YOFHL · League home',
    description: 'Ye Olde Fantasy Hockey League standings, matchups, rosters, scoring leaders, and season history.',
};

export const revalidate = 300;

export default async function HomePage() {
    const [result, episodes] = await Promise.all([
        getLiveSeason({ now: Date.now() }),
        getPublishedEpisodes().catch(error => { console.error("Coach's Corner episodes unavailable:", error); return []; }),
    ]);
    const live = result.status === 'available' ? result.value : null;
    const fantraxUrl = fantraxLeagueUrl(fantraxLeagueIdOf(result));
    const leaders = live?.leaders.status === 'available' ? live.leaders.value : null;
    const rosterStats = live?.rosterStats.status === 'available' ? live.rosterStats.value : null;
    const latestEpisode = episodes[0];
    const opening = live?.weeks[0];
    const preseason = opening?.phase === 'upcoming';
    const season = live ? seasonLabel(live.seasonYear) : 'Current season';
    const updated = live ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(live.fetchedAt)) : null;
    const totalGames = live?.standings.rows.some(row => row.record && row.record !== '0-0-0');
    const playoffTeams = live?.standings.playoffTeams ?? 0;
    const byeTeams = live?.standings.byeTeams ?? 0;
    const seasonYear = live?.seasonYear ?? null;
    // the weeks with a Pick'em contest and their locks, so the matchups can point at the week's picks
    const pickemWeeks = live ? livePickemWeeks(live, PICKEM_LAUNCH).map(({ week, lock }) => ({ week, lock })) : [];

    return <main className={styles.home}>
        <section className={styles.hero} aria-labelledby="home-heading">
            <HeroRink />
            <div className={styles.heroInner} data-studio={latestEpisode ? '' : undefined}>
                <div className={styles.heroCopy}>
                    <p className={styles.heroKicker}>Ye Olde Fantasy Hockey League</p>
                    <h1 id="home-heading">YOFHL <span>{season}</span></h1>
                    <div className={styles.heroActions}><Link href="/stats/all-time/all" className={styles.historyButton}>Explore league history <Arrow /></Link><SectionLink href="#current-season" className={styles.seasonButton}>Current season <Arrow direction="down" /></SectionLink></div>
                </div>
                {latestEpisode ? <HeroStudio episode={latestEpisode} /> : null}
                <div className={styles.heroArt}>
                    <TrophyArt award="Jagr Cup" className={styles.heroTrophy} sizes="(max-width: 360px) 150px, (max-width: 600px) 190px, (max-width: 800px) 280px, (max-width: 1100px) 330px, (min-width: 1800px) 430px, 390px" priority title="The Jagr Cup" />
                </div>
            </div>
        </section>

        <div className={styles.content}>
            <div id="current-season" className={styles.sectionNavRow} tabIndex={-1}>
                <nav className={styles.sectionNav} aria-label="League home sections"><SectionLink href="#matchups">Matchups</SectionLink><SectionLink href="#standings">Standings</SectionLink><SectionLink href="#rosters">Rosters</SectionLink></nav>
                <span className={styles.updateLabel}>{updated ? <>Updated {updated} ET</> : 'Snapshot temporarily unavailable'}</span>
            </div>

            {live ? <MatchupBrowser weeks={live.weeks} current={{ week: live.currentWeek, scores: live.scores.status === 'available' ? live.scores.value : null }} teams={live.teams.map(({ id, franchiseId, name, abbreviation, logo }) => ({ id, franchiseId, name, abbreviation, logo }))} fantraxLeagueId={live.fantraxLeagueId} pickem={{ weeks: pickemWeeks, prize: pickemPrize(live.seasonYear) }} /> : <section id="matchups" className={styles.unavailable}><h2>League data is temporarily unavailable</h2><p>You can still browse league history or view the current season on Fantrax.</p><a href={fantraxUrl} target="_blank" rel="noreferrer" className={styles.textLink}>Open Fantrax <Arrow direction="out" /></a></section>}

            <div className={styles.leagueGrid}>
                <section id="standings" aria-labelledby="standings-heading" tabIndex={-1}>
                    <div className={styles.sectionHeading}><h2 id="standings-heading">Standings</h2></div>
                    <div className={styles.standingsPanel}>
                        {live ? <table className={styles.standingsTable}><caption className="sr-only">{season} YOFHL standings. {preseason ? 'Season has not started; all teams are tied.' : ''} {playoffTeams ? `The top ${playoffTeams} teams make the playoffs, and the top ${byeTeams} get first-round byes.` : ''}</caption><thead><tr><th scope="col"><span className="sr-only">Rank</span>#</th><th scope="col">Team</th><th scope="col">W–L–T</th><th scope="col"><abbr title="Fantasy points for">FPts</abbr></th></tr></thead><tbody>
                            {live.standings.rows.flatMap(({ team, rank, record, points, bye, playoffLineBelow }) => {
                                const name = <span className={styles.standingName}><span>{team.name}</span></span>;
                                const row = <tr key={team.id}>
                                    {/* the bye belongs to the slot, not the team in it, so the rank cell carries it */}
                                    <td className={styles.standingsRank}>{preseason || !totalGames || rank == null ? '—' : bye ? <span className={styles.byeSlot} title="First-round bye">{rank}</span> : rank}</td>
                                    <th scope="row">{team.href ? <Link href={team.href} className={styles.standingTeam}><TeamBadge logo={team.logo} abbreviation={team.abbreviation} teamName={team.name} size={36} ring="none" />{name}</Link> : name}</th>
                                    <td className={styles.standingsRecord}>{record ?? '—'}</td><td className={styles.standingsPoints}>{points == null ? '—' : formatFpts(points)}</td>
                                </tr>;
                                // the caption already says how many teams make it, so the line itself is decoration
                                return playoffLineBelow
                                    ? [row, <tr key="playoff-line" className={styles.playoffLine} aria-hidden="true"><td colSpan={4}><span>Playoffs</span></td></tr>]
                                    : [row];
                            })}
                        </tbody></table> : <p className={styles.emptyState}>Standings will return when the league snapshot is available.</p>}
                        <div className={styles.standingsFooter}><span>{preseason || !totalGames ? 'No games played yet' : byeTeams ? <span className={styles.byeLegend}><i aria-hidden="true" />Top {byeTeams} get a first-round bye</span> : null}</span><a href={fantraxUrl} target="_blank" rel="noreferrer">View on fantrax <Arrow direction="out" /></a></div>
                    </div>
                </section>

                <section aria-labelledby="leaders-heading">
                    <div className={styles.sectionHeading}><h2 id="leaders-heading">Scoring leaders</h2></div>
                    <div className={styles.leadersCard}>
                        {leaders?.players.length ? <ol>{leaders.players.map((player, index) => {
                            const team = player.team;
                            const logo = <TeamBadge logo={team?.logo ?? null} abbreviation={team?.abbreviation ?? player.fantraxTeam} teamName={team?.name ?? player.fantraxTeam} size={32} ring="none" />;
                            return <li key={player.id}><TeamBranding teamId={team?.franchiseId} data-brand-layout="card">
                                <div data-brand-part="surface" className={styles.leaderPlayer}>
                                    <span className={styles.leaderRank} aria-label={`Rank ${index + 1}`}>{index + 1}</span>
                                    {team?.href ? <Link className={styles.leaderLogo} href={team.href} aria-label={`${team.name} team page`}>{logo}</Link> : logo}
                                    <div className={styles.leaderDetails}>
                                        {player.archiveId ? <Link className={styles.leaderName} href={playerHref(player.archiveId)}>{player.name}</Link> : <span className={styles.leaderName}>{player.name}</span>}
                                        <span className={styles.leaderPosition}>{player.position.replace(/,/g, ' · ')}</span>
                                    </div>
                                    <div className={styles.leaderStats}>
                                        <strong className={styles.leaderPoints}>{formatFpts(player.points)}<small><abbr title="Fantasy points">FPts</abbr></small></strong>
                                        <strong className={styles.leaderAverage}>{player.perGame == null ? <span aria-label="Unavailable">—</span> : formatFpts(player.perGame)}<small><abbr title="Fantasy points per game">FP/G</abbr></small></strong>
                                    </div>
                                </div>
                            </TeamBranding></li>;
                        })}</ol> : <div className={styles.leadersEmpty}><p>{preseason && opening ? <>Season starts {shortDate(opening.startDate)}.</> : leaders ? 'No scoring recorded yet.' : 'Scoring leaders are temporarily unavailable.'}</p></div>}
                    </div>
                </section>
            </div>

            {live ? <RosterBrowser teams={live.teams} lineupWeek={live.lineupWeek} stats={rosterStats} /> : null}

            <section id="history" className={styles.archiveBand} aria-labelledby="archive-heading">
                <div className={styles.archiveBackdrop} aria-hidden="true">
                    <span className={styles.archivePanel} /><span className={styles.archiveRed} /><span className={styles.archiveGold} />
                    <div className={styles.archiveDots}><div className={styles.archiveSweep} /></div>
                </div>
                <div className={styles.archiveIntro}><h2 id="archive-heading">This league has history.</h2><Link href="/stats/all-time/all" className={styles.historyButton}>Explore league history <Arrow /></Link></div>
                <nav className={styles.archiveTiles} aria-label="League history">
                    <Link href="/season" className={styles.archiveTile}>
                        <span className={styles.archiveVisual} aria-hidden="true">{seasonYear ? <span className={styles.archiveYears}><b>{seasonLabel(seasonYear)}</b><i>{seasonLabel(seasonYear - 1)}</i><i>{seasonLabel(seasonYear - 2)}</i></span> : null}</span>
                        <span className={styles.archiveLabel}>Seasons</span>
                    </Link>
                    <Link href="/awards" className={styles.archiveTile}>
                        <span className={`${styles.archiveVisual} ${styles.archiveTrophies}`} aria-hidden="true">{['Jagr Cup', 'Wayne Gretzky Award', 'Hasek Trophy'].map(award => <TrophyArt key={award} award={award} className={styles.archiveTrophy} sizes="96px" />)}</span>
                        <span className={styles.archiveLabel}>Awards</span>
                    </Link>
                    <Link href="/records" className={styles.archiveTile}>
                        <span className={`${styles.archiveVisual} ${styles.archiveRanks}`} aria-hidden="true">{[100, 76, 58].map((width, index) => <span key={width}><b>{`0${index + 1}`}</b><i><em style={{ width: `${width}%` }} /></i></span>)}</span>
                        <span className={styles.archiveLabel}>Record book</span>
                    </Link>
                </nav>
            </section>

            <footer className={styles.footer}><span><strong>YOFHL</strong> Ye Olde Fantasy Hockey League</span><span>League data from Fantrax.</span></footer>
        </div>
    </main>;
}
