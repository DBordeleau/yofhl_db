import type { Metadata } from 'next';
import Link from 'next/link';
import TeamBadge from '@/components/team-badge';
import TeamBranding from '@/components/team-branding/team-branding';
import { TrophyArt } from '@/components/trophy-icons';
import MatchupBrowser from '@/components/home/matchup-browser';
import RosterBrowser from '@/components/home/roster-browser';
import HeroRink from '@/components/home/hero-rink';
import SectionLink from '@/components/home/section-link';
import DraftAnnouncement from '@/components/draft-announcement';
import { getSingleSeasonLeaderboard, getBannerSeasons } from '@/lib/data/league';
import { FANTRAX_LEAGUE_URL, getLeagueSnapshot, getMatchupScores } from '@/lib/fantrax/data';
import { periodPhase, selectPeriod, shortDate } from '@/lib/fantrax/model';
import { formatFpts, seasonLabel } from '@/lib/league';
import styles from '@/components/home/home.module.css';

export const metadata: Metadata = {
    title: 'YOFHL · League home',
    description: 'Ye Olde Fantasy Hockey League standings, matchups, rosters, scoring leaders, and season history.',
};

export default async function HomePage({ searchParams }: { searchParams: Promise<{ period?: string | string[]; roster?: string | string[] }> }) {
    const [params, snapshot, seasons] = await Promise.all([
        searchParams,
        getLeagueSnapshot().catch(() => null),
        getBannerSeasons(),
    ]);
    const now = Date.now();
    const period = snapshot ? selectPeriod(snapshot.scoringPeriods, typeof params.period === 'string' ? params.period : undefined, now) : null;
    const current = snapshot ? selectPeriod(snapshot.scoringPeriods, undefined, now) : null;
    const [scores, leaders] = await Promise.all([
        period && periodPhase(period, now) !== 'upcoming' ? getMatchupScores(period.number).catch(() => null) : null,
        snapshot ? getSingleSeasonLeaderboard('all', 1, '', snapshot.seasonYear + 1).catch(() => null) : null,
    ]);
    const opening = snapshot?.scoringPeriods[0];
    const preseason = opening ? now < Date.parse(opening.startDate) : false;
    const champion = [...seasons].reverse().find(season => season.team);
    const season = snapshot ? seasonLabel(snapshot.seasonYear + 1) : 'Current season';
    const updated = snapshot ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(snapshot.fetchedAt)) : null;
    const totalGames = snapshot?.teams.some(team => team.record && team.record !== '0-0-0');
    const rosterFranchiseId = typeof params.roster === 'string' && /^\d+$/.test(params.roster) ? Number(params.roster) : undefined;

    return <main className={styles.home}>
        <section className={styles.hero} aria-labelledby="home-heading">
            <HeroRink />
            <div className={styles.heroInner}>
                <div className={styles.heroCopy}>
                    <p className={styles.heroKicker}><span /> Ye Olde Fantasy Hockey League</p>
                    <h1 id="home-heading">YOFHL<br /><span>{season}</span></h1>
                    <div className={styles.heroActions}><Link href="/stats/all-time/all" className={styles.historyButton}>Explore League History <span aria-hidden="true">↗</span></Link><SectionLink href="#current-season" className={styles.seasonButton}>Current Season <span aria-hidden="true">↓</span></SectionLink></div>
                </div>
                <div className={styles.heroArt}>
                    <TrophyArt award="Jagr Cup" className={styles.heroTrophy} sizes="(max-width: 640px) 190px, 370px" priority title="The Jagr Cup" />
                    <span className={styles.trophyCaption}>Jagr Cup</span>
                </div>
            </div>
            <div className={styles.heroBottom}><div className={styles.heroBottomInner}>
                <p><span className={styles.statusDot} />{preseason && opening ? <>Season starts <strong>{shortDate(opening.startDate)}</strong></> : current ? <>Season {periodPhase(current, now) === 'complete' ? 'complete' : 'in progress'} <strong>Round {current.number}</strong></> : 'League home'}</p>
                <span className={styles.dailyLabel}>Updated daily</span>
            </div></div>
        </section>

        <div className={styles.content}>
            <DraftAnnouncement featured />
            <div id="current-season" className={styles.sectionNavRow} tabIndex={-1}>
                <nav className={styles.sectionNav} aria-label="League home sections"><SectionLink href="#matchups">Matchups</SectionLink><SectionLink href="#standings">Standings</SectionLink><SectionLink href="#rosters">Rosters</SectionLink></nav>
                <span className={styles.updateLabel}>{updated ? <>Updated {updated} ET <span>· Daily snapshot</span></> : 'Snapshot temporarily unavailable'}</span>
            </div>

            {snapshot && period && current ? <MatchupBrowser periods={snapshot.scoringPeriods} selected={period} matchups={snapshot.schedule.find(item => item.period === period.number)?.matchupList ?? []} scores={scores} teams={snapshot.teams.map(({ id, franchiseId, name, abbreviation, logo }) => ({ id, franchiseId, name, abbreviation, logo }))} now={now} currentPeriod={current.number} /> : <section id="matchups" className={styles.unavailable}><h2>League data is temporarily unavailable</h2><p>You can still browse league history or view the current season on Fantrax.</p><a href={FANTRAX_LEAGUE_URL} target="_blank" rel="noreferrer" className={styles.textLink}>Open Fantrax ↗</a></section>}

            <div className={styles.leagueGrid}>
                <section id="standings" aria-labelledby="standings-heading" tabIndex={-1}>
                    <div className={styles.sectionHeading}><h2 id="standings-heading">Standings</h2><span className={styles.seasonPill}>{season}</span></div>
                    <div className={styles.standingsPanel}>
                        <div className={styles.standingsCaption}><span>{preseason ? 'Preseason' : 'Season record'}</span><span>W–L–T · Fantasy points</span></div>
                        {snapshot ? <table className={styles.standingsTable}><caption className="sr-only">{season} YOFHL standings. {preseason ? 'Season has not started; all teams are tied.' : 'Updated daily.'}</caption><thead><tr><th scope="col"><span className="sr-only">Rank</span>#</th><th scope="col">Team</th><th scope="col">W–L–T</th><th scope="col"><abbr title="Fantasy points for">FPts</abbr></th></tr></thead><tbody>
                            {snapshot.teams.map(team => <tr key={team.id}>
                                <td className={styles.standingsRank}>{preseason || !totalGames ? '—' : team.rank ?? '—'}</td>
                                <th scope="row">{team.franchiseId ? <Link href={`/teams/${team.franchiseId}`} className={styles.standingTeam}><TeamBadge logo={team.logo} abbreviation={team.abbreviation} teamName={team.name} size={34} ring="none" /><span>{team.name}</span></Link> : <span>{team.name}</span>}</th>
                                <td className={styles.standingsRecord}>{team.record ?? '—'}</td><td className={styles.standingsPoints}>{team.points == null ? '—' : formatFpts(team.points)}</td>
                            </tr>)}
                        </tbody></table> : <p className={styles.emptyState}>Standings will return when the league snapshot is available.</p>}
                        <div className={styles.standingsFooter}><span>{preseason || !totalGames ? 'No games played' : 'Updated daily'}</span><a href={FANTRAX_LEAGUE_URL} target="_blank" rel="noreferrer">League on Fantrax ↗</a></div>
                    </div>
                </section>

                <aside className={styles.historyColumn} aria-label="Champions and scoring leaders">
                    {champion ? <TeamBranding teamId={champion.franchiseId} data-brand-layout="champion"><Link data-brand-part="surface" href={`/season/${champion.year}#championship-roster`} className={styles.championCard}>
                        <div className={styles.championTop}><span className={styles.eyebrow}>Reigning champions</span><span className={styles.championSeason}>{champion.label}</span></div>
                        <div className={styles.championIdentity}><TeamBadge logo={champion.logo} abbreviation={champion.abbreviation} teamName={champion.team} size={76} ring="none" /><div><span>Jagr Cup champions</span><h3>{champion.team}</h3></div></div>
                        <div className={styles.championBottom}>View championship season <span aria-hidden="true">↗</span></div>
                    </Link></TeamBranding> : null}
                    <section className={styles.leadersCard} aria-labelledby="leaders-heading"><div className={styles.leadersHeading}><p className={styles.eyebrow}>{season}</p><h3 id="leaders-heading">Scoring leaders</h3></div>
                        {leaders?.rows.length ? <><ol>{leaders.rows.slice(0, 5).map((player, index) => <li key={player.ID}><Link href={`/player/${encodeURIComponent(player.ID)}`}><span className={styles.leaderRank}>{String(index + 1).padStart(2, '0')}</span><span>{player.Player}<small>{player.Position.replace(/,/g, ' · ')} · {player.YOFHLTeam}</small></span><strong>{formatFpts(player.FPts)}<small>FPts</small></strong></Link></li>)}</ol><p className={styles.leadersNote}>Based on imported {season} player stats.</p></> : <div className={styles.leadersEmpty}><p>{preseason && opening ? <>Season starts {shortDate(opening.startDate)}.</> : 'Current-season player stats are not available yet.'}</p></div>}
                        <a href={FANTRAX_LEAGUE_URL} target="_blank" rel="noreferrer" className={styles.leaderFooter}>View season on Fantrax <span aria-hidden="true">↗</span></a>
                    </section>
                </aside>
            </div>

            {snapshot ? <RosterBrowser key={rosterFranchiseId ?? 'default'} teams={snapshot.teams} rosterPeriod={snapshot.rosterPeriod} initialFranchiseId={rosterFranchiseId} /> : null}

            <section id="history" className={styles.archiveBand} aria-labelledby="archive-heading"><div><h2 id="archive-heading">This league has history.</h2><Link href="/stats/all-time/all" className={styles.historyButton}>Explore League History <span aria-hidden="true">↗</span></Link></div><div className={styles.archiveLinks}><Link href="/season">Seasons <span aria-hidden="true">↗</span></Link><Link href="/awards">Awards <span aria-hidden="true">↗</span></Link><Link href="/teams/stats">Franchise records <span aria-hidden="true">↗</span></Link></div></section>

            <footer className={styles.footer}><span><strong>YOFHL</strong> Ye Olde Fantasy Hockey League</span><span>Standings, matchups & rosters from Fantrax · Updated daily</span></footer>
        </div>
    </main>;
}
