'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { readYourPickem, savePickemPick } from '@/app/pickem/actions';
import { useTeamBranding } from '@/components/team-branding/branding-provider';
import type { PickemFranchise, PickemMatchup, YourPickem } from '@/lib/pickem/create-pickem';
import { pairOf, pairOfMatchup } from '@/lib/pickem/model';
import { hasSessionHint } from '@/lib/owner/navigation';
import { clubColours, clubTone } from './club-tone';
import { announceEntry } from './entry-event';
import { Check } from './icons';
import SideBody from './side-body';
import styles from './pickem.module.css';

interface Props {
    seasonYear: number;
    week: number;
    matchups: PickemMatchup[];
    /** a locked week shows its matchups only */
    locked?: boolean;
    /** each franchise's owner, by franchise id, when the page knows them */
    owners?: Record<number, string>;
    /** the slate's header line: a link to another week */
    link?: ReactNode;
}

const keyOf = (pair: [number, number]) => pairOf(...pair).join('-');

// The week's slate: a full-width strip per matchup, the two clubs' slabs sharing one slant. Tapping a side calls it:
// the side grows along the slant, a YOUR PICK stamp lands, the logo pops and light sweeps across once. Tapping the
// pick again clears it. Picking every matchup plays the All-in bumper once.
// The public page renders the matchups; the owner's own Pick'em picks load only when the session hint says an
// owner may be signed in (ADR 0003), so an anonymous visit makes no extra request.
export default function PickemWeek({ seasonYear, week, matchups, locked = false, owners, link }: Props) {
    const palettes = useTeamBranding();
    const [yours, setYours] = useState<YourPickem | null>(null);
    const [picks, setPicks] = useState<Map<string, number>>(new Map());
    const [saving, setSaving] = useState<Set<string>>(new Set());
    // the picks the server has confirmed, which decide when the entry goes in or out
    const saved = useRef<Map<string, number>>(new Map());
    const [fresh, setFresh] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [bumper, setBumper] = useState(0);

    useEffect(() => {
        if (locked) return;
        if (!hasSessionHint()) { setYours({ status: 'signed-out' }); return; }
        let cancelled = false;
        readYourPickem(seasonYear, week).then(answer => {
            if (cancelled) return;
            setYours(answer ?? { status: 'signed-out' });
            if (answer?.status !== 'entry') return;
            saved.current = new Map(answer.picks.map(pick => [keyOf(pick.matchup), pick.picked]));
            setPicks(new Map(saved.current));
        }).catch(() => { if (!cancelled) setYours({ status: 'signed-out' }); });
        return () => { cancelled = true; };
    }, [seasonYear, week, locked]);

    async function choose(matchup: PickemMatchup, franchise: PickemFranchise) {
        const key = keyOf(pairOfMatchup(matchup));
        if (yours?.status !== 'entry' || saving.has(key)) return;
        // Choosing the current pick again clears it.
        const before = picks.get(key);
        const picked = before === franchise.id ? null : franchise.id;
        const apply = (value: number | null | undefined) => setPicks(current => {
            const next = new Map(current);
            if (value === null || value === undefined) next.delete(key); else next.set(key, value);
            return next;
        });
        const busy = (on: boolean) => setSaving(current => {
            const next = new Set(current);
            if (on) next.add(key); else next.delete(key);
            return next;
        });
        // The call shows at once and is undone if the save is refused.
        apply(picked);
        setFresh(picked === null ? null : key);
        busy(true);
        setError(null);
        const result = await savePickemPick({ seasonYear, week, matchup: pairOfMatchup(matchup), picked })
            .catch(() => ({ error: "Could not save your Pick'em pick. Try again." }));
        busy(false);
        if ('error' in result) { apply(before); setFresh(null); setError(result.error); return; }
        const wasIn = saved.current.size === matchups.length;
        if (picked === null) saved.current.delete(key); else saved.current.set(key, picked);
        const isIn = saved.current.size === matchups.length;
        if (isIn !== wasIn) announceEntry({ seasonYear, week, franchiseId: yours.franchiseId, in: isIn });
        if (isIn && !wasIn) setBumper(count => count + 1);
    }

    const canPick = !locked && yours?.status === 'entry';
    const allIn = canPick && matchups.length > 0 && picks.size === matchups.length;
    return <div className={styles.slate}>
        <div className={styles.slateHead}>
            {canPick && (allIn
                ? <span className={styles.allIn}><Check />All in</span>
                : <span className={styles.progress}>
                    <span className={styles.pips} aria-hidden="true">
                        {matchups.map((matchup, i) => <span key={i} className={styles.pip} data-on={i < picks.size ? '' : undefined} />)}
                    </span>
                    <span className={styles.progressText}><b>{picks.size} of {matchups.length}</b> picked</span>
                </span>)}
            {yours?.status === 'signed-out' && <p className={styles.cta}>Sign in to call this week&apos;s matchups.
                <Link href="/owner" className={styles.ctaButton}>Sign in</Link></p>}
            {yours?.status === 'no-team' && <p className={styles.cta}>Claim your team to play Pick&apos;em.
                <Link href="/owner" className={styles.ctaButton}>Claim your team</Link></p>}
            {link}
            {bumper > 0 && <span key={bumper} className={styles.bumper} aria-hidden="true" onAnimationEnd={event => {
                if (event.target === event.currentTarget) setBumper(0);
            }}>
                <span className={styles.bumperRed} />
                <span className={styles.bumperNavy} />
                <span className={styles.bumperWords}><span>All in</span><span>Week {week}</span></span>
                <span className={styles.bumperStripes} />
            </span>}
        </div>
        {error && <p role="alert" className={styles.alert}>{error}</p>}
        <ol className={styles.strips}>
            {matchups.map((matchup, i) => {
                const key = keyOf(pairOfMatchup(matchup));
                const current = picks.get(key);
                const pick = current === matchup.away.id ? 'away' : current === matchup.home.id ? 'home' : undefined;
                return <li key={key} className={styles.strip} data-pick={pick} aria-busy={saving.has(key)}
                    style={{ '--i': i } as CSSProperties}>
                    {[matchup.away, matchup.home].flatMap((franchise, side) => {
                        const style = clubTone(clubColours(palettes, franchise.id));
                        const chosen = current === franchise.id;
                        const element = !canPick
                            ? <div key={franchise.id} className={styles.side} style={style}><SideBody franchise={franchise} owner={owners?.[franchise.id]} /></div>
                            : <button key={franchise.id} type="button" className={styles.side} style={style}
                                aria-pressed={chosen} data-fresh={fresh === key && chosen ? '' : undefined}
                                onClick={() => choose(matchup, franchise)}>
                                <SideBody franchise={franchise} owner={owners?.[franchise.id]}>
                                    {chosen && <span className={styles.stamp}><Check />Your pick</span>}
                                </SideBody>
                            </button>;
                        return side === 0 ? [element, <span key="vs" className={styles.vs}><span>vs</span></span>] : element;
                    })}
                </li>;
            })}
        </ol>
    </div>;
}
