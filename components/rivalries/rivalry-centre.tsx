'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FiArrowRight, FiRepeat } from 'react-icons/fi';
import TeamBadge from '@/components/team-badge';
import TeamBranding from '@/components/team-branding/team-branding';
import { CupRow } from '@/components/trophy-icons';
import type { FranchiseCard } from '@/lib/data/league';
import { formatFpts, seasonLabel, teamSeasonHref, winPercentage } from '@/lib/league';
import { directAssets, gameScore, pairSummary, roundLabel, type RivalryGame, type RivalrySeason, type RivalryTrade } from '@/lib/rivalries/model';
import styles from './rivalry-centre.module.css';

interface Props {
    teams: FranchiseCard[];
    games: RivalryGame[];
    seasons: RivalrySeason[];
    trades: RivalryTrade[];
    initialA: number;
    initialB: number;
    initialStage: 'regular' | 'playoff';
}

const shortDate = (date: string) => new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const margin = (game: RivalryGame) => formatFpts(Math.abs(game.awayScore - game.homeScore));
const identityName = (name: string) => name.toLowerCase().replace(/\s/g, '');

export default function RivalryCentre({ teams, games, seasons, trades, initialA, initialB, initialStage }: Props) {
    const [pair, setPair] = useState([initialA, initialB]);
    const [stage, setStage] = useState(initialStage);
    const [allTrades, setAllTrades] = useState(false);
    const [allGames, setAllGames] = useState(false);
    const a = teams.find(team => team.ID === pair[0])!;
    const b = teams.find(team => team.ID === pair[1])!;
    const summary = pairSummary(games.filter(game => game.stage === stage), a.ID, b.ID);
    const exchanges = trades.filter(trade => directAssets(trade, a.ID, b.ID).length);
    const sharedSeasons = seasons.filter(season => season.team === a.ID)
        .flatMap(left => { const right = seasons.find(season => season.team === b.ID && season.year === left.year); return right ? [{ left, right }] : []; });
    const playoffGames = games.filter(game => game.stage === 'playoff');
    const closestPlayoff = playoffGames.filter(game => !game.adjusted && game.winner !== null)
        .sort((x, y) => Math.abs(x.awayScore - x.homeScore) - Math.abs(y.awayScore - y.homeScore))[0];
    const latestFinal = playoffGames.find(game => game.round === game.finalRound);
    const meetingCounts = new Map<string, { a: number; b: number; count: number }>();
    for (const game of playoffGames) {
        const [left, right] = [game.away, game.home].sort((x, y) => x - y);
        const key = `${left}-${right}`;
        meetingCounts.set(key, { a: left, b: right, count: (meetingCounts.get(key)?.count ?? 0) + 1 });
    }
    const mostMeetings = [...meetingCounts.values()].sort((x, y) => y.count - x.count)[0];
    const sortedTeams = [...teams].sort((x, y) => Number(x.defunct) - Number(y.defunct) || x.Team.localeCompare(y.Team));
    const coverage = stage === 'regular' ? '2018–26 regular seasons' : '2018–26 championship playoffs';

    function selectPair(left: number, right: number, nextStage = stage) {
        setPair([left, right]);
        setStage(nextStage);
        setAllTrades(false);
        setAllGames(false);
        const url = new URL(window.location.href);
        url.searchParams.set('a', String(left));
        url.searchParams.set('b', String(right));
        url.searchParams.set('stage', nextStage);
        window.history.replaceState(null, '', url);
    }

    function teamPanel(team: FranchiseCard, opponent: FranchiseCard, points: number) {
        return <TeamBranding teamId={team.ID} className={styles.teamPanel}>
            <div data-brand-part="surface" className={styles.teamSurface}>
                <Link href={`/teams/${team.ID}`} className={styles.teamIdentity}>
                    <TeamBadge logo={team.LogoUrl} abbreviation={team.Abbreviation} teamName={team.Team} size={112} sizeClass={styles.badge} ring="none" priority />
                    <h2>{team.Team}</h2>
                </Link>
                {team.Owner && <p className={styles.owner}>{team.Owner}</p>}
                <div className={styles.cups}><CupRow count={team.championships.length} className="h-8 w-8" /></div>
                <p className={styles.headToHeadPoints}><strong>{formatFpts(points)}</strong><span>FPts vs {opponent.Abbreviation}</span></p>
            </div>
            <div data-brand-part="stripes" className={styles.stripes} />
        </TeamBranding>;
    }

    return <main className={styles.page}>
        <header className={styles.heading}>
            <h1>Rivalries<span>.</span></h1>
            <span className={styles.preview}>Local demo</span>
        </header>

        <div className={styles.selectors}>
            <label>Team one<select value={a.ID} onChange={event => selectPair(Number(event.target.value), b.ID)}>
                {sortedTeams.map(team => <option key={team.ID} value={team.ID} disabled={team.ID === b.ID}>{team.Team}{team.defunct ? ' · retired' : ''}</option>)}
            </select></label>
            <button type="button" className={styles.swap} onClick={() => selectPair(b.ID, a.ID)} aria-label="Swap teams"><FiRepeat aria-hidden="true" /></button>
            <label>Team two<select value={b.ID} onChange={event => selectPair(a.ID, Number(event.target.value))}>
                {sortedTeams.map(team => <option key={team.ID} value={team.ID} disabled={team.ID === a.ID}>{team.Team}{team.defunct ? ' · retired' : ''}</option>)}
            </select></label>
        </div>

        <section className={styles.scoreboard} aria-label={`${a.Team} versus ${b.Team}`}>
            {teamPanel(a, b, summary.pointsA)}
            <div className={styles.score} aria-live="polite" aria-atomic="true">
                <span className={styles.eyebrow}>{stage === 'regular' ? 'Regular-season wins' : 'Playoff wins'}</span>
                <div className={styles.numbers}><strong aria-label={`${a.Abbreviation}: ${summary.winsA} wins`}>{summary.winsA}</strong><span>:</span><strong aria-label={`${b.Abbreviation}: ${summary.winsB} wins`}>{summary.winsB}</strong></div>
                <p>{summary.meetings.length} meeting{summary.meetings.length === 1 ? '' : 's'}{summary.ties > 0 ? ` · ${summary.ties} tied` : ''}{summary.undecided > 0 ? ` · ${summary.undecided} unresolved` : ''}</p>
            </div>
            {teamPanel(b, a, summary.pointsB)}
        </section>

        <div className={styles.scopeBar}>
            <div className={styles.segmented} aria-label="Matchup type">
                <button type="button" aria-pressed={stage === 'regular'} onClick={() => selectPair(a.ID, b.ID, 'regular')}>Regular season</button>
                <button type="button" aria-pressed={stage === 'playoff'} onClick={() => selectPair(a.ID, b.ID, 'playoff')}>Playoffs</button>
            </div>
            <p>{coverage}</p>
        </div>

        <div className={styles.discover}>
            <span>Try a matchup</span>
            {latestFinal && <button type="button" onClick={() => selectPair(latestFinal.away, latestFinal.home, 'playoff')}>{seasonLabel(latestFinal.year)} finalists <FiArrowRight aria-hidden="true" /></button>}
            {closestPlayoff && <button type="button" onClick={() => selectPair(closestPlayoff.away, closestPlayoff.home, 'playoff')}>{margin(closestPlayoff)}-point playoff finish <FiArrowRight aria-hidden="true" /></button>}
            {mostMeetings && <button type="button" onClick={() => selectPair(mostMeetings.a, mostMeetings.b, 'playoff')}>{mostMeetings.count} playoff meetings <FiArrowRight aria-hidden="true" /></button>}
        </div>

        <div className={styles.columns}>
            <section className={styles.card}>
                <div className={styles.sectionHeading}><h2>Head to head</h2><span>{summary.meetings.length} game{summary.meetings.length === 1 ? '' : 's'}</span></div>
                {summary.closest && <div className={styles.closest}>
                    <span>Closest finish</span><strong>{margin(summary.closest)} <small>pts</small></strong>
                    <span>{seasonLabel(summary.closest.year)} · {roundLabel(summary.closest)}</span>
                </div>}
                {summary.meetings.length === 0 ? <p className={styles.empty}>{stage === 'regular' ? 'No regular-season meetings in the archive.' : 'These franchises have not met in the championship playoffs.'}</p> :
                    <ol className={styles.games}>{(allGames ? summary.meetings : summary.meetings.slice(0, 8)).map(game => {
                        const leftName = game.away === a.ID ? game.awayName : game.homeName;
                        const rightName = game.away === b.ID ? game.awayName : game.homeName;
                        return <li key={game.id} className={styles.game}>
                            <div className={styles.gameMeta}><span>{seasonLabel(game.year)} · {roundLabel(game)}{game.stage === 'regular' && game.winner === null ? ' · Tie' : ''}</span><Link href={teamSeasonHref(game.year, a.ID, game.stage === 'playoff' ? game.round : null)}>Season <FiArrowRight aria-hidden="true" /></Link></div>
                            <div className={styles.gameScore}>
                                <div><span title={leftName}>{a.Abbreviation}</span><strong data-winner={game.winner === a.ID}>{formatFpts(gameScore(game, a.ID))}{game.winner === a.ID && <i aria-label="Winner">W</i>}</strong></div>
                                <span className={styles.versus}>vs</span>
                                <div><span title={rightName}>{b.Abbreviation}</span><strong data-winner={game.winner === b.ID}>{formatFpts(gameScore(game, b.ID))}{game.winner === b.ID && <i aria-label="Winner">W</i>}</strong></div>
                            </div>
                            {(identityName(leftName) !== identityName(a.Team) || identityName(rightName) !== identityName(b.Team)) && <p className={styles.historicalNames}>{leftName} vs {rightName}</p>}
                            {game.note && <details className={styles.gameNote}><summary>Scoring note</summary><p>{game.note}</p></details>}
                        </li>;
                    })}</ol>}
                {summary.meetings.length > 8 && <button type="button" className={styles.showTrades} aria-expanded={allGames} onClick={() => setAllGames(!allGames)}>{allGames ? 'Show fewer matchups' : `Show all ${summary.meetings.length} matchups`}</button>}
            </section>

            <aside className={styles.card}>
                <div className={styles.sectionHeading}><h2>Franchise records</h2></div>
                <p className={styles.caption}>All seasons · all opponents</p>
                <table className={styles.records}>
                    <thead><tr><th scope="col">{a.Abbreviation}</th><th scope="col"><span className="sr-only">Statistic</span></th><th scope="col">{b.Abbreviation}</th></tr></thead>
                    <tbody>
                        <tr><td>{a.championships.length}</td><th scope="row">Jagr Cups</th><td>{b.championships.length}</td></tr>
                        <tr><td>{a.finals.length}</td><th scope="row">Finals</th><td>{b.finals.length}</td></tr>
                        <tr><td>{a.Wins}–{a.Losses}–{a.Ties}</td><th scope="row">Regular W–L–T</th><td>{b.Wins}–{b.Losses}–{b.Ties}</td></tr>
                        <tr><td>{winPercentage({ wins: a.Wins, losses: a.Losses, ties: a.Ties }).toFixed(1)}%</td><th scope="row">Win rate</th><td>{winPercentage({ wins: b.Wins, losses: b.Losses, ties: b.Ties }).toFixed(1)}%</td></tr>
                    </tbody>
                </table>
                <div className={styles.seasonHeading}><h3>Points by season</h3><span>Regular season</span></div>
                {sharedSeasons.length === 0 ? <p className={styles.empty}>No shared seasons.</p> : <table className={styles.seasonPoints}>
                    <thead><tr><th scope="col">{a.Abbreviation}</th><th scope="col">Season</th><th scope="col">{b.Abbreviation}</th></tr></thead>
                    <tbody>{sharedSeasons.map(({ left, right }) => <tr key={left.year}>
                        <td data-leader={left.points > right.points}>{formatFpts(left.points)}</td>
                        <th scope="row"><Link href={`/season/${left.year}`}>{seasonLabel(left.year)}</Link></th>
                        <td data-leader={right.points > left.points}>{formatFpts(right.points)}</td>
                    </tr>)}</tbody>
                </table>}
            </aside>
        </div>

        <section className={`${styles.card} ${styles.tradeSection}`}>
            <div className={styles.sectionHeading}><h2>Trading history</h2><span>{exchanges.length} trade{exchanges.length === 1 ? '' : 's'}</span></div>
            {exchanges.length === 0 ? <p className={styles.empty}>No direct trades between these franchises in the archive.</p> : <>
                <div className={styles.tradeList}>{(allTrades ? exchanges : exchanges.slice(0, 3)).map(trade => {
                    const assets = directAssets(trade, a.ID, b.ID);
                    const multiTeam = new Set(trade.assets.flatMap(asset => [asset.from, asset.to]).filter(id => id !== null)).size > 2;
                    return <article key={trade.id} className={styles.trade}>
                        <div className={styles.tradeDate}><time dateTime={trade.date}>{shortDate(trade.date)}</time>{multiTeam && <span>Direct exchanges from a multi-team trade</span>}</div>
                        <div className={styles.tradeSides}>{[a,b].map(team => <div key={team.ID}>
                            <h3>{team.Abbreviation} received</h3>
                            <ul>{assets.filter(asset => asset.to === team.ID).map(asset => <li key={asset.id}>{asset.playerId ? <Link href={`/player/${encodeURIComponent(asset.playerId)}`}>{asset.label}</Link> : asset.label}</li>)}</ul>
                            {!assets.some(asset => asset.to === team.ID) && <p className={styles.caption}>No assets received directly.</p>}
                        </div>)}</div>
                    </article>;
                })}</div>
                {exchanges.length > 3 && <button type="button" className={styles.showTrades} aria-expanded={allTrades} onClick={() => setAllTrades(!allTrades)}>{allTrades ? 'Show fewer trades' : `Show all ${exchanges.length} trades`}</button>}
            </>}
        </section>
        <footer className={styles.footer}>Regular-season scores: <a href="https://www.fantrax.com/developer" target="_blank" rel="noreferrer">Fantrax, 2018–26</a> · 1,922 matchups. 2019–20 playoffs excluded. Team history follows franchise renames.</footer>
    </main>;
}
