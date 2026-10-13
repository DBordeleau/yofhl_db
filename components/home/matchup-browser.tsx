'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type CSSProperties } from 'react';
import TeamBadge from '@/components/team-badge';
import { useTeamBranding } from '@/components/team-branding/branding-provider';
import { fallbackColours, suggestedPalettes } from '@/lib/team-branding';
import { periodLabel, periodPhase, shortDate, type MatchupScores, type Period, type ScheduledMatchup, type SnapshotTeam } from '@/lib/fantrax/model';
import styles from './home.module.css';
import Arrow from '@/components/arrow';

type Team = Pick<SnapshotTeam, 'id' | 'franchiseId' | 'name' | 'abbreviation' | 'logo'>;
type Side = 'away' | 'home';
const SIDES = ['away', 'home'] as const;
const other = (side: Side): Side => side === 'away' ? 'home' : 'away';

export default function MatchupBrowser({ periods, selected, matchups, scores, teams, now, currentPeriod }: {
    periods: Period[]; selected: Period; matchups: ScheduledMatchup[]; scores: MatchupScores | null;
    teams: Team[]; now: number; currentPeriod: number;
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
    const round = `Round ${String(selected.number).padStart(2, '0')}`;
    const status = phase === 'upcoming' ? 'Upcoming' : phase === 'active' ? 'In progress' : 'Final';
    const colour = (team?: Team) => (team?.franchiseId ? palettes[team.franchiseId] ?? suggestedPalettes[team.franchiseId] : null)?.primary ?? fallbackColours.primary;

    // One shape for the ticker and the cards: who is playing, the score, and who is ahead.
    const games = matchups.map((matchup, matchIndex) => {
        const result = scores?.matchups.find(score => score.away.teamId === matchup.away.id && score.home.teamId === matchup.home.id);
        const scored = phase !== 'upcoming' && result ? result : null;
        const sides = Object.fromEntries(SIDES.map(side => {
            const team = teams.find(team => team.id === matchup[side].id);
            const name = team?.name ?? matchup[side].name ?? 'To be determined';
            return [side, { team, name, abbreviation: team?.abbreviation ?? 'TBD', colour: colour(team), score: scored?.[side].score ?? null, gamesPlayed: scored?.[side].gamesPlayed ?? null }];
        })) as Record<Side, { team?: Team; name: string; abbreviation: string; colour: string; score: number | null; gamesPlayed: number | null }>;
        const leader = scored && scored.away.score !== scored.home.score ? (scored.away.score > scored.home.score ? 'away' : 'home') as Side : null;
        const total = scored ? Math.max(scored.away.score, 0) + Math.max(scored.home.score, 0) : 0;
        return { id: `matchup-${matchIndex + 1}`, number: String(matchIndex + 1).padStart(2, '0'), sides, leader, scored, total };
    });

    // The ticker loops by sliding two identical copies; only the first is exposed to assistive tech.
    const tickerItems = (copy: number) => games.map((game, gameIndex) => <div role={copy ? undefined : 'listitem'} className={styles.tickerCell} key={`${copy}-${game.id}`}><a
        href={`#${game.id}`} className={styles.tickerItem} tabIndex={copy ? -1 : undefined}
        onMouseEnter={() => setSpotlight(gameIndex)} onMouseLeave={() => setSpotlight(null)}
        onFocus={() => setSpotlight(gameIndex)} onBlur={() => setSpotlight(null)}
        aria-label={copy ? undefined : SIDES.map(side => `${game.sides[side].name}${game.sides[side].score == null ? '' : ` ${game.sides[side].score!.toFixed(2)}`}`).join(phase === 'upcoming' ? ' at ' : ', ')}
    >
        {SIDES.map(side => {
            const team = game.sides[side];
            return <span key={side} className={styles.tickerTeam} data-leading={game.leader === side ? '' : undefined} data-trailing={game.leader === other(side) ? '' : undefined}>
                {side === 'home' && phase === 'upcoming' ? <span className={styles.tickerAt}>@</span> : null}
                <TeamBadge logo={team.team?.logo ?? null} teamName={team.name} abbreviation={team.abbreviation} size={24} ring="none" />
                <span className={styles.tickerAbbr}>{team.abbreviation}</span>
                {phase !== 'upcoming' ? <span className={styles.tickerScore}>{team.score == null ? '—' : team.score.toFixed(2)}</span> : null}
            </span>;
        })}
        {phase === 'upcoming' ? <span className={styles.tickerNote}>{shortDate(selected.startDate)}</span> : phase === 'complete' && game.scored ? <span className={styles.tickerNote}>Final</span> : null}
    </a></div>);

    return <section id="matchups" className={styles.matchupSection} aria-labelledby="matchup-heading" aria-busy={pending} tabIndex={-1}>
        <div className={styles.sectionHeading}>
            <h2 id="matchup-heading">Matchups</h2>
            <div className={styles.periodControls}>
                <button type="button" aria-label="Previous scoring period" disabled={index <= 0 || pending} onClick={() => navigate(periods[index - 1].number)}><Arrow direction="left" /></button>
                <label className="sr-only" htmlFor="scoring-period">Scoring period</label>
                <select id="scoring-period" value={selected.number} disabled={pending} onChange={event => navigate(Number(event.target.value))}>
                    {periods.map(period => <option value={period.number} key={period.number}>Round {String(period.number).padStart(2, '0')} · {periodLabel(period)}</option>)}
                </select>
                <button type="button" aria-label="Next scoring period" disabled={index >= periods.length - 1 || pending} onClick={() => navigate(periods[index + 1].number)}><Arrow /></button>
            </div>
        </div>

        {games.length > 0 ? <div className={styles.ticker} data-phase={phase} style={{ opacity: pending ? .55 : 1, '--ticker-duration': `${Math.max(games.length, 3) * 6.5}s` } as CSSProperties}>
            <div className={styles.tickerLabel}>
                <span className={styles.tickerBrand}>YOFHL</span>
                <span className={styles.tickerRound}><span>{round}</span><span className={styles.tickerStatus}>{phase === 'active' ? <span className={styles.liveDot} aria-hidden="true" /> : null}{status}</span></span>
            </div>
            <div className={styles.tickerViewport}>
                <div className={styles.tickerTrack}>
                    <div className={styles.tickerGroup} role="list" aria-label={`${round} scores`}>{tickerItems(0)}</div>
                    <div className={styles.tickerGroup} aria-hidden="true">{tickerItems(1)}</div>
                </div>
            </div>
        </div> : null}

        <div className={styles.matchupMeta}>
            <span>{pending ? 'Loading matchups…' : phase === 'upcoming' ? 'Upcoming' : phase === 'active' ? 'In progress' : 'Completed scoring period'}<span aria-hidden="true"> / </span>{periodLabel(selected)}</span>
            {selected.number !== currentPeriod ? <Link href={href(currentPeriod)} scroll={false}>{selected.number > currentPeriod && <Arrow direction="left" />} Back to current round {selected.number < currentPeriod && <Arrow />}</Link> : <span>All dates Eastern</span>}
        </div>
        <div className={styles.matchupGrid} style={{ opacity: pending ? .55 : 1 }}>
            {games.map((game, gameIndex) => {
                const leader = game.leader ? game.sides[game.leader] : null;
                const margin = game.scored ? Math.abs(game.scored.away.score - game.scored.home.score).toFixed(2) : null;
                const share = game.total > 0 ? Math.max(game.sides.away.score ?? 0, 0) / game.total * 100 : 50;
                return <article id={game.id} className={styles.scoreCard} data-phase={phase} data-spotlight={spotlight === gameIndex ? '' : undefined} key={`${selected.number}-${game.id}`}>
                    <div className={styles.scoreCardTop}>
                        <span>Match {game.number}</span>
                        <span className={styles.scoreStatus}>{phase === 'active' ? <span className={styles.liveDot} aria-hidden="true" /> : null}{phase === 'upcoming' ? shortDate(selected.startDate) : status}</span>
                    </div>
                    {SIDES.map(side => {
                        const team = game.sides[side];
                        const content = <><TeamBadge logo={team.team?.logo ?? null} teamName={team.name} abbreviation={team.abbreviation} size={40} ring="none" /><span className={styles.scoreTeamName}>{team.name}{team.gamesPlayed != null && <span className={styles.scoreGames}>{team.gamesPlayed} GP</span>}</span></>;
                        return <div className={styles.scoreRow} style={{ '--side-colour': team.colour } as CSSProperties} data-leading={game.leader === side ? '' : undefined} data-trailing={game.leader === other(side) ? '' : undefined} key={side}>
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
        {matchups.length === 0 ? <p className={styles.emptyState}>Matchups have not been announced for this round.</p> : idleTeams.length > 0 ? <p className={styles.idleTeams}>Not scheduled this round <span>{idleTeams.map(team => team.name).join(' · ')}</span></p> : null}
    </section>;
}
