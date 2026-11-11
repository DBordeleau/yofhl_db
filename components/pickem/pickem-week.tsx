'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { readYourPickem, savePickemPick } from '@/app/pickem/actions';
import { useTeamBranding } from '@/components/team-branding/branding-provider';
import type { LeagueStanding, PickemFranchise, PickemMatchup, YourPickem } from '@/lib/pickem/create-pickem';
import { pairOf, pairOfMatchup } from '@/lib/pickem/model';
import { hasSessionHint } from '@/lib/owner/navigation';
import { clubColours, clubTone } from './club-tone';
import { announceEntry } from './entry-event';
import { Check } from './icons';
import { aimSeam, holdSeam, trackSeam, untrackSeam } from './seam';
import PickemEntryBar, { type EntryInvite } from './pickem-entry-bar';
import { burst } from './sparks';
import SideBody from './side-body';
import styles from './pickem.module.css';

interface Props {
    seasonYear: number;
    week: number;
    matchups: PickemMatchup[];
    /** a locked week shows its matchups only */
    locked?: boolean;
    /** when the week locks, for the compact clock the entry bar carries while docked on a phone */
    lock?: string;
    /** each club's league standing, by franchise id, while the week can be picked */
    leagueStandings?: Record<number, LeagueStanding> | null;
}

const keyOf = (pair: [number, number]) => pairOf(...pair).join('-');
type Side = 'away' | 'home';
// how long Undo stands in for Clear picks
const UNDO_FOR = 6000;

// The away side's share of the strip with the away club picked; the home club's pick mirrors it. pickem.module.css
// keeps each name's room for the narrowest share this leaves the other side (--narrowest), so keep the two in step.
const heldShare = () => window.innerWidth <= 640 ? .56 : .62;

/** Where a strip's seam sits: held toward the pick, leaning toward a hovered club, and pulled back a little by a hover
 *  on the other club of a pick, as if it might switch */
function seamTarget(pick: Side | undefined, hovered: Side | undefined) {
    if (!pick) return hovered === 'away' ? .535 : hovered === 'home' ? .465 : .5;
    const held = pick === 'away' ? heldShare() : 1 - heldShare();
    return hovered && hovered !== pick ? held + (pick === 'away' ? -.04 : .04) : held;
}

// The week's slate: a full-width strip per matchup, the two clubs' slabs sharing one slant. The seam between them rides a
// spring (seam.ts): hovering a club leans it that way, and calling a side drives it across. A call goes off like a goal
// light: the club's colour floods out from where it was tapped, sparks in its colours fly off the logo (sparks.ts), the
// strip jolts, a red lamp comes on along the side's top edge, the YOUR PICK slab stamps in and light sweeps across.
// Each side carries its club's W-L-T record and fantasy points from the league standings, and the stamp lands on that
// as a third slab, toward the seam. Tapping the pick again clears it. Picking every matchup plays the All-in bumper once.
// Someone who can't pick yet gets the entry bar empty with its way in (Sign in, or Claim your team); their sides stay
// tappable, and a tap stamps that way in rather than saving anything.
// The public page renders the matchups; the owner's own Pick'em picks load only when the session hint says an
// owner may be signed in (ADR 0003), so an anonymous visit makes no extra request.
export default function PickemWeek({ seasonYear, week, matchups, locked = false, lock, leagueStandings }: Props) {
    const palettes = useTeamBranding();
    const [yours, setYours] = useState<YourPickem | null>(null);
    const [picks, setPicks] = useState<Map<string, number>>(new Map());
    const [saving, setSaving] = useState<Set<string>>(new Set());
    // the picks the server has confirmed, which decide when the entry goes in or out
    const saved = useRef<Map<string, number>>(new Map());
    const [fresh, setFresh] = useState<string | null>(null);
    // a refused save, and where to fix it when that's another page (signing in, claiming a team)
    const [error, setError] = useState<{ message: string; fix?: string } | null>(null);
    // the picks Clear picks just took out, which Undo puts back for a few seconds
    const [undo, setUndo] = useState<Map<string, number> | null>(null);
    const undoTimer = useRef(0);
    const [bumper, setBumper] = useState(0);
    const [clearing, setClearing] = useState(false);
    // how many sides someone who can't pick yet has tapped, each one stamping the entry bar's way in
    const [nudges, setNudges] = useState(0);
    // where the latest call was tapped, for its flood; `id` restarts the flood on every call
    const [flood, setFlood] = useState<{ key: string; id: number; x: string; y: string } | null>(null);
    const slate = useRef<HTMLDivElement>(null);
    const hovered = useRef<Map<string, Side>>(new Map());

    const sideOf = (matchup: PickemMatchup, picked: number | undefined): Side | undefined =>
        picked === matchup.away.id ? 'away' : picked === matchup.home.id ? 'home' : undefined;
    const stripOf = (key: string) => slate.current?.querySelector<HTMLElement>(`[data-seam="${key}"]`) ?? null;

    // A save refreshes the page's data, which hands over equal matchups in a new array; keyed on the pairings, the
    // seams keep their springs through it instead of snapping back to the middle.
    const pairings = matchups.map(matchup => keyOf(pairOfMatchup(matchup))).join(' ');
    useEffect(() => {
        const strips = [...slate.current?.querySelectorAll<HTMLElement>('[data-seam]') ?? []];
        strips.forEach(trackSeam);
        return () => strips.forEach(untrackSeam);
    }, [pairings]);

    useEffect(() => {
        for (const matchup of matchups) {
            const key = keyOf(pairOfMatchup(matchup));
            const strip = stripOf(key);
            if (!strip) continue;
            const pick = sideOf(matchup, picks.get(key));
            holdSeam(strip, seamTarget(pick, undefined));
            aimSeam(strip, seamTarget(pick, hovered.current.get(key)));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pairings, picks]);

    useEffect(() => () => window.clearTimeout(undoTimer.current), []);

    function offerUndo(cleared: Map<string, number> | null) {
        window.clearTimeout(undoTimer.current);
        setUndo(cleared?.size ? cleared : null);
        if (cleared?.size) undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_FOR);
    }

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

    function lean(matchup: PickemMatchup, side: Side, event: PointerEvent, on: boolean) {
        if (event.pointerType !== 'mouse') return;
        const key = keyOf(pairOfMatchup(matchup));
        if (on) hovered.current.set(key, side);
        else if (hovered.current.get(key) === side) hovered.current.delete(key);
        const strip = stripOf(key);
        if (strip) aimSeam(strip, seamTarget(sideOf(matchup, picks.get(key)), hovered.current.get(key)));
    }

    /** The goal light: the flood from the tap, the strip's jolt and the sparks off the logo */
    function goalLight(key: string, franchise: PickemFranchise, side: Side, event: MouseEvent<HTMLButtonElement>) {
        const button = event.currentTarget;
        const box = button.getBoundingClientRect();
        // a keyboard press has no point, so it floods from the middle; a home side grows leftwards, so its flood is
        // pinned to its right edge to stay under the finger
        const x = event.detail ? event.clientX - box.left : box.width / 2;
        const y = event.detail ? event.clientY - box.top : box.height / 2;
        setFlood(current => ({ key, id: (current?.id ?? 0) + 1, x: side === 'home' ? `calc(100% - ${box.width - x}px)` : `${x}px`, y: `${y}px` }));
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const away = side === 'away' ? -1 : 1;
        stripOf(key)?.animate([
            { transform: 'none' },
            { transform: `translate(${away * 5}px, -3px) rotate(${away * .4}deg)`, offset: .2 },
            { transform: `translate(${away * -2.5}px, 1px)`, offset: .45 },
            { transform: `translate(${away}px, 0)`, offset: .7 },
            { transform: 'none' },
        ], { duration: 400, easing: 'cubic-bezier(.3, 1.4, .5, 1)' });
        const colours = clubColours(palettes, franchise.id);
        window.setTimeout(() => {
            const logo = button.querySelector(`.${styles.logo}`)?.getBoundingClientRect();
            if (logo) burst(logo.left + logo.width / 2, logo.top + logo.height / 2, [colours.primary, colours.secondary, '#ffffff', colours.tertiary], -away);
        }, 60);
    }

    async function choose(matchup: PickemMatchup, franchise: PickemFranchise, event: MouseEvent<HTMLButtonElement>) {
        const key = keyOf(pairOfMatchup(matchup));
        if (yours?.status === 'signed-out' || yours?.status === 'no-team') { setNudges(count => count + 1); return; }
        if (yours?.status !== 'entry' || saving.has(key) || clearing) return;
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
        // The call shows at once and is undone if the save is refused. A new call ends the chance to undo Clear picks.
        offerUndo(null);
        apply(picked);
        setFresh(picked === null ? null : key);
        if (picked !== null) goalLight(key, franchise, franchise.id === matchup.away.id ? 'away' : 'home', event);
        busy(true);
        setError(null);
        const result = await savePickemPick({ seasonYear, week, matchup: pairOfMatchup(matchup), picked })
            .catch(() => ({ error: "Could not save your Pick'em pick. Try again." }));
        busy(false);
        if ('error' in result) { apply(before); setFresh(null); setError({ message: result.error, fix: 'fix' in result ? result.fix : undefined }); return; }
        const wasIn = saved.current.size === matchups.length;
        if (picked === null) saved.current.delete(key); else saved.current.set(key, picked);
        const isIn = saved.current.size === matchups.length;
        if (isIn !== wasIn) announceEntry({ seasonYear, week, franchiseId: yours.franchiseId, in: isIn });
        if (isIn && !wasIn) setBumper(count => count + 1);
    }

    /** Clears every Pick'em pick of the week, one save at a time; a refused save stops it and shows what the server kept.
        What it took out can be put back with Undo for a few seconds. */
    async function clearAll() {
        if (yours?.status !== 'entry' || clearing) return;
        const picked = matchups.filter(matchup => picks.has(keyOf(pairOfMatchup(matchup))));
        if (!picked.length) return;
        const wasIn = saved.current.size === matchups.length;
        const cleared = new Map<string, number>();
        setClearing(true);
        setError(null);
        setFresh(null);
        setPicks(new Map());
        for (const matchup of picked) {
            const key = keyOf(pairOfMatchup(matchup));
            const result = await savePickemPick({ seasonYear, week, matchup: pairOfMatchup(matchup), picked: null })
                .catch(() => ({ error: "Could not clear your Pick'em picks. Try again." }));
            if ('error' in result) { setError({ message: result.error, fix: 'fix' in result ? result.fix : undefined }); break; }
            const was = saved.current.get(key);
            if (was !== undefined) cleared.set(key, was);
            saved.current.delete(key);
        }
        setPicks(new Map(saved.current));
        setClearing(false);
        offerUndo(cleared);
        if (wasIn && saved.current.size !== matchups.length) announceEntry({ seasonYear, week, franchiseId: yours.franchiseId, in: false });
    }

    /** Puts back the picks Clear picks took out, one save at a time; a refused save stops it and shows what the server kept */
    async function undoClear() {
        if (yours?.status !== 'entry' || clearing || !undo) return;
        const restoring = undo;
        offerUndo(null);
        const wasIn = saved.current.size === matchups.length;
        setClearing(true);
        setError(null);
        setPicks(new Map([...saved.current, ...restoring]));
        for (const matchup of matchups) {
            const key = keyOf(pairOfMatchup(matchup));
            const picked = restoring.get(key);
            if (picked === undefined) continue;
            const result = await savePickemPick({ seasonYear, week, matchup: pairOfMatchup(matchup), picked })
                .catch(() => ({ error: "Could not put your Pick'em picks back. Try again." }));
            if ('error' in result) { setError({ message: result.error, fix: 'fix' in result ? result.fix : undefined }); break; }
            saved.current.set(key, picked);
        }
        setPicks(new Map(saved.current));
        setClearing(false);
        const isIn = saved.current.size === matchups.length;
        if (isIn !== wasIn) announceEntry({ seasonYear, week, franchiseId: yours.franchiseId, in: isIn });
    }

    // Before anyone has played, every club is 0-0-0 with no points, which says nothing worth showing.
    const standings = leagueStandings && Object.values(leagueStandings).some(standing => standing.record !== '0-0-0' || standing.points !== 0)
        ? leagueStandings : null;
    const canPick = !locked && yours?.status === 'entry';
    const invite: EntryInvite | null = locked ? null
        : yours?.status === 'signed-out' ? { href: '/owner', label: 'Sign in', prompt: 'Sign in to call it', nudges }
        : yours?.status === 'no-team' ? { href: '/owner', label: 'Claim your team', prompt: 'Claim your team to call it', nudges }
        : null;
    // On a phone the slate head docks on top of the tab bar while the strips are on screen (pickem.module.css), so a
    // refused save is said there, under the thumb, rather than pushing the strips down.
    return <div ref={slate} className={styles.slate} data-pickem-slate="">
        <div className={styles.slateHead}>
            {error && <p role="alert" className={styles.alert}>
                {error.fix ? <Link href={error.fix}>{error.message}</Link> : error.message}
            </p>}
            {canPick && <PickemEntryBar picked={picks.size} total={matchups.length} clearing={clearing} onClear={() => void clearAll()}
                lock={lock} onUndo={undo ? () => void undoClear() : undefined} />}
            {invite && <PickemEntryBar picked={0} total={matchups.length} invite={invite} />}
            {/* the bumper's footing sits on a wrapper, since its own wipe would clip the shadow */}
            {bumper > 0 && <span key={bumper} className={styles.bumperFooting} aria-hidden="true">
                <span className={styles.bumper} onAnimationEnd={event => {
                    if (event.target === event.currentTarget) setBumper(0);
                }}>
                    <span className={styles.bumperRed} />
                    <span className={styles.bumperNavy} />
                    <span className={styles.bumperWords}><span>All in</span><span>Week {week}</span></span>
                    <span className={styles.bumperStripes} />
                </span>
            </span>}
        </div>
        <ol className={styles.strips}>
            {matchups.map((matchup, i) => {
                const key = keyOf(pairOfMatchup(matchup));
                const current = picks.get(key);
                const pick = sideOf(matchup, current);
                return <li key={key} className={styles.strip} data-seam={key} data-pick={pick} data-tape={standings ? '' : undefined} aria-busy={saving.has(key)}
                    style={{ '--i': i } as CSSProperties}>
                    {[matchup.away, matchup.home].flatMap((franchise, side) => {
                        const style = clubTone(clubColours(palettes, franchise.id));
                        const chosen = current === franchise.id;
                        const standing = standings?.[franchise.id];
                        const stamp = canPick && chosen;
                        // Always a button, disabled until we know who's looking: swapping element types when their picks
                        // load would remount the side and reload its logo.
                        const element = <button key={franchise.id} type="button" className={styles.side} style={style}
                            disabled={!canPick && !invite} aria-pressed={canPick ? chosen : undefined}
                            data-fresh={fresh === key && chosen ? '' : undefined} onClick={event => choose(matchup, franchise, event)}
                            onPointerEnter={canPick ? event => lean(matchup, side ? 'home' : 'away', event, true) : undefined}
                            onPointerLeave={canPick ? event => lean(matchup, side ? 'home' : 'away', event, false) : undefined}>
                            {stamp && fresh === key && flood?.key === key && <span key={flood.id} className={styles.flood} aria-hidden="true"
                                style={{ '--x': flood.x, '--y': flood.y } as CSSProperties} onAnimationEnd={() => setFlood(null)} />}
                            <SideBody franchise={franchise} standing={standing} holdRoom
                                tapeEnd={standing && stamp && <span className={styles.tapePick}><Check /><span>Your pick</span></span>}>
                                {/* Every pickable side holds the stamp's room, shown only on the pick, so calling a side never
                                    shoves its centred club upward (the pressed button already says which side is picked) */}
                                {!standing && canPick && <span className={styles.stamp} data-hidden={stamp ? undefined : ''} aria-hidden={stamp ? undefined : true}>
                                    <Check />Your pick
                                </span>}
                            </SideBody>
                        </button>;
                        return side === 0 ? [element, <span key="vs" className={styles.vs}><span>vs</span></span>] : element;
                    })}
                </li>;
            })}
        </ol>
    </div>;
}
