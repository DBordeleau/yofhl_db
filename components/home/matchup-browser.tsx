'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useRef, useState, useTransition, type CSSProperties } from 'react';
import TeamBadge from '@/components/team-badge';
import { useTeamBranding } from '@/components/team-branding/branding-provider';
import { fallbackColours, suggestedPalettes } from '@/lib/team-branding';
import { periodLabel, periodPhase, shortDate, weekName, type MatchupScores, type Period, type ScheduledMatchup, type SnapshotTeam } from '@/lib/fantrax/model';
import styles from './home.module.css';
import Arrow from '@/components/arrow';

type Team = Pick<SnapshotTeam, 'id' | 'franchiseId' | 'name' | 'abbreviation' | 'logo'>;
type Side = 'away' | 'home';
const SIDES = ['away', 'home'] as const;
const other = (side: Side): Side => side === 'away' ? 'home' : 'away';

type Dock = 'inline' | 'docked' | 'undocking' | 'returning';

// On desktop the ticker docks to the top of the window once its slot scrolls out of view, and slides
// back into the page when the slot returns. The slot keeps its height, so the layout never jumps.
function useTickerDock(enabled: boolean) {
    const slot = useRef<HTMLDivElement>(null);
    const [dock, setDock] = useState<Dock>('inline');
    useEffect(() => {
        const element = slot.current;
        if (!enabled || !element) return;
        const desktop = window.matchMedia('(min-width: 1024px)');
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        let observer: IntersectionObserver | null = null;
        const watch = () => {
            observer?.disconnect();
            setDock('inline');
            if (!desktop.matches) return;
            observer = new IntersectionObserver(([entry]) => {
                const scrolledPast = !entry.isIntersecting && entry.boundingClientRect.top < 0;
                setDock(current => scrolledPast ? 'docked' : current === 'docked' ? (reducedMotion.matches ? 'inline' : 'undocking') : current);
            });
            observer.observe(element);
        };
        watch();
        desktop.addEventListener('change', watch);
        return () => { observer?.disconnect(); desktop.removeEventListener('change', watch); };
    }, [enabled]);
    const settle = () => setDock(current => current === 'undocking' ? 'returning' : current === 'returning' ? 'inline' : current);
    return { slot, dock, settle };
}

type Week = { period: Period; matchups: ScheduledMatchup[]; scores: MatchupScores | null };
const phaseStatus = (phase: ReturnType<typeof periodPhase>) => phase === 'upcoming' ? 'Upcoming' : phase === 'active' ? 'In progress' : 'Final';

// The cards follow the week picked in the dropdown; the ticker always shows the current week.
export default function MatchupBrowser({ periods, seasonPeriods, selected, matchups, scores, current, teams, now }: {
    periods: Period[]; seasonPeriods: number[]; selected: Period; matchups: ScheduledMatchup[]; scores: MatchupScores | null;
    current: Week; teams: Team[]; now: number;
}) {
    const router = useRouter();
    const palettes = useTeamBranding();
    const [pending, startTransition] = useTransition();
    const [spotlight, setSpotlight] = useState<number | null>(null);
    const index = periods.findIndex(period => period.number === selected.number);
    const phase = periodPhase(selected, now);
    const playing = new Set(matchups.flatMap(matchup => [matchup.away.id, matchup.home.id]));
    const idleTeams = matchups.every(matchup => matchup.away.id && matchup.home.id) ? teams.filter(team => !playing.has(team.id)) : [];
    const href = (period: number) => `/?period=${period}#matchups`;
    const navigate = (period: number) => startTransition(() => router.push(href(period), { scroll: false }));
    const currentPeriod = current.period.number;
    const colour = (team?: Team) => (team?.franchiseId ? palettes[team.franchiseId] ?? suggestedPalettes[team.franchiseId] : null)?.primary ?? fallbackColours.primary;

    // One shape for the ticker and the cards: who is playing, the score, and who is ahead.
    const buildGames = (list: ScheduledMatchup[], results: MatchupScores | null, gamePhase: typeof phase) => list.map((matchup, matchIndex) => {
        const result = results?.matchups.find(score => score.away.teamId === matchup.away.id && score.home.teamId === matchup.home.id);
        const scored = gamePhase !== 'upcoming' && result ? result : null;
        const sides = Object.fromEntries(SIDES.map(side => {
            const team = teams.find(team => team.id === matchup[side].id);
            const name = team?.name ?? matchup[side].name ?? 'To be determined';
            return [side, { team, name, abbreviation: team?.abbreviation ?? 'TBD', colour: colour(team), score: scored?.[side].score ?? null, gamesPlayed: scored?.[side].gamesPlayed ?? null }];
        })) as Record<Side, { team?: Team; name: string; abbreviation: string; colour: string; score: number | null; gamesPlayed: number | null }>;
        const leader = scored && scored.away.score !== scored.home.score ? (scored.away.score > scored.home.score ? 'away' : 'home') as Side : null;
        const total = scored ? Math.max(scored.away.score, 0) + Math.max(scored.home.score, 0) : 0;
        return { id: `matchup-${matchIndex + 1}`, number: String(matchIndex + 1).padStart(2, '0'), sides, leader, scored, total };
    });
    const games = buildGames(matchups, scores, phase);
    const showingCurrent = selected.number === currentPeriod;
    const tickerPhase = periodPhase(current.period, now);
    const tickerGames = showingCurrent ? games : buildGames(current.matchups, current.scores, tickerPhase);
    const tickerWeek = weekName(currentPeriod, seasonPeriods);
    const { slot, dock, settle } = useTickerDock(tickerGames.length > 0);

    // The ticker loops by sliding two identical copies; only the first is exposed to assistive tech.
    // Items point at the current week's cards, switching the dropdown back to the current week when needed.
    const tickerItems = (copy: number) => tickerGames.map((game, gameIndex) => <div role={copy ? undefined : 'listitem'} className={styles.tickerCell} key={`${copy}-${game.id}`}><a
        href={showingCurrent ? `#${game.id}` : href(currentPeriod)} className={styles.tickerItem} tabIndex={copy ? -1 : undefined}
        onClick={showingCurrent ? undefined : event => { event.preventDefault(); navigate(currentPeriod); }}
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
                    <TeamBadge logo={team.team?.logo ?? null} teamName={team.name} abbreviation={team.abbreviation} size={24} ring="none" />
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
            <div className={styles.periodControls}>
                <button type="button" aria-label="Previous week" disabled={index <= 0 || pending} onClick={() => navigate(periods[index - 1].number)}><Arrow direction="left" /></button>
                <label className="sr-only" htmlFor="scoring-period">Week</label>
                <select id="scoring-period" value={selected.number} disabled={pending} onChange={event => navigate(Number(event.target.value))}>
                    {periods.map(period => <option value={period.number} key={period.number}>{weekName(period.number, seasonPeriods).full} · {periodLabel(period)}</option>)}
                </select>
                <button type="button" aria-label="Next week" disabled={index >= periods.length - 1 || pending} onClick={() => navigate(periods[index + 1].number)}><Arrow /></button>
            </div>
        </div>

        {tickerGames.length > 0 ? <div ref={slot} className={styles.tickerSlot}><div className={styles.ticker} data-dock={dock} onAnimationEnd={event => event.target === event.currentTarget && settle()} data-phase={tickerPhase} data-playoff={tickerWeek.playoff ? '' : undefined} style={{ '--ticker-duration': `${Math.max(tickerGames.length, 3) * 6.5}s` } as CSSProperties}>
            <div className={styles.tickerLabel}>
                <span className={styles.tickerBrand}>YOFHL</span>
                <span className={styles.tickerRound}><span>{tickerWeek.short}</span><span className={styles.tickerStatus}>{tickerPhase === 'active' ? <span className={styles.liveDot} aria-hidden="true" /> : null}{phaseStatus(tickerPhase)}</span></span>
            </div>
            <div className={styles.tickerViewport}>
                <div className={styles.tickerTrack}>
                    <div className={styles.tickerGroup} role="list" aria-label={`${tickerWeek.full} scores`}>{tickerItems(0)}</div>
                    <div className={styles.tickerGroup} aria-hidden="true">{tickerItems(1)}</div>
                </div>
            </div>
        </div></div> : null}

        <div className={styles.matchupMeta}>
            <span>{pending ? 'Loading matchups…' : periodLabel(selected)}</span>
            {selected.number !== currentPeriod ? <Link href={href(currentPeriod)} scroll={false}>{selected.number > currentPeriod && <Arrow direction="left" />} Back to current week {selected.number < currentPeriod && <Arrow />}</Link> : null}
        </div>
        <div className={styles.matchupGrid} style={{ opacity: pending ? .55 : 1 }}>
            {games.map((game, gameIndex) => {
                const leader = game.leader ? game.sides[game.leader] : null;
                const margin = game.scored ? Math.abs(game.scored.away.score - game.scored.home.score).toFixed(2) : null;
                const share = game.total > 0 ? Math.max(game.sides.away.score ?? 0, 0) / game.total * 100 : 50;
                return <article id={game.id} className={styles.scoreCard} data-phase={phase} data-spotlight={spotlight === gameIndex ? '' : undefined} key={`${selected.number}-${game.id}`}>
                    <div className={styles.scoreCardTop}>
                        <span>Match {game.number}</span>
                        {phase !== 'active' ? <span className={styles.scoreStatus}>{phase === 'upcoming' ? shortDate(selected.startDate) : 'Final'}</span> : null}
                    </div>
                    {SIDES.map(side => {
                        const team = game.sides[side];
                        const content = <><TeamBadge logo={team.team?.logo ?? null} teamName={team.name} abbreviation={team.abbreviation} size={40} ring="none" /><span className={styles.scoreTeamName}>{team.name}{team.gamesPlayed != null && <span className={styles.scoreGames}>{team.gamesPlayed} GP</span>}</span></>;
                        return <div className={styles.scoreRow} data-leading={game.leader === side ? '' : undefined} data-trailing={game.leader === other(side) ? '' : undefined} key={side}>
                            {team.team?.franchiseId ? <Link href={`/teams/${team.team.franchiseId}`} className={styles.scoreIdentity}>{content}</Link> : <span className={styles.scoreIdentity}>{content}</span>}
                            <span className={styles.scoreValue} aria-label={phase === 'upcoming' ? 'Not started' : team.score == null ? 'Score unavailable' : `${team.score} fantasy points`}>{team.score == null ? '—' : team.score.toFixed(2)}</span>
                        </div>;
                    })}
                    <div className={styles.scoreCardBottom}>
                        {game.scored ? <>
                            <div className={styles.scoreShare} aria-hidden="true"><span style={{ width: `${share}%`, background: game.sides.away.colour }} /><span style={{ background: game.sides.home.colour }} /></div>
                            <p>{leader ? <><strong>{leader.abbreviation}</strong> {phase === 'complete' ? 'won' : 'leads'} by {margin}</> : phase === 'complete' ? 'Tied' : 'All square'}</p>
                        </> : <p>{phase === 'upcoming' ? `Puck drops ${shortDate(selected.startDate)}` : 'Scores temporarily unavailable'}</p>}
                    </div>
                </article>;
            })}
        </div>
        {matchups.length === 0 ? <p className={styles.emptyState}>Matchups have not been announced for this week.</p> : idleTeams.length > 0 ? <p className={styles.idleTeams}>Not scheduled this week <span>{idleTeams.map(team => team.name).join(' · ')}</span></p> : null}
    </section>;
}
