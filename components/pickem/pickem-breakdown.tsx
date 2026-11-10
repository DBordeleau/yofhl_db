'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { readYourPickem } from '@/app/pickem/actions';
import { useTeamBranding } from '@/components/team-branding/branding-provider';
import type { PickemEntry, PickemMatchupBreakdown, PickemPickOutcome } from '@/lib/pickem/create-pickem';
import { pairOf, pairOfMatchup } from '@/lib/pickem/model';
import { hasSessionHint } from '@/lib/owner/navigation';
import { clubColours, clubTone } from './club-tone';
import { Check } from './icons';
import TeamBadge from '@/components/team-badge';
import SideBody from './side-body';
import styles from './pickem.module.css';

// A locked week's breakdown: each matchup as the same club strip, each side widened by its share of the Pick'em
// picks, with that share as a percentage at the seam and the logos of the entries who took it underneath. Once the week is scored it marks the side
// that won (the finished loser fades slightly) or the tie, and a signed-in owner's own pick is stamped with how it
// went. Those load only when the session hint says an owner may be signed in (ADR 0003). Nothing here can be picked.

const keyOf = (pair: [number, number]) => pairOf(...pair).join('-');
const stamps: Record<PickemPickOutcome | 'pending', { label: string; tone?: 'red' | 'navy' }> = {
    correct: { label: 'Called it', tone: 'red' },
    wrong: { label: 'Your pick · missed', tone: 'navy' },
    neither: { label: 'Your pick · tied', tone: 'navy' },
    pending: { label: 'Your pick' },
};

const named = (entry: PickemEntry) => entry.owner ?? entry.franchise.name;

interface Props {
    seasonYear: number;
    week: number;
    breakdown: PickemMatchupBreakdown[];
    /** each franchise's owner, by franchise id, when the page knows them */
    owners?: Record<number, string>;
}

export default function PickemBreakdown({ seasonYear, week, breakdown, owners }: Props) {
    const palettes = useTeamBranding();
    const [yours, setYours] = useState<Map<string, { picked: number; outcome?: PickemPickOutcome }>>(new Map());
    const [shared, setShared] = useState(false);

    useEffect(() => {
        // the sides start level and then lean to their share, once
        const frame = requestAnimationFrame(() => setShared(true));
        if (!hasSessionHint()) return () => cancelAnimationFrame(frame);
        let cancelled = false;
        readYourPickem(seasonYear, week).then(answer => {
            if (cancelled || answer?.status !== 'entry') return;
            setYours(new Map(answer.picks.map(pick => [keyOf(pick.matchup), { picked: pick.picked, outcome: pick.outcome }] as const)));
        }).catch(() => {});
        return () => { cancelled = true; cancelAnimationFrame(frame); };
    }, [seasonYear, week]);

    return <div className={styles.slate} data-pickem-slate="">
        <ol className={styles.strips}>
            {breakdown.map(({ matchup, away, home, result }, i) => {
                const mine = yours.get(keyOf(pairOfMatchup(matchup)));
                const total = away.length + home.length;
                // whole percentages that add up to 100
                const awayShare = total ? Math.round(away.length / total * 100) : null;
                const shares = { away: awayShare, home: awayShare === null ? null : 100 - awayShare };
                return <li key={`${matchup.away.id}-${matchup.home.id}`} className={styles.strip} data-locked="" style={{ '--i': i } as CSSProperties}>
                    {([['away', matchup.away, away], ['home', matchup.home, home]] as const).flatMap(([side, franchise, entries]) => {
                        const stamp = mine?.picked === franchise.id ? stamps[mine.outcome ?? 'pending'] : null;
                        const lean = shared && total > 0 ? 1 + entries.length / total * .8 : 1;
                        const element = <div key={franchise.id} className={styles.side} data-lost={result && result !== 'tie' && result !== side ? '' : undefined}
                            style={{ ...clubTone(clubColours(palettes, franchise.id)), flexGrow: lean }}>
                            <span className={styles.sideTop}>
                                <SideBody franchise={franchise} owner={owners?.[franchise.id]} />
                                <span className={styles.share}>
                                    {shares[side] === null ? '–' : <>{shares[side]}<small>%</small></>}
                                    <span className="sr-only"> of Pick&apos;em picks, {entries.length} of {total}</span>
                                </span>
                            </span>
                            {result === side && <span className={styles.won}>Won</span>}
                            {entries.length > 0 && <ul className={styles.pickers} aria-label={`Picked ${franchise.name}`}>
                                {entries.map(entry => <li key={entry.franchise.id} className={styles.picker} title={named(entry)}>
                                    <TeamBadge logo={entry.franchise.logo} abbreviation={entry.franchise.abbreviation} teamName={entry.franchise.name} size={26} />
                                    <span className="sr-only">{named(entry)}</span>
                                </li>)}
                            </ul>}
                            {stamp && <span className={styles.stamp} data-tone={stamp.tone}>{stamp.tone === 'red' && <Check />}{stamp.label}</span>}
                        </div>;
                        return side === 'away'
                            ? [element, <span key="vs" className={styles.vs} data-tie={result === 'tie' ? '' : undefined}><span>{result === 'tie' ? 'Tie' : 'vs'}</span></span>]
                            : element;
                    })}
                </li>;
            })}
        </ol>
    </div>;
}
