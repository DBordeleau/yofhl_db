'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { createResultCache } from '@/lib/result-cache';
import TeamBadge from '@/components/team-badge';
import { periodLabel, periodPhase, shortDate, weekName, type MatchupScores, type Period, type ScheduledMatchup, type SnapshotTeam } from '@/lib/fantrax/model';
import { fantraxMatchupUrl } from '@/lib/fantrax/config';
import styles from './home.module.css';
import Arrow from '@/components/arrow';
import { broadcastType as matchupType } from './broadcast-type';
import { useTeamBranding } from '@/components/team-branding/branding-provider';
import { fallbackColours, suggestedPalettes } from '@/lib/team-branding';


// Exact names keep multiword places and nicknames together; renamed clubs use their full name.
const clubNames: Record<string, readonly [string, string]> = {
    'Carolina Reapers': ['Carolina', 'Reapers'],
    'West Texas Torteehaws': ['West Texas', 'Torteehaws'],
    'Hamhung Hall Monitors': ['Hamhung', 'Hall Monitors'],
    'The Lalibirdies': ['The', 'Lalibirdies'],
    'Paddyville Lucifers': ['Paddyville', 'Lucifers'],
    'Varrock Dark Wizards': ['Varrock', 'Dark Wizards'],
    'New Purrsey Devils': ['New Purrsey', 'Devils'],
    'Hooterville Honkers': ['Hooterville', 'Honkers'],
    'Skellige Sirens': ['Skellige', 'Sirens'],
    'Jagrtown Ice Fellas': ['Jagrtown', 'Ice Fellas'],
};

// YOFHL forward scoring (defencemen earn 6 and 4), used to put a lead in hockey terms
const GOAL_POINTS = 5;
const ASSIST_POINTS = 3;
const count = (value: number, noun: string) => `${value} ${noun}${value === 1 ? '' : 's'}`;

function LeadTip({ team, margin, final }: { team: string; margin: number; final: boolean }) {
    const lead = final ? <>{team} won by</> : <>That puts {team} up</>;
    if (margin < ASSIST_POINTS) return <span className={styles.scoreTip}>{lead} less than one assist.</span>;
    const goals = Math.max(1, Math.round(margin / GOAL_POINTS));
    const assists = Math.round(margin / ASSIST_POINTS);
    return <span className={styles.scoreTip}>{lead} about <span><b>{count(goals, 'goal')}</b> or <b>{count(assists, 'assist')}</b>.</span></span>;
}

// Scoreboard chase lights: each letter lights up in turn, then the label rests for a few seconds.
function ChaseLights({ text }: { text: string }) {
    return <><span className="sr-only">{text}</span><span className={styles.chase} aria-hidden="true">{[...text].map((letter, index) =>
        <span style={{ '--letter': index } as CSSProperties} key={index}>{letter === ' ' ? ' ' : letter}</span>)}</span></>;
}

type Team = Pick<SnapshotTeam, 'id' | 'franchiseId' | 'name' | 'abbreviation' | 'logo'>;
type Side = 'away' | 'home';
const SIDES = ['away', 'home'] as const;
const other = (side: Side): Side => side === 'away' ? 'home' : 'away';

type Dock = 'inline' | 'docked' | 'returning';

// On desktop the ticker catches at the top of the window as its slot scrolls past, then widens to the window's
// edges; scrolling back up shrinks it into the slot again. Each switch records where the bar was on screen
// (--from-*) so the new state animates out of the old one as a single moving bar. The slot keeps its height.
function useTickerDock(enabled: boolean) {
    const slot = useRef<HTMLDivElement>(null);
    const [dock, setDock] = useState<Dock>('inline');
    useEffect(() => {
        const element = slot.current;
        const ticker = element?.firstElementChild as HTMLElement | null;
        if (!enabled || !element || !ticker) return;
        const desktop = window.matchMedia('(min-width: 1024px)');
        let observer: IntersectionObserver | null = null;
        let docked = false;
        const from = (left: number, right: number, y: number) => {
            ticker.style.setProperty('--from-left', `${left}px`);
            ticker.style.setProperty('--from-right', `${right}px`);
            ticker.style.setProperty('--from-y', `${y}px`);
        };
        const watch = () => {
            observer?.disconnect();
            docked = false;
            setDock('inline');
            if (!desktop.matches) return;
            observer = new IntersectionObserver(([entry]) => {
                const rect = entry.boundingClientRect;
                const scrolledPast = rect.top < 0;
                if (scrolledPast === docked) return;
                docked = scrolledPast;
                const width = document.documentElement.clientWidth;
                // docking starts from the slot's spot (or just above the window if it is long gone);
                // returning starts from the full-width bar pinned at the top
                if (docked) from(rect.left, width - rect.right, Math.max(rect.top, -rect.height));
                else from(-rect.left, rect.right - width, -rect.top);
                setDock(docked ? 'docked' : 'returning');
            }, { threshold: [0, 1] });
            observer.observe(element);
        };
        watch();
        desktop.addEventListener('change', watch);
        return () => { observer?.disconnect(); desktop.removeEventListener('change', watch); };
    }, [enabled]);
    return { slot, dock };
}

type Week = { period: Period; matchups: ScheduledMatchup[]; scores: MatchupScores | null };
const phaseStatus = (phase: ReturnType<typeof periodPhase>) => phase === 'upcoming' ? 'Upcoming' : phase === 'active' ? 'In progress' : 'Final';

// The cards follow the week picked in the dropdown; the ticker always shows the current week.
export default function MatchupBrowser({ periods, seasonPeriods, schedule, current, teams, now }: {
    periods: Period[]; seasonPeriods: number[]; schedule: { period: number; matchupList: ScheduledMatchup[] }[];
    current: Week; teams: Team[]; now: number;
}) {
    const palettes = useTeamBranding();
    const [selectedNumber, setSelectedNumber] = useState(current.period.number);
    const selected = periods.find(period => period.number === selectedNumber) ?? current.period;
    const matchups = schedule.find(week => week.period === selected.number)?.matchupList ?? [];
    const [loaded, setLoaded] = useState({ period: current.period.number, scores: current.scores });
    const scores = loaded.period === selected.number ? loaded.scores : null;
    const [pending, setPending] = useState(false);
    const [failed, setFailed] = useState(false);
    const [retry, setRetry] = useState(0);
    const results = useMemo(() => {
        const cache = createResultCache<{ scores: MatchupScores | null }>();
        if (current.scores) cache.set(`/api/matchups?period=${current.period.number}`, { scores: current.scores });
        return cache;
    }, [current]);
    useEffect(() => {
        const readSelection = () => {
            const raw = new URLSearchParams(window.location.search).get('period') ?? '';
            const value = Number(raw);
            setSelectedNumber(/^\d+$/.test(raw) && periods.some(period => period.number === value) ? value : current.period.number);
        };
        readSelection();
        window.addEventListener('popstate', readSelection);
        return () => window.removeEventListener('popstate', readSelection);
    }, [periods, current.period.number]);
    useEffect(() => {
        const controller = new AbortController();
        setFailed(false);
        if (periodPhase(selected, now) === 'upcoming') {
            setLoaded({ period: selected.number, scores: null });
            setPending(false);
            return;
        }
        const url = `/api/matchups?period=${selected.number}`;
        const saved = results.get(url);
        setLoaded({ period: selected.number, scores: saved?.scores ?? null });
        setPending(!saved);
        results.load(url, controller.signal).then(value => {
            if (!controller.signal.aborted) setLoaded({ period: selected.number, scores: value.scores });
        }).catch(() => {
            if (!controller.signal.aborted) setFailed(true);
        }).finally(() => {
            if (!controller.signal.aborted) setPending(false);
        });
        return () => controller.abort();
    }, [selected, now, results, retry]);
    const [spotlight, setSpotlight] = useState<number | null>(null);
    const index = periods.findIndex(period => period.number === selected.number);
    const phase = periodPhase(selected, now);
    const playing = new Set(matchups.flatMap(matchup => [matchup.away.id, matchup.home.id]));
    const idleTeams = matchups.every(matchup => matchup.away.id && matchup.home.id) ? teams.filter(team => !playing.has(team.id)) : [];
    const href = (period: number) => `/?period=${period}#matchups`;
    const navigate = (period: number, event?: MouseEvent<HTMLAnchorElement>) => {
        if (event && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
        event?.preventDefault();
        const url = new URL(window.location.href);
        url.searchParams.set('period', String(period));
        url.hash = 'matchups';
        window.history.pushState(null, '', url);
        setSelectedNumber(period);
    };
    const currentPeriod = current.period.number;

    // One shape for the ticker and the cards: who is playing, the score, and who is ahead.
    const buildGames = (list: ScheduledMatchup[], results: MatchupScores | null, gamePhase: typeof phase) => list.map((matchup, matchIndex) => {
        const result = results?.matchups.find(score => score.away.teamId === matchup.away.id && score.home.teamId === matchup.home.id);
        const scored = gamePhase !== 'upcoming' && result ? result : null;
        const sides = Object.fromEntries(SIDES.map(side => {
            const team = teams.find(team => team.id === matchup[side].id);
            const name = team?.name ?? matchup[side].name ?? 'To be determined';
            return [side, { team, name, abbreviation: team?.abbreviation ?? 'TBD', score: scored?.[side].score ?? null, gamesPlayed: scored?.[side].gamesPlayed ?? null }];
        })) as Record<Side, { team?: Team; name: string; abbreviation: string; score: number | null; gamesPlayed: number | null }>;
        const leader = scored && scored.away.score !== scored.home.score ? (scored.away.score > scored.home.score ? 'away' : 'home') as Side : null;
        return { id: `matchup-${matchIndex + 1}`, matchup, sides, leader, scored };
    });
    const games = buildGames(matchups, scores, phase);
    const showingCurrent = selected.number === currentPeriod;
    const tickerPhase = periodPhase(current.period, now);
    const tickerGames = showingCurrent ? games : buildGames(current.matchups, current.scores, tickerPhase);
    const tickerWeek = weekName(currentPeriod, seasonPeriods);
    const { slot, dock } = useTickerDock(tickerGames.length > 0);

    // The ticker loops by sliding two identical copies; only the first is exposed to assistive tech.
    // Items point at the current week's cards, switching the dropdown back to the current week when needed.
    const tickerItems = (copy: number) => tickerGames.map((game, gameIndex) => <div role={copy ? undefined : 'listitem'} className={styles.tickerCell} key={`${copy}-${game.id}`}><a
        href={showingCurrent ? `#${game.id}` : href(currentPeriod)} className={styles.tickerItem} tabIndex={copy ? -1 : undefined}
        onClick={showingCurrent ? undefined : event => navigate(currentPeriod, event)}
        onMouseEnter={() => showingCurrent && setSpotlight(gameIndex)} onMouseLeave={() => setSpotlight(null)}
        onFocus={() => showingCurrent && setSpotlight(gameIndex)} onBlur={() => setSpotlight(null)}
        aria-label={copy ? undefined : SIDES.map(side => `${game.sides[side].name}${game.sides[side].score == null ? '' : ` ${game.sides[side].score!.toFixed(2)}`}`).join(' vs ')}
    >
        {SIDES.map(side => {
            const team = game.sides[side];
            // home mirrors away (score, name, logo) so both scores sit beside the VS badge
            return <Fragment key={side}>
                {side === 'home' ? <span className={styles.vsBadge} aria-hidden="true">VS</span> : null}
                <span className={styles.tickerTeam} data-side={side} data-leading={game.leader === side ? '' : undefined} data-trailing={game.leader === other(side) ? '' : undefined}>
                    <TeamBadge logo={team.team?.logo ?? null} teamName={team.name} abbreviation={team.abbreviation} size={30} sizeClass="h-6 w-6 3xl:h-[30px] 3xl:w-[30px]" ring="none" />
                    <span className={styles.tickerAbbr}>{team.abbreviation}</span>
                    {tickerPhase !== 'upcoming' ? <span className={styles.tickerScore}>{team.score == null ? '—' : team.score.toFixed(2)}</span> : null}
                </span>
            </Fragment>;
        })}
        {tickerPhase === 'upcoming' ? <span className={styles.tickerNote}>{shortDate(current.period.startDate)}</span> : tickerPhase === 'complete' && game.scored ? <span className={styles.tickerNote}>Final</span> : null}
    </a></div>);

    return <section id="matchups" className={styles.matchupSection} aria-labelledby="matchup-heading" aria-busy={pending} tabIndex={-1}>
        <div className={styles.sectionHeading}>
            <h2 id="matchup-heading">Matchups</h2>
        </div>

        {tickerGames.length > 0 ? <div ref={slot} className={styles.tickerSlot}><div className={styles.ticker} data-dock={dock} data-phase={tickerPhase} data-playoff={tickerWeek.playoff ? '' : undefined} style={{ '--ticker-duration': `${Math.max(tickerGames.length, 3) * 10}s` } as CSSProperties}>
            <div className={styles.tickerLabel}>
                <span className={styles.tickerBrand}>YOFHL</span>
                <span className={styles.tickerRound}><span>{tickerWeek.short}</span><span className={styles.tickerStatus}>{tickerPhase === 'active' ? <ChaseLights text={phaseStatus(tickerPhase)} /> : phaseStatus(tickerPhase)}</span></span>
            </div>
            <div className={styles.tickerViewport}>
                <div className={styles.tickerTrack}>
                    <div className={styles.tickerGroup} role="list" aria-label={`${tickerWeek.full} scores`}>{tickerItems(0)}</div>
                    <div className={styles.tickerGroup} aria-hidden="true">{tickerItems(1)}</div>
                </div>
            </div>
        </div></div> : null}

        <div className={styles.matchupMeta}>
            <div className={styles.periodControls}>
                <button type="button" aria-label="Previous week" disabled={index <= 0 || pending} onClick={() => navigate(periods[index - 1].number)}><Arrow direction="left" animated={false} /></button>
                <label className="sr-only" htmlFor="scoring-period">Week</label>
                <select id="scoring-period" value={selected.number} disabled={pending} onChange={event => navigate(Number(event.target.value))}>
                    {periods.map(period => <option value={period.number} key={period.number}>{weekName(period.number, seasonPeriods).full} · {periodLabel(period)}</option>)}
                </select>
                <button type="button" aria-label="Next week" disabled={index >= periods.length - 1 || pending} onClick={() => navigate(periods[index + 1].number)}><Arrow animated={false} /></button>
            </div>
            {selected.number !== currentPeriod ? <a href={href(currentPeriod)} onClick={event => navigate(currentPeriod, event)}>{selected.number > currentPeriod && <Arrow direction="left" />} Back to current week {selected.number < currentPeriod && <Arrow />}</a> : null}
        </div>
        {failed ? <p role="alert">Scores could not be loaded. <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></p> : null}
        <div className={styles.matchupGrid} style={{ opacity: pending ? .55 : 1 }}>
            {games.map((game, gameIndex) => {
                const leader = game.leader ? game.sides[game.leader] : null;
                const margin = game.scored ? Math.abs(game.scored.away.score - game.scored.home.score).toFixed(2) : null;
                const leading = (side: Side) => game.leader === side ? '' : undefined;
                const trailing = (side: Side) => game.leader === other(side) ? '' : undefined;
                const fantraxUrl = fantraxMatchupUrl(selected.number, game.matchup.away.id, game.matchup.home.id);
                const badgeLabel = phase === 'active' ? 'Live' : phase === 'complete' ? 'Final' : 'Preview';
                const badge = <span className={styles.scoreBadge}>{badgeLabel}</span>;
                // the meter splits the bar by each side's share of the points; the lit stretch past the centre line is the lead
                const total = game.scored ? game.scored.away.score + game.scored.home.score : 0;
                const awayShare = game.scored && total > 0 ? game.scored.away.score / total * 100 : 50;
                return <article id={game.id} aria-label={`${game.sides.away.name} vs ${game.sides.home.name}`} className={`${styles.scoreCard} ${matchupType.variable}`} data-phase={phase} data-spotlight={spotlight === gameIndex ? '' : undefined} key={`${selected.number}-${game.id}`}>
                    {/* the whole top bar is the Fantrax link: status on the left, destination on the right */}
                    {fantraxUrl ? <a href={fantraxUrl} className={styles.scoreCardTop} target="_blank" rel="noopener noreferrer" aria-label={`${badgeLabel}: ${game.sides.away.name} vs ${game.sides.home.name} on Fantrax (opens in a new tab)`}>
                        {badge}<span className={styles.scoreSource} aria-hidden="true">Fantrax<svg viewBox="0 0 16 16" fill="none"><path d="M4 12 12 4M4 4h8v8" stroke="currentColor" strokeWidth="1.75" /></svg></span>
                    </a> : <div className={styles.scoreCardTop}>{badge}</div>}
                    <div className={styles.scoreClubs}>{SIDES.map(side => {
                        const team = game.sides[side];
                        const [place, nickname] = clubNames[team.name] ?? ['', team.name];
                        const colours = team.team?.franchiseId ? palettes[team.team.franchiseId] ?? suggestedPalettes[team.team.franchiseId] ?? fallbackColours : fallbackColours;
                        const content = <><span className={styles.scoreArtworkStage} aria-hidden="true"><TeamBadge logo={team.team?.logo ?? null} abbreviation={team.abbreviation} teamName={null} size={180} sizeClass={styles.scoreArtwork} ring="glow" /></span><span className={styles.scoreTeamName} id={`${game.id}-${side}-name`}>{place && <span className={styles.scorePlace}>{place}</span>}<span className={styles.scoreNickname}>{nickname}</span></span></>;
                        const clubStyle = { '--score-club-colour': colours.primary } as CSSProperties;
                        return team.team?.franchiseId
                            ? <Link href={`/teams/${team.team.franchiseId}`} className={styles.scoreIdentity} style={clubStyle} data-leading={leading(side)} data-trailing={trailing(side)} key={side}>{content}</Link>
                            : <span className={styles.scoreIdentity} style={clubStyle} data-leading={leading(side)} data-trailing={trailing(side)} key={side}>{content}</span>;
                    })}</div>
                    <div className={styles.scoreDeck}>{SIDES.map(side => {
                        const team = game.sides[side];
                        return <div className={styles.scoreRow} data-leading={leading(side)} data-trailing={trailing(side)} key={side} role="group" aria-labelledby={`${game.id}-${side}-name`}>
                            <span className={styles.scoreValue} aria-label={phase === 'upcoming' ? 'Not started' : team.score == null ? 'Score unavailable' : `${team.score} fantasy points`}>{team.score == null ? '—' : team.score.toFixed(2)}</span>
                            {team.gamesPlayed != null && <span className={styles.scoreGames}>{team.gamesPlayed} games played</span>}
                        </div>;
                    })}</div>
                    {phase !== 'upcoming' && <div className={styles.scoreCardBottom}>
                        <p>{game.scored ? leader ? <><strong>{leader.abbreviation}</strong>{' '}<span className={styles.scoreResultVerb}>{phase === 'complete' ? 'won' : 'leads'} by</span>{' '}<strong className={styles.scoreMargin}>{margin}</strong></> : 'Tied'
                            : pending ? 'Loading scores…' : 'Scores unavailable'}</p>
                        {game.scored && <div className={styles.scoreMeter} data-leader={game.leader ?? undefined} aria-hidden="true" style={{ '--away-share': `${awayShare}%` } as CSSProperties}>
                            <span>{leader && <LeadTip team={leader.abbreviation} margin={Math.abs(game.scored.away.score - game.scored.home.score)} final={phase === 'complete'} />}</span>
                        </div>}
                    </div>}
                </article>;
            })}
        </div>
        {matchups.length === 0 ? <p className={styles.emptyState}>Matchups have not been announced for this week.</p> : idleTeams.length > 0 ? <p className={styles.idleTeams}>Not scheduled this week <span>{idleTeams.map(team => team.name).join(' · ')}</span></p> : null}
    </section>;
}
