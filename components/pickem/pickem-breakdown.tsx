'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTeamBranding } from '@/components/team-branding/branding-provider';
import type { PickemEntry, PickemMatchupBreakdown, PickemPickOutcome } from '@/lib/pickem/create-pickem';
import { pairOf, pairOfMatchup } from '@/lib/pickem/model';
import { hasSessionHint } from '@/lib/owner/navigation';
import { clubColours, clubTone } from './club-tone';
import { announceOwner } from './entry-event';
import { Check } from './icons';
import { aimSeam, trackSeam, untrackSeam } from './seam';
import { burst } from './sparks';
import TeamBadge from '@/components/team-badge';
import { formatFpts } from '@/lib/league';
import SideBody from './side-body';
import { readYours, useEntranceHold } from './your-pickem';
import styles from './pickem.module.css';

// A locked week's breakdown: each matchup as the same club strip. The strips open level, then each seam springs toward
// the side more entries took (seam.ts), and the logos of the entries who took each side drop in underneath. The seam
// carries the matchup's scoreboard: the two clubs' head-to-head fantasy points either side of what they are, Live while
// the week is played, then Final (or Tie) once it is scored. Under each club's name sits its share of the Pick'em
// picks, then the entries who took it as one overlapping row of logo chips. Once scored, the winner's figure lights up
// red with a W on its outer edge, the loser's dims, and the finished loser fades slightly. A signed-in owner's own
// pick keeps the open week's red lamp
// along its top edge and is stamped with how it went: a call that came in goes off like the goal light again (the lamp
// flickers and sparks fly off the stamp), and a miss or a tie leaves the lamp dark. The owner's picks load only when
// the session hint says an owner may be signed in (ADR 0003); a week change holds the whole entrance until they are in
// (your-pickem.ts), so the owner's meter is there before the strips open rather than pushing them down. Nothing here
// can be picked.

const keyOf = (pair: [number, number]) => pairOf(...pair).join('-');
// `lead` is dropped on a phone, where the side is narrow and its lamp already says the pick is yours
const stamps: Record<PickemPickOutcome | 'pending', { lead?: string; label: string; tone?: 'red' | 'navy' }> = {
    correct: { label: 'Called it', tone: 'red' },
    wrong: { lead: 'Your pick · ', label: 'missed', tone: 'navy' },
    neither: { lead: 'Your pick · ', label: 'tied', tone: 'navy' },
    pending: { label: 'Your pick' },
};
// On a phone a side with this many pickers or more, and more than the other side, shows the first few and a +N slab;
// the side fewer owners took always shows everyone
const CROWD = 6;
const SHOWN = 4;

// How far a seam leans for a split: a unanimous matchup gives the side nobody took a little over a third of the strip
const LEAN = .16;
// When each strip's seam starts to move, and when the owner's called picks go off, after the strip opens
const revealAt = (i: number) => 350 + i * 90;
const celebrateAt = (i: number) => 1100 + i * 160;

const named = (entry: PickemEntry) => entry.owner ?? entry.franchise.name;

/** Fantasy points as the scoreboard sets them: whole points, then the hundredths smaller */
function Points({ value }: { value: number }) {
    const [whole, cents] = formatFpts(value).split('.');
    return <>{whole}{cents && <small>.{cents}</small>}</>;
}

interface Props {
    seasonYear: number;
    week: number;
    breakdown: PickemMatchupBreakdown[];
}

export default function PickemBreakdown({ seasonYear, week, breakdown }: Props) {
    const palettes = useTeamBranding();
    const [yours, setYours] = useState<Map<string, { picked: number; outcome?: PickemPickOutcome }>>(new Map());
    const [shared, setShared] = useState(false);
    const slate = useRef<HTMLDivElement>(null);
    const { held, release } = useEntranceHold(true);

    useEffect(() => {
        if (held) return;
        // the finished losers fade, once
        const frame = requestAnimationFrame(() => setShared(true));
        // each seam springs from level toward its split, a strip at a time
        const strips = [...slate.current?.querySelectorAll<HTMLElement>('[data-seam]') ?? []];
        strips.forEach(trackSeam);
        const timers = strips.map((strip, i) => window.setTimeout(() => aimSeam(strip, Number(strip.dataset.lean)), revealAt(i)));
        return () => { cancelAnimationFrame(frame); timers.forEach(clearTimeout); strips.forEach(untrackSeam); };
    }, [breakdown, held]);

    useEffect(() => {
        if (!hasSessionHint()) return;
        let cancelled = false;
        readYours(seasonYear, week).then(answer => {
            if (cancelled) return;
            release();
            if (answer?.status !== 'entry') return;
            announceOwner(answer.franchiseId);
            setYours(new Map(answer.picks.map(pick => [keyOf(pick.matchup), { picked: pick.picked, outcome: pick.outcome }] as const)));
        }).catch(() => { if (!cancelled) release(); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [seasonYear, week]);

    // every call that came in fires its sparks as its lamp flickers back on (the lamp's CSS delay matches celebrateAt)
    useEffect(() => {
        if (held) return;
        const timers = breakdown.flatMap(({ matchup }, i) => {
            const mine = yours.get(keyOf(pairOfMatchup(matchup)));
            if (mine?.outcome !== 'correct') return [];
            return [window.setTimeout(() => {
                const stamp = slate.current?.querySelector(`[data-called="${keyOf(pairOfMatchup(matchup))}"]`)?.getBoundingClientRect();
                const colours = clubColours(palettes, mine.picked);
                if (stamp) burst(stamp.left + stamp.width / 2, stamp.top + stamp.height / 2, [colours.primary, colours.secondary, '#ffffff', colours.tertiary], 0, 26);
            }, celebrateAt(i))];
        });
        return () => timers.forEach(clearTimeout);
    }, [yours, breakdown, palettes, held]);

    // The owner's week before the strips: the entry bar's meter in its next phase, a segment per matchup, lit for each
    // call that came in, hollow for a miss or a tie, filled faintly while the pick waits on its result.
    const mine = breakdown.map(({ matchup }) => yours.get(keyOf(pairOfMatchup(matchup))));
    const decided = mine.some(pick => pick?.outcome);
    const called = mine.filter(pick => pick?.outcome === 'correct').length;
    const picked = mine.filter(Boolean).length;
    return <div ref={slate} className={styles.slate} data-pickem-slate="" data-held={held ? '' : undefined}>
        {picked > 0 && <div className={styles.weekHead}>
            <div className={styles.entryBar}>
                <span className={styles.progressText}>
                    <b className={styles.count}>{decided ? called : picked}</b> of {breakdown.length} {decided ? 'called' : 'picked'}
                </span>
                <span className={styles.pips} aria-hidden="true">
                    {mine.map((pick, i) => <span key={i} className={styles.pip} data-on={pick?.outcome === 'correct' ? '' : undefined}
                        data-miss={pick?.outcome === 'wrong' || pick?.outcome === 'neither' ? '' : undefined}
                        data-pending={pick && !pick.outcome ? '' : undefined} style={{ '--d': `${i * 55}ms` } as CSSProperties} />)}
                </span>
            </div>
        </div>}
        <ol className={styles.strips}>
            {breakdown.map(({ matchup, away, home, result, scores }, i) => {
                const key = keyOf(pairOfMatchup(matchup));
                const mine = yours.get(key);
                const total = away.length + home.length;
                // whole percentages that add up to 100
                const awayShare = total ? Math.round(away.length / total * 100) : null;
                const shares = { away: awayShare, home: awayShare === null ? null : 100 - awayShare };
                const lean = awayShare === null ? .5 : .5 + (awayShare / 100 - .5) * LEAN * 2;
                const state = result === 'tie' ? 'Tie' : result ? 'Final' : scores ? 'Live' : 'vs';
                const outcomeOf = (side: 'away' | 'home') => result === side ? 'won' : result && result !== 'tie' ? 'lost' : undefined;
                const figure = (side: 'away' | 'home', value: number) => <span className={styles.scoreFigure} data-outcome={outcomeOf(side)}>
                    {side === 'away' && result === side && <span className={styles.scoreWin} aria-hidden="true">W</span>}
                    <span><Points value={value} /></span>
                    {side === 'home' && result === side && <span className={styles.scoreWin} aria-hidden="true">W</span>}
                </span>;
                const winner = result === 'away' ? matchup.away : result === 'home' ? matchup.home : null;
                // the seam element keeps the vs class: every home-side rule finds the home side as .side + .vs + .side
                const board = <span key="board" className={styles.vs} data-board="" data-settled={result ? '' : undefined}>
                    <span className={styles.scorebug}>
                        {scores && figure('away', scores.away)}
                        <span className={styles.scoreState}>{state}</span>
                        {scores && figure('home', scores.home)}
                    </span>
                    {scores && <span className="sr-only">: {matchup.away.name} {formatFpts(scores.away)}, {matchup.home.name} {formatFpts(scores.home)} fantasy points</span>}
                    {winner && <span className="sr-only">. {winner.name} won</span>}
                </span>;
                return <li key={key} className={styles.strip} data-locked="" data-seam={key} data-lean={lean} data-scored={scores ? '' : undefined}
                    style={{ '--i': i, '--narrow': Math.min(lean, 1 - lean) } as CSSProperties}>
                    {([['away', matchup.away, away], ['home', matchup.home, home]] as const).flatMap(([side, franchise, entries]) => {
                        const outcome = mine?.picked === franchise.id ? mine.outcome ?? 'pending' : null;
                        const stamp = outcome && stamps[outcome];
                        const share = shares[side];
                        const others = side === 'away' ? home : away;
                        const shown = entries.length >= CROWD && entries.length > others.length ? SHOWN : entries.length;
                        const element = <div key={franchise.id} className={styles.side}
                            data-lost={shared && result && result !== 'tie' && result !== side ? '' : undefined}
                            data-mine={outcome ?? undefined} style={clubTone(clubColours(palettes, franchise.id))}>
                            <span className={styles.sideTop}>
                                <SideBody franchise={franchise}>
                                    {share !== null && <span className={styles.predict}>
                                        <b>{share}%</b> picked
                                        <span className="sr-only"> {franchise.name} ({entries.length} of {total} Pick&apos;em picks)</span>
                                    </span>}
                                </SideBody>
                            </span>
                            {entries.length > 0 && <ul className={styles.pickers} aria-label={`Picked ${franchise.name}`}
                                style={{ '--all': entries.length, '--shown': shown < entries.length ? shown + 1 : entries.length } as CSSProperties}>
                                {entries.map((entry, j) => <li key={entry.franchise.id} className={styles.picker} title={named(entry)}
                                    data-extra={j >= shown ? '' : undefined}>
                                    <TeamBadge logo={entry.franchise.logo} abbreviation={entry.franchise.abbreviation} teamName={entry.franchise.name} size={26} />
                                    <span className="sr-only">{named(entry)}</span>
                                </li>)}
                                {shown < entries.length && <li className={`${styles.picker} ${styles.pickersMore}`} aria-hidden="true">
                                    +{entries.length - shown}
                                </li>}
                            </ul>}
                            {stamp && <span className={styles.stamp} data-tone={stamp.tone} data-called={outcome === 'correct' ? key : undefined}>
                                {stamp.tone === 'red' && <Check />}{stamp.lead && <span className={styles.stampLead}>{stamp.lead}</span>}{stamp.label}
                            </span>}
                        </div>;
                        return side === 'away' ? [element, board] : element;
                    })}
                </li>;
            })}
        </ol>
    </div>;
}
