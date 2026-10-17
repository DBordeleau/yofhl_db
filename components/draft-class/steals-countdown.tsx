'use client';

import { playerHref } from '@/lib/player-url';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import ShareButton from '@/components/share/share-button';
import TeamBadge from '@/components/team-badge';
import type { RankedPick } from '@/lib/draft/hindsight';
import { formatFpts, splitPositions } from '@/lib/league';
import { stealShareCard } from '@/lib/share/model';
import { climbScale, firstName, lastName } from './board';
import styles from './draft-class.module.css';

// out: old number slides away · pre: new number parked on the far side with transitions off
// in: number lands · reveal: player details stagger in and the climb meter rises
type Phase = 'out' | 'pre' | 'in' | 'reveal';

const Chevron = ({ left }: { left?: boolean }) => <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d={left ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} /></svg>;

// Top-10 style countdown of the draft's biggest climbs, starting from the last entry.
export default function StealsCountdown({ year, steals, totalPicks, rounds }: { year: number; steals: RankedPick[]; totalPicks: number; rounds: number }) {
    const last = steals.length - 1;
    const [index, setIndex] = useState(last);
    const [phase, setPhase] = useState<Phase>('in');
    const [dir, setDir] = useState(1);
    // tiles stay masked until their entry has been revealed in the stage
    const [revealed, setRevealed] = useState<number[]>([]);
    const reveal = (i: number) => { setPhase('reveal'); setRevealed(seen => seen.includes(i) ? seen : [...seen, i]); };
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const nameRef = useRef<HTMLAnchorElement>(null);
    const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
    const touch = useRef<{ x: number; y: number } | null>(null);

    // the opening entry animates in on load, same as stepping to a new one
    useEffect(() => {
        const pending = timers.current;
        pending.push(setTimeout(() => reveal(last), 350));
        return () => pending.forEach(clearTimeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once for the opening entry
    }, []);

    function go(next: number) {
        if (next === index || next < 0 || next > last) return;
        timers.current.forEach(clearTimeout);
        timers.current = [];
        setDir(next < index ? 1 : -1);
        setPhase('out');
        later(200, () => { setIndex(next); setPhase('pre'); });
        later(240, () => setPhase('in'));
        later(720, () => reveal(next));
    }

    // the countdown runs from the last entry toward #1, so the highest unrevealed entry is up next
    const upNext = Math.max(-1, ...steals.map((_, i) => i).filter(i => !revealed.includes(i)));
    const star = steals[index];
    useEffect(() => {
        const name = nameRef.current;
        if (!name) return;
        let active = true;
        const fitName = () => {
            if (!active) return;
            name.style.fontSize = '';
            const width = name.clientWidth;
            const textWidth = name.scrollWidth;
            if (width > 0 && textWidth > width) {
                name.style.fontSize = `${Math.floor(parseFloat(getComputedStyle(name).fontSize) * width / textWidth)}px`;
            }
        };
        fitName();
        const observer = new ResizeObserver(fitName);
        observer.observe(name);
        document.fonts.ready.then(fitName);
        return () => { active = false; observer.disconnect(); };
    }, [star.player]);

    const scale = climbScale(star.rank, star.overall, totalPicks);
    const position = (slot: number) => `${((slot - scale.start) / scale.span) * 100}%`;
    const meter = {
        '--draft': position(star.overall), '--finish': position(star.rank), '--mid': position((star.overall + star.rank) / 2),
        '--rounds': scale.zoomed ? 3 : rounds, '--dir': dir,
    } as React.CSSProperties;
    const delay = (seconds: number) => ({ '--delay': `${seconds}s` } as React.CSSProperties);

    return <section aria-labelledby="steals-heading" className={styles.countdown}>
        <div className={styles.cdBar}>
            <span className={styles.cdBrand}>TOP {steals.length}</span>
            <h3 id="steals-heading" className={styles.cdTitle}><span className={styles.titleLong}>Steals of the draft</span><span className={styles.titleShort}>Steals</span></h3>
            <div className={styles.cdControls}>
                <ShareButton card={stealShareCard(year, star, index + 1, steals.length, totalPicks, rounds)} title={`Share steal #${index + 1}`} dark compact />
                <button type="button" className={styles.arrow} aria-label="Previous steal" disabled={index === last} onClick={() => go(index + 1)}><Chevron left /></button>
                <button type="button" className={styles.arrow} aria-label="Next steal" disabled={index === 0} onClick={() => go(index - 1)}><Chevron /></button>
            </div>
        </div>

        {/* on touch screens a sideways swipe steps through the countdown like the arrows */}
        <div className={styles.stage} data-phase={phase} data-show={phase === 'reveal' ? '' : undefined} style={meter}
            onTouchStart={event => { touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }}
            onTouchEnd={event => {
                const start = touch.current;
                touch.current = null;
                if (!start) return;
                const dx = event.changedTouches[0].clientX - start.x;
                if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(event.changedTouches[0].clientY - start.y) * 1.5) go(dx < 0 ? index - 1 : index + 1);
            }}>
            <div className={styles.cdNumWrap} aria-hidden="true">
                <div className={styles.stripes}><span /><span /><span /></div>
                <div className={styles.cdNumber}>{index + 1}</div>
            </div>

            <div className={styles.cdPlayer} aria-live="polite">
                <span className="sr-only">Number {index + 1}: {star.player}</span>
                <div className={styles.cdTeamRow}>
                    <span className={styles.rvLogo}>
                        <TeamBadge logo={star.teamLogo} abbreviation={star.teamAbbreviation} teamName={star.teamName} size={76} sizeClass="h-[52px] w-[52px] md:h-[76px] md:w-[76px] 3xl:h-[88px] 3xl:w-[88px]" ring="none" />
                    </span>
                    <div className={styles.rv} style={delay(.08)}>
                        {star.franchiseId ? <Link href={`/teams/${star.franchiseId}`} className={styles.cdTeam}>{star.teamName}</Link> : <span className={styles.cdTeam}>No team recorded</span>}
                        <div className={styles.cdMeta}>{splitPositions(star.positions ?? '').join(' · ')} · Round {star.round}, pick {star.pick}</div>
                    </div>
                </div>
                <div className={`${styles.cdFirst} ${styles.rv}`} style={delay(.14)}>{firstName(star.player)}</div>
                <Link ref={nameRef} href={playerHref(star.playerId!)} className={`${styles.cdLast} ${styles.wipe}`}>{lastName(star.player)}</Link>
                <div className={`${styles.cdStats} ${styles.rv}`} style={delay(.4)}>
                    <div><div className={styles.statValue}>{formatFpts(star.value)}</div><div className={styles.statLabel}>FPTS</div></div>
                    <div><div className={styles.statValue}>{star.fpg === null ? '—' : star.fpg.toFixed(2)}</div><div className={styles.statLabel}>FP/G</div></div>
                    <div><div className={`${styles.statValue} ${styles.gold}`}>#{star.rank}</div><div className={styles.statLabel}>FPTS FINISH</div></div>
                </div>
            </div>

            <div className={styles.meter} aria-hidden="true">
                {scale.zoomed ? <div className={styles.meterTicks}>
                    {Array.from({ length: 4 }, (_, tick) => <span key={tick} style={{ '--tick': `${tick / 3 * 100}%` } as React.CSSProperties}>#{scale.start + scale.span / 3 * tick}</span>)}
                </div> : <div className={styles.meterRounds}>{Array.from({ length: rounds }, (_, round) => <span key={round}>R{round + 1}</span>)}</div>}
                <div className={styles.meterTrack}>
                    <div className={styles.meterFill} />
                    <div className={styles.meterFinish} />
                    <div className={styles.meterDraft} />
                </div>
                <div className={styles.meterLabels}>
                    <div className={styles.finishLabel}>FINISHED #{star.rank}</div>
                    <div className={styles.draftLabel}>DRAFTED #{star.overall}</div>
                    <div className={styles.climbChip}>+{star.movement}</div>
                </div>
                {/* phones swap the floating labels for one caption, laid out the same way as the track */}
                <div className={styles.meterCaption}>
                    <span className={`${styles.capFinish} ${styles.rv}`} style={delay(.6)}>Finished #{star.rank}</span>
                    <span>Drafted #{star.overall}</span>
                </div>
            </div>
        </div>

        <div role="tablist" aria-label={`Top ${steals.length} steals`} className={styles.tiles} style={{ '--count': steals.length } as React.CSSProperties}>
            {steals.map((pick, i) => ({ pick, i, seen: revealed.includes(i) })).reverse().map(({ pick, i, seen }) =>
                <button key={pick.overall} type="button" role="tab" className={styles.tile} aria-selected={i === index} aria-label={seen ? `${i + 1}. ${pick.player}` : `Reveal number ${i + 1}`}
                    data-hidden={seen ? undefined : ''} data-next={i === upNext && i !== index ? '' : undefined} onClick={() => go(i)}>
                    <span className={styles.tileTop}>
                        <span className={styles.tileNum}>{i + 1}</span>
                        {seen
                            ? <span className={styles.tileIn}><TeamBadge logo={pick.teamLogo} abbreviation={pick.teamAbbreviation} teamName={pick.teamName} size={48} sizeClass={styles.tileLogo} ring="none" /></span>
                            : <span className={styles.tileMystery} aria-hidden="true">?</span>}
                    </span>
                    {seen
                        ? <span className={`${styles.tileName} ${styles.trunc} ${styles.tileIn}`} style={{ animationDelay: '.1s' }}>{lastName(pick.player)}</span>
                        : <span className={styles.tileBar} aria-hidden="true" />}
                </button>)}
        </div>
    </section>;
}
