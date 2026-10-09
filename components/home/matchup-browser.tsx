'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import TeamBadge from '@/components/team-badge';
import { periodLabel, periodPhase, shortDate, type MatchupScores, type Period, type ScheduledMatchup, type SnapshotTeam } from '@/lib/fantrax/model';
import styles from './home.module.css';
import Arrow from '@/components/arrow';

export default function MatchupBrowser({ periods, selected, matchups, scores, teams, now, currentPeriod }: {
    periods: Period[]; selected: Period; matchups: ScheduledMatchup[]; scores: MatchupScores | null;
    teams: Pick<SnapshotTeam, 'id' | 'franchiseId' | 'name' | 'abbreviation' | 'logo'>[]; now: number; currentPeriod: number;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const index = periods.findIndex(period => period.number === selected.number);
    const phase = periodPhase(selected, now);
    const playing = new Set(matchups.flatMap(matchup => [matchup.away.id, matchup.home.id]));
    const idleTeams = matchups.every(matchup => matchup.away.id && matchup.home.id) ? teams.filter(team => !playing.has(team.id)) : [];
    const href = (period: number) => `/?period=${period}#matchups`;
    const navigate = (period: number) => startTransition(() => router.push(href(period), { scroll: false }));

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
        <div className={styles.matchupMeta}>
            <span>{pending ? 'Loading matchups…' : phase === 'upcoming' ? 'Upcoming' : phase === 'active' ? 'In progress' : 'Completed scoring period'}<span aria-hidden="true"> / </span>{periodLabel(selected)}</span>
            {selected.number !== currentPeriod ? <Link href={href(currentPeriod)} scroll={false}>{selected.number > currentPeriod && <Arrow direction="left" />} Back to current round {selected.number < currentPeriod && <Arrow />}</Link> : <span>All dates Eastern</span>}
        </div>
        <div className={styles.matchupGrid} style={{ opacity: pending ? .55 : 1 }}>
            {matchups.map((matchup, matchIndex) => {
                const result = scores?.matchups.find(score => score.away.teamId === matchup.away.id && score.home.teamId === matchup.home.id);
                return <article className={styles.matchupCard} key={`${selected.number}-${matchIndex}`}>
                    <div className={styles.matchupCardTop}><span>Match {String(matchIndex + 1).padStart(2, '0')}</span><span>{phase === 'upcoming' ? 'Upcoming' : phase === 'complete' ? 'Result' : 'Daily snapshot'}</span></div>
                    {(['away', 'home'] as const).map(side => {
                        const team = teams.find(team => team.id === matchup[side].id);
                        const score = result?.[side].score;
                        const winner = phase === 'complete' && result && result[side].score > result[side === 'away' ? 'home' : 'away'].score;
                        const name = team?.name ?? matchup[side].name ?? 'To be determined';
                        const content = <><TeamBadge logo={team?.logo ?? null} teamName={name} abbreviation={team?.abbreviation ?? 'TBD'} size={38} ring="none" /><span className={styles.matchupTeamName}>{name}</span></>;
                        return <div className={`${styles.matchupTeam} ${winner ? styles.winningTeam : ''}`} key={side}>
                            {team?.franchiseId ? <Link href={`/teams/${team.franchiseId}`} className={styles.matchupIdentity}>{content}</Link> : <span className={styles.matchupIdentity}>{content}</span>}
                            <span className={styles.matchupScore} aria-label={phase === 'upcoming' ? 'Not started' : score == null ? 'Score unavailable' : `${score} fantasy points`}>{phase === 'upcoming' || score == null ? '—' : score.toFixed(2)}</span>
                        </div>;
                    })}
                    <div className={styles.matchupCardBottom}>{phase === 'upcoming' ? `Starts ${shortDate(selected.startDate)}` : result ? `${result.away.gamesPlayed} / ${result.home.gamesPlayed} player games played` : 'Scores temporarily unavailable'}</div>
                </article>;
            })}
        </div>
        {matchups.length === 0 ? <p className={styles.emptyState}>Matchups have not been announced for this round.</p> : idleTeams.length > 0 ? <p className={styles.idleTeams}>Not scheduled this round <span>{idleTeams.map(team => team.name).join(' · ')}</span></p> : null}
        {scores && phase !== 'upcoming' ? <p className={styles.sourceNote}>Scores as of {new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(scores.fetchedAt))} ET.</p> : null}
    </section>;
}
