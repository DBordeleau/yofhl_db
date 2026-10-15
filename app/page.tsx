import type { Metadata } from 'next';
import Link from 'next/link';
import TeamBadge from '@/components/team-badge';
import TeamBranding from '@/components/team-branding/team-branding';
import { TrophyArt } from '@/components/trophy-icons';
import MatchupBrowser from '@/components/home/matchup-browser';
import RosterBrowser from '@/components/home/roster-browser';
import HeroRink from '@/components/home/hero-rink';
import SectionLink from '@/components/home/section-link';
import { FANTRAX_LEAGUE_URL, getLeagueSnapshot, getMatchupScores, getRosterStats, getScoringLeaders } from '@/lib/fantrax/data';
import { periodPhase, selectPeriod, shortDate } from '@/lib/fantrax/model';
import { formatFpts, seasonLabel } from '@/lib/league';
import styles from '@/components/home/home.module.css';
import Arrow from '@/components/arrow';

export const metadata: Metadata = {
    title: 'YOFHL · League home',
    description: 'Ye Olde Fantasy Hockey League standings, matchups, rosters, scoring leaders, and season history.',
};

export default async function HomePage({ searchParams }: { searchParams: Promise<{ period?: string | string[]; roster?: string | string[] }> }) {
    const [params, snapshot] = await Promise.all([
        searchParams,
        getLeagueSnapshot().catch(() => null),
    ]);
    const now = Date.now();
    const period = snapshot ? selectPeriod(snapshot.scoringPeriods, typeof params.period === 'string' ? params.period : undefined, now) : null;
    const current = snapshot ? selectPeriod(snapshot.scoringPeriods, undefined, now) : null;
    const loadScores = (item: typeof period) => item && periodPhase(item, now) !== 'upcoming' ? getMatchupScores(item.number).catch(() => null) : null;
    const [scores, currentScores, leaders, rosterStats] = await Promise.all([
        loadScores(period),
        current?.number === period?.number ? null : loadScores(current),
        snapshot ? getScoringLeaders(snapshot.seasonYear).catch(error => { console.error('Fantrax scoring leaders unavailable:', error); return null; }) : null,
        snapshot ? getRosterStats(snapshot.seasonYear).catch(error => { console.error('Fantrax roster stats unavailable:', error); return null; }) : null,
    ]);
    const opening = snapshot?.scoringPeriods[0];
    const preseason = opening ? now < Date.parse(opening.startDate) : false;
    const season = snapshot ? seasonLabel(snapshot.seasonYear + 1) : 'Current season';
    const updated = snapshot ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(snapshot.fetchedAt)) : null;
    const totalGames = snapshot?.teams.some(team => team.record && team.record !== '0-0-0');
    const seasonPeriods = snapshot?.scoringPeriods.map(item => item.number) ?? [];
    const rosterFranchiseId = typeof params.roster === 'string' && /^\d+$/.test(params.roster) ? Number(params.roster) : undefined;

    return <main className={styles.home}>
        <section className={styles.hero} aria-labelledby="home-heading">
            <HeroRink />
            <div className={styles.heroInner}>
                <div className={styles.heroCopy}>
                    <h1 id="home-heading">YOFHL<br /><span>{season}</span></h1>
                    <div className={styles.heroActions}><Link href="/stats/all-time/all" className={styles.historyButton}>Explore league history <Arrow /></Link><SectionLink href="#current-season" className={styles.seasonButton}>Current season <Arrow direction="down" /></SectionLink></div>
                </div>
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

            {snapshot && period && current ? <MatchupBrowser periods={snapshot.scoringPeriods} seasonPeriods={seasonPeriods} selected={period} matchups={snapshot.schedule.find(item => item.period === period.number)?.matchupList ?? []} scores={scores} current={{ period: current, matchups: snapshot.schedule.find(item => item.period === current.number)?.matchupList ?? [], scores: current.number === period.number ? scores : currentScores }} teams={snapshot.teams.map(({ id, franchiseId, name, abbreviation, logo }) => ({ id, franchiseId, name, abbreviation, logo }))} now={now} /> : <section id="matchups" className={styles.unavailable}><h2>League data is temporarily unavailable</h2><p>You can still browse league history or view the current season on Fantrax.</p><a href={FANTRAX_LEAGUE_URL} target="_blank" rel="noreferrer" className={styles.textLink}>Open Fantrax <Arrow direction="out" /></a></section>}

            <div className={styles.leagueGrid}>
                <section id="standings" aria-labelledby="standings-heading" tabIndex={-1}>
                    <div className={styles.sectionHeading}><h2 id="standings-heading">Standings</h2></div>
                    <div className={styles.standingsPanel}>
                        {snapshot ? <table className={styles.standingsTable}><caption className="sr-only">{season} YOFHL standings. {preseason ? 'Season has not started; all teams are tied.' : ''}</caption><thead><tr><th scope="col"><span className="sr-only">Rank</span>#</th><th scope="col">Team</th><th scope="col">W–L–T</th><th scope="col"><abbr title="Fantasy points for">FPts</abbr></th></tr></thead><tbody>
                            {snapshot.teams.map(team => <tr key={team.id}>
                                <td className={styles.standingsRank}>{preseason || !totalGames ? '—' : team.rank ?? '—'}</td>
                                <th scope="row">{team.franchiseId ? <Link href={`/teams/${team.franchiseId}`} className={styles.standingTeam}><TeamBadge logo={team.logo} abbreviation={team.abbreviation} teamName={team.name} size={34} ring="none" /><span>{team.name}</span></Link> : <span>{team.name}</span>}</th>
                                <td className={styles.standingsRecord}>{team.record ?? '—'}</td><td className={styles.standingsPoints}>{team.points == null ? '—' : formatFpts(team.points)}</td>
                            </tr>)}
                        </tbody></table> : <p className={styles.emptyState}>Standings will return when the league snapshot is available.</p>}
                        <div className={styles.standingsFooter}><span>{preseason || !totalGames ? 'No games played yet' : null}</span><a href={FANTRAX_LEAGUE_URL} target="_blank" rel="noreferrer">View on fantrax <Arrow direction="out" /></a></div>
                    </div>
                </section>

                <section aria-labelledby="leaders-heading">
                    <div className={styles.sectionHeading}><h2 id="leaders-heading">Scoring leaders</h2></div>
                    <div className={styles.leadersCard}>
                        {leaders?.players.length ? <ol>{leaders.players.map((player, index) => {
                            const team = snapshot?.teams.find(team => team.id === player.teamId);
                            const logo = <TeamBadge logo={team?.logo ?? null} abbreviation={team?.abbreviation ?? player.team} teamName={team?.name ?? player.team} size={32} ring="none" />;
                            return <li key={player.id}><TeamBranding teamId={team?.franchiseId} data-brand-layout="card">
                                <div data-brand-part="surface" className={styles.leaderPlayer}>
                                    <span className={styles.leaderRank} aria-label={`Rank ${index + 1}`}>{index + 1}</span>
                                    {team?.franchiseId ? <Link className={styles.leaderLogo} href={`/teams/${team.franchiseId}`} aria-label={`${team.name} team page`}>{logo}</Link> : logo}
                                    <div className={styles.leaderDetails}>
                                        {player.archiveId ? <Link className={styles.leaderName} href={`/player/${encodeURIComponent(player.archiveId)}`}>{player.name}</Link> : <span className={styles.leaderName}>{player.name}</span>}
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

            {snapshot ? <RosterBrowser key={rosterFranchiseId ?? 'default'} teams={snapshot.teams} rosterPeriod={snapshot.rosterPeriod} initialFranchiseId={rosterFranchiseId} stats={rosterStats} seasonYear={snapshot.seasonYear} /> : null}

            <section id="history" className={styles.archiveBand} aria-labelledby="archive-heading"><div><h2 id="archive-heading">This league has history.</h2><Link href="/stats/all-time/all" className={styles.historyButton}>Explore league history <Arrow /></Link></div><div className={styles.archiveLinks}><Link href="/season">Seasons <Arrow /></Link><Link href="/awards">Awards <Arrow /></Link><Link href="/teams/stats">Franchise records <Arrow /></Link></div></section>

            <footer className={styles.footer}><span><strong>YOFHL</strong> Ye Olde Fantasy Hockey League</span><span>League data from Fantrax.</span></footer>
        </div>
    </main>;
}
