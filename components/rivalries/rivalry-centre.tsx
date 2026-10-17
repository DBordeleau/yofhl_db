'use client';

import { playerHref } from '@/lib/player-url';

import { Fragment, useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import CompareTabs from '@/components/compare/compare-tabs';
import ExploreNext from '@/components/explore-next';
import ShareButton from '@/components/share/share-button';
import { teamComparisonHref, teamComparisonState } from '@/lib/compare/state';
import { teamComparisonShareCard } from '@/lib/share/model';
import { FiArrowRight, FiChevronDown, FiRepeat } from 'react-icons/fi';
import TeamBadge from '@/components/team-badge';
import { useTeamBranding } from '@/components/team-branding/branding-provider';
import { JagrCupIcon } from '@/components/trophy-icons';
import type { FranchiseCard } from '@/lib/data/league';
import { formatFpts, seasonLabel, teamSeasonHref, winPercentage } from '@/lib/league';
import { fallbackColours, suggestedPalettes } from '@/lib/team-branding';
import { directAssets, gameScore, pairSummary, roundLabel, type RivalryGame, type RivalrySeason, type RivalryTrade } from '@/lib/rivalries/model';
import styles from './rivalry-centre.module.css';

interface Props {
    teams: FranchiseCard[];
    games: RivalryGame[];
    seasons: RivalrySeason[];
    trades: RivalryTrade[];
    availableYears: number[];
}

const shortDate = (date: string) => new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const margin = (game: RivalryGame) => formatFpts(Math.abs(game.awayScore - game.homeScore));
const identityName = (name: string) => name.toLowerCase().replace(/\s/g, '');
const isFinal = (game: RivalryGame) => game.stage === 'playoff' && game.round === game.finalRound;
const rgb = (hex: string) => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
// Two primaries this close would make the margin chart unreadable, so team two falls back to its secondary.
const similar = (x: string, y: string) => { const [a, b] = [rgb(x), rgb(y)]; return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 110; };

// Eases the scoreboard numbers up from zero whenever the matchup changes.
function useCountUp(key: string) {
    const [progress, setProgress] = useState(1);
    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        let frame = 0;
        const start = performance.now();
        const step = (now: number) => {
            const next = Math.min(1, (now - start) / 900);
            setProgress(next);
            if (next < 1) frame = requestAnimationFrame(step);
        };
        setProgress(0);
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
    }, [key]);
    return 1 - (1 - progress) ** 3;
}

export default function RivalryCentre({ teams, games, seasons, trades, availableYears }: Props) {
    const params = useSearchParams();
    const selection = teamComparisonState(params, teams.map(team => team.ID));
    const stage = selection.stage;
    const [allTrades, setAllTrades] = useState(false);
    const [allGames, setAllGames] = useState(false);
    // The game card being hovered or focused, lit up in the margin chart.
    const [spotlight, setSpotlight] = useState<number | null>(null);
    const palettes = useTeamBranding();
    const a = teams.find(team => team.ID === selection.a)!;
    const b = teams.find(team => team.ID === selection.b)!;
    const summary = pairSummary(games.filter(game => game.stage === stage), a.ID, b.ID);
    const exchanges = trades.filter(trade => directAssets(trade, a.ID, b.ID).length);
    const sharedSeasons = seasons.filter(season => season.team === a.ID)
        .flatMap(left => { const right = seasons.find(season => season.team === b.ID && season.year === left.year); return right ? [{ left, right }] : []; });
    const sortedTeams = [...teams].sort((x, y) => Number(x.defunct) - Number(y.defunct) || x.Team.localeCompare(y.Team));
    const matchupKey = `${a.ID}-${b.ID}-${stage}`;
    const ease = useCountUp(matchupKey);
    const href = teamComparisonHref(a.ID, b.ID, stage);
    const recentSeason = sharedSeasons.map(row => row.left.year).filter(year => availableYears.includes(year)).sort((x, y) => y - x)[0];
    useEffect(() => {
        setAllTrades(false); setAllGames(false); setSpotlight(null);
    }, [matchupKey]);
    useEffect(() => {
        if (`${window.location.pathname}${window.location.search}` !== href) window.history.replaceState(null, '', href);
    }, [href]);

    const colours = (team: FranchiseCard) => palettes[team.ID] ?? suggestedPalettes[team.ID] ?? fallbackColours;
    const [coloursA, coloursB] = [colours(a), colours(b)];
    const chartA = coloursA.primary;
    const chartB = similar(coloursA.primary, coloursB.primary) ? coloursB.secondary : coloursB.primary;
    const theme = { '--a-primary': coloursA.primary, '--a-secondary': coloursA.secondary, '--b-primary': coloursB.primary, '--b-secondary': coloursB.secondary,
        '--chart-a': chartA, '--chart-b': chartB } as CSSProperties;

    const totalPoints = summary.pointsA + summary.pointsB;
    const shareA = totalPoints ? 50 + ((summary.pointsA / totalPoints) * 100 - 50) * ease : 50;
    const meetingsLine = `${summary.meetings.length} meeting${summary.meetings.length === 1 ? '' : 's'}${summary.ties > 0 ? ` · ${summary.ties} tied` : ''}${summary.undecided > 0 ? ` · ${summary.undecided} unresolved` : ''}`;

    // Margin chart: oldest meeting first, grouped by season.
    const chronological = [...summary.meetings].reverse();
    const widestMargin = Math.max(1, ...chronological.filter(game => !game.adjusted).map(game => Math.abs(game.awayScore - game.homeScore)));
    // Round the scale up to a clean step so the margin axis reads 0 / 50 / 100 rather than odd values.
    const tickStep = [10, 20, 25, 50, 100, 200, 250, 500].find(step => widestMargin / step <= 3) ?? 1000;
    const scaleMax = tickStep * Math.ceil(widestMargin / tickStep);
    const ticks = Array.from({ length: scaleMax / tickStep }, (_, i) => (i + 1) * tickStep);
    const barLength = (points: number) => (points / scaleMax) * 112;
    const chartSeasons = [...new Set(chronological.map(game => game.year))].map(year => ({ year, games: chronological.filter(game => game.year === year) }));

    function selectPair(left: number, right: number, nextStage = stage) {
        const next = teamComparisonHref(left, right, nextStage);
        if (next !== href) window.history.pushState(null, '', next);
    }

    function selector(label: string, team: FranchiseCard, other: FranchiseCard, onPick: (id: number) => void, align: 'start' | 'end') {
        return <label className={styles.plate} data-align={align}>
            <TeamBadge logo={team.LogoUrl} abbreviation={team.Abbreviation} teamName={team.Team} size={56} ring="none" />
            <span className={styles.plateText}>
                <span className={styles.plateLabel}>{label}</span>
                <span className={styles.selectWrap}>
                    <select aria-label={label} value={team.ID} onChange={event => onPick(Number(event.target.value))}>
                        {sortedTeams.map(option => <option key={option.ID} value={option.ID} disabled={option.ID === other.ID}>{option.Team}{option.defunct ? ' · retired' : ''}</option>)}
                    </select>
                    <FiChevronDown aria-hidden="true" />
                </span>
            </span>
        </label>;
    }

    function teamSide(team: FranchiseCard, side: 'a' | 'b') {
        return <div className={styles.side} data-side={side}>
            <Link href={`/teams/${team.ID}`} className={styles.teamIdentity}>
                <TeamBadge logo={team.LogoUrl} abbreviation={team.Abbreviation} teamName={team.Team} size={124} sizeClass={styles.heroBadge} ring="none" priority />
                <h2 className={styles.outlined}>{team.Team}</h2>
            </Link>
            {team.Owner && <p className={styles.owner}>{team.Owner}</p>}
            <div className={styles.cups}>{cupStack(team, styles.cup, '128px')}</div>
        </div>;
    }

    // One Jagr Cup per title, each labelled with its season.
    function cupStack(team: FranchiseCard, className: string, sizes: string) {
        return [...team.championships].sort((x, y) => x - y).map(year => <JagrCupIcon key={year} title={`${seasonLabel(year)} Jagr Cup`} className={className} sizes={sizes} />);
    }

    function recordRow(label: string, left: number, right: number, leftText = String(left), rightText = String(right), cups = false) {
        return <tr>
            <td data-leader={left >= right && left > 0}>
                {leftText}
                {cups && <div className={styles.recordCups}>{cupStack(a, styles.recordCup, '60px')}</div>}
            </td>
            <th scope="row">{label}</th>
            <td data-leader={right >= left && right > 0}>
                {rightText}
                {cups && <div className={styles.recordCups}>{cupStack(b, styles.recordCup, '60px')}</div>}
            </td>
        </tr>;
    }

    const winRate = (team: FranchiseCard) => winPercentage({ wins: team.Wins, losses: team.Losses, ties: team.Ties });

    return <main className={styles.page} style={theme}>
        <CompareTabs active="teams" />
        <header className={styles.heading}>
            <h1>Rivalries<span>.</span></h1>
        </header>
        <div className="mb-5"><ShareButton card={teamComparisonShareCard(a, b, games, stage)} /></div>

        <div className={styles.selectors}>
            {selector('Team one', a, b, id => selectPair(id, b.ID), 'start')}
            <button type="button" className={styles.swap} onClick={() => selectPair(b.ID, a.ID)} aria-label="Swap teams"><FiRepeat aria-hidden="true" /></button>
            {selector('Team two', b, a, id => selectPair(a.ID, id), 'end')}
        </div>

        <section className={styles.scoreboard} aria-label={`${a.Team} versus ${b.Team}`}>
            <div className={styles.scoreTop}>
                <div className={styles.stageTabs} role="group" aria-label="Matchup type">
                    <button type="button" aria-pressed={stage === 'regular'} onClick={() => selectPair(a.ID, b.ID, 'regular')}>Regular season</button>
                    <button type="button" aria-pressed={stage === 'playoff'} onClick={() => selectPair(a.ID, b.ID, 'playoff')}>Playoffs</button>
                </div>
            </div>

            <div className={styles.arena}>
                <div className={styles.split} aria-hidden="true"><i /><i /><i /><i /></div>
                {teamSide(a, 'a')}
                <div className={styles.score} aria-live="polite" aria-atomic="true">
                    <span className={styles.eyebrow}>{stage === 'regular' ? 'Regular-season wins' : 'Playoff wins'}</span>
                    <div className={styles.numbers} style={{ '--win-digits': Math.max(2, String(summary.winsA).length, String(summary.winsB).length) } as CSSProperties}>
                        <strong data-leader={summary.winsA >= summary.winsB} aria-label={`${a.Abbreviation}: ${summary.winsA} wins`}>{Math.round(summary.winsA * ease)}</strong>
                        <span aria-hidden="true" />
                        <strong data-leader={summary.winsB >= summary.winsA} aria-label={`${b.Abbreviation}: ${summary.winsB} wins`}>{Math.round(summary.winsB * ease)}</strong>
                    </div>
                    <p>{meetingsLine}</p>
                </div>
                {teamSide(b, 'b')}
            </div>

            <div className={styles.tug}>
                <p><strong>{formatFpts(summary.pointsA * ease)}</strong><span>FPts vs {b.Abbreviation}</span></p>
                <div className={styles.tugBar} aria-hidden="true"><i style={{ width: `${shareA}%` }} /></div>
                <p><strong>{formatFpts(summary.pointsB * ease)}</strong><span>FPts vs {a.Abbreviation}</span></p>
            </div>
        </section>

        <section className={styles.card} aria-labelledby="head-to-head">
            <div className={styles.cardHeading}>
                <div className={styles.titleGroup}><h2 id="head-to-head">Head to head</h2></div>
            </div>

            {summary.meetings.length === 0 ? <p className={styles.empty}>{stage === 'regular' ? 'No regular-season meetings in the archive.' : 'These franchises have not met in the championship playoffs.'}</p> : <>
                <div className={styles.chart}>
                    <div className={styles.chartLegend}>
                        <span><i data-side="a" />{a.Abbreviation} wins above</span>
                        <span>{b.Abbreviation} wins below<i data-side="b" /></span>
                    </div>
                    <div className={styles.chartFrame}>
                        <div className={styles.axis} aria-hidden="true">
                            <span data-zero style={{ '--o': 0 } as CSSProperties}>0</span>
                            {ticks.map(tick => <Fragment key={tick}>
                                <span style={{ '--o': barLength(tick) } as CSSProperties}>{tick}</span>
                                <span data-dir="down" style={{ '--o': barLength(tick) } as CSSProperties}>{tick}</span>
                            </Fragment>)}
                        </div>
                        <div className={styles.chartArea} key={matchupKey} data-spotlight={spotlight !== null || undefined}>
                            <div className={styles.gridlines} aria-hidden="true">
                                {ticks.map(tick => <Fragment key={tick}>
                                    <i style={{ '--o': barLength(tick) } as CSSProperties} />
                                    <i data-dir="down" style={{ '--o': barLength(tick) } as CSSProperties} />
                                </Fragment>)}
                            </div>
                            {chartSeasons.map(({ year, games: seasonGames }) => <div key={year} className={styles.chartSeason} style={{ flexGrow: seasonGames.length }}>
                                <div className={styles.chartBars}>
                                    {seasonGames.map(game => {
                                        const index = chronological.indexOf(game);
                                        const scoreA = gameScore(game, a.ID), scoreB = gameScore(game, b.ID);
                                        const height = game.adjusted ? 10 : Math.max(4, Math.round(barLength(Math.abs(scoreA - scoreB))));
                                        const winner = game.winner === a.ID ? 'a' : game.winner === b.ID ? 'b' : null;
                                        const winnerTeam = winner === 'a' ? a : winner === 'b' ? b : null;
                                        const closest = game.id === summary.closest?.id;
                                        // Adjusted scores keep the recorded winner but have no real margin to report.
                                        const result = !winnerTeam ? 'Tied' : game.adjusted ? `${winnerTeam.Abbreviation} won · rescored` : `${winnerTeam.Abbreviation} by ${margin(game)}`;
                                        const position = index / Math.max(1, chronological.length - 1);
                                        return <span key={game.id} tabIndex={0} role="img" className={styles.bar}
                                            aria-label={`${seasonLabel(game.year)} · ${roundLabel(game)}: ${a.Abbreviation} ${formatFpts(scoreA)}, ${b.Abbreviation} ${formatFpts(scoreB)}. ${result}${closest ? '. Closest finish' : ''}`}
                                            data-final={isFinal(game) || undefined} data-closest={closest || undefined} data-active={game.id === spotlight || undefined} data-tip={winner === 'b' ? 'below' : 'above'}
                                            data-align={position < .12 ? 'start' : position > .88 ? 'end' : undefined}
                                            style={{ '--h': `${winner ? height : 3}px`, '--delay': `${index * 22}ms` } as CSSProperties}>
                                            <span>{winner !== 'b' && <i data-side={winner ?? 'tie'} />}</span>
                                            <span>{winner !== 'a' && <i data-side={winner ?? 'tie'} />}</span>
                                            {closest && <span className={styles.closestMark} aria-hidden="true">Closest</span>}
                                            <span className={styles.tip} aria-hidden="true">
                                                <span className={styles.tipMeta}>{seasonLabel(game.year)} · {roundLabel(game)}</span>
                                                {([[a, scoreA], [b, scoreB]] as const).map(([team, score]) => <span key={team.ID} className={styles.tipRow} data-winner={game.winner === team.ID}>
                                                    <span>{team.Abbreviation}</span><span>{formatFpts(score)}</span>
                                                </span>)}
                                                <span className={styles.tipFoot}>{closest ? `Closest finish · ${result}` : result}</span>
                                            </span>
                                        </span>;
                                    })}
                                </div>
                                <span className={styles.chartYear}>{seasonLabel(year)}</span>
                            </div>)}
                        </div>
                    </div>
                </div>

                <ol className={styles.games}>{(allGames ? summary.meetings : summary.meetings.slice(0, 8)).map(game => {
                    const leftName = game.away === a.ID ? game.awayName : game.homeName;
                    const rightName = game.away === b.ID ? game.awayName : game.homeName;
                    const tie = game.stage === 'regular' && game.winner === null;
                    const scoreA = gameScore(game, a.ID), scoreB = gameScore(game, b.ID);
                    return <li key={game.id} className={styles.game} data-final={isFinal(game) || undefined}
                        onMouseEnter={() => setSpotlight(game.id)} onMouseLeave={() => setSpotlight(null)} onFocus={() => setSpotlight(game.id)} onBlur={() => setSpotlight(null)}>
                        <div className={styles.gameMeta}>
                            <span>{isFinal(game) && <JagrCupIcon className={styles.gameCup} />}{seasonLabel(game.year)} · {roundLabel(game)}{tie ? ' · Tie' : ''}</span>
                            <Link href={teamSeasonHref(game.year, a.ID, game.stage === 'playoff' ? game.round : null)}>Season <FiArrowRight aria-hidden="true" /></Link>
                        </div>
                        <div className={styles.gameScore}>
                            <div><span title={leftName}>{a.Abbreviation}</span><strong data-winner={game.winner === a.ID}>{formatFpts(scoreA)}{game.winner === a.ID && <i aria-label="Winner">W</i>}</strong></div>
                            <span className={styles.versus}>{game.adjusted ? 'vs' : tie ? 'tied' : `by ${formatFpts(Math.abs(scoreA - scoreB))}`}</span>
                            <div><span title={rightName}>{b.Abbreviation}</span><strong data-winner={game.winner === b.ID}>{game.winner === b.ID && <i aria-label="Winner">W</i>}{formatFpts(scoreB)}</strong></div>
                        </div>
                        {(identityName(leftName) !== identityName(a.Team) || identityName(rightName) !== identityName(b.Team)) && <p className={styles.historicalNames}>{leftName} vs {rightName}</p>}
                        {game.note && <details className={styles.gameNote}><summary>Scoring note</summary><p>{game.note}</p></details>}
                    </li>;
                })}</ol>
                {summary.meetings.length > 8 && <button type="button" className={styles.more} aria-expanded={allGames} onClick={() => setAllGames(!allGames)}>{allGames ? 'Show fewer matchups' : `Show all ${summary.meetings.length} matchups`}</button>}
            </>}
        </section>

        <div className={styles.columns}>
            <section className={styles.card} aria-labelledby="franchise-records">
                <div className={styles.cardHeading}><div><h2 id="franchise-records">Franchise records</h2></div></div>
                <div className={styles.records}>
                    <table className={styles.recordTable} aria-labelledby="franchise-records">
                        <thead><tr>
                            <th scope="col"><span className={styles.recordTeam}><TeamBadge logo={a.LogoUrl} abbreviation={a.Abbreviation} teamName={a.Team} size={34} ring="none" /><span>{a.Abbreviation}</span></span></th>
                            <th scope="col"><span className="sr-only">Statistic</span></th>
                            <th scope="col"><span className={styles.recordTeam}><TeamBadge logo={b.LogoUrl} abbreviation={b.Abbreviation} teamName={b.Team} size={34} ring="none" /><span>{b.Abbreviation}</span></span></th>
                        </tr></thead>
                        <tbody>
                            {recordRow('Jagr Cups', a.championships.length, b.championships.length, undefined, undefined, true)}
                            {recordRow('Finals', a.finals.length, b.finals.length)}
                            {recordRow('Regular W–L–T', winRate(a), winRate(b), `${a.Wins}–${a.Losses}–${a.Ties}`, `${b.Wins}–${b.Losses}–${b.Ties}`)}
                            {recordRow('Win rate', winRate(a), winRate(b), `${winRate(a).toFixed(1)}%`, `${winRate(b).toFixed(1)}%`)}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className={styles.card} aria-labelledby="season-points">
                <div className={styles.cardHeading}><h2 id="season-points">Points by season</h2><span className={styles.caption}>Regular season</span></div>
                {sharedSeasons.length === 0 ? <p className={styles.empty}>No shared seasons.</p> : <>
                    <div className={styles.seasonHead}><span>{a.Abbreviation}</span><span>{b.Abbreviation}</span></div>
                    <ol className={styles.seasonRows}>{sharedSeasons.map(({ left, right }) => <li key={left.year}>
                        <span className={styles.seasonValue} data-leader={left.points > right.points}>{formatFpts(left.points)}</span>
                        <Link href={`/season/${left.year}`}>{seasonLabel(left.year)}</Link>
                        <span className={styles.seasonValue} data-leader={right.points > left.points}>{formatFpts(right.points)}</span>
                    </li>)}</ol>
                </>}
            </section>
        </div>

        <section className={styles.card} aria-labelledby="trading-history">
            <div className={styles.cardHeading}><div className={styles.titleGroup}><h2 id="trading-history">Trading history</h2><span>{exchanges.length} trade{exchanges.length === 1 ? '' : 's'}</span></div></div>
            {exchanges.length === 0 ? <p className={styles.empty}>No direct trades between these franchises in the archive.</p> : <>
                <div className={styles.tradeList}>{(allTrades ? exchanges : exchanges.slice(0, 3)).map(trade => {
                    const assets = directAssets(trade, a.ID, b.ID);
                    const multiTeam = new Set(trade.assets.flatMap(asset => [asset.from, asset.to]).filter(id => id !== null)).size > 2;
                    return <article key={trade.id} className={styles.trade}>
                        <div className={styles.tradeDate}><time dateTime={trade.date}>{shortDate(trade.date)}</time>{multiTeam && <span>Direct exchanges from a multi-team trade</span>}</div>
                        <div className={styles.tradeSides}>{[a, b].map(team => <div key={team.ID}>
                            <h3><TeamBadge logo={team.LogoUrl} abbreviation={team.Abbreviation} teamName={team.Team} size={20} ring="none" />{team.Abbreviation} received</h3>
                            <ul>{assets.filter(asset => asset.to === team.ID).map(asset => <li key={asset.id}>{asset.playerId ? <Link href={playerHref(asset.playerId)}>{asset.label}</Link> : asset.label}</li>)}</ul>
                            {!assets.some(asset => asset.to === team.ID) && <p className={styles.caption}>No assets received directly.</p>}
                        </div>)}</div>
                    </article>;
                })}</div>
                {exchanges.length > 3 && <button type="button" className={styles.more} aria-expanded={allTrades} onClick={() => setAllTrades(!allTrades)}>{allTrades ? 'Show fewer trades' : `Show all ${exchanges.length} trades`}</button>}
            </>}
        </section>
        <ExploreNext currentHref={href} links={[
            { href: `/teams/${a.ID}`, title: a.Team, reason: 'Explore the franchise archive' },
            { href: `/teams/${b.ID}`, title: b.Team, reason: 'Explore the opposing franchise' },
            recentSeason ? { href: `/season/${recentSeason}`, title: seasonLabel(recentSeason), reason: 'Their latest shared season in the archive' } : null,
        ]} />
    </main>;
}
