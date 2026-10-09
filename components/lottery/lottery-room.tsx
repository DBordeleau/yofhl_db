'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import TeamBadge from '@/components/team-badge';
import { formatEastern, INTRO_MS, lotteryPickCount, REVEAL_MS, type LotteryResponse, type PublicLottery } from '@/lib/lottery/model';
import { useLottery } from './use-lottery';
import Arrow from '@/components/arrow';

const pad = (value: number) => String(value).padStart(2, '0');
const revealEase = [0.16, 1, 0.3, 1] as const;
const prizeParticles = Array.from({ length: 32 }, (_, index) => ({
    left: `${8 + (index * 37) % 84}%`,
    top: `${72 + (index * 11) % 25}%`,
    width: `${2 + index % 3}px`,
    height: `${2 + index % 3}px`,
    animationDuration: `${6 + index % 5}s`,
    animationDelay: `${-index * 0.71}s`,
    '--drift': `${(index % 2 ? 1 : -1) * (18 + index % 35)}px`,
} as CSSProperties));

function Countdown({ remaining }: { remaining: number }) {
    const total = Math.max(0, Math.ceil(remaining / 1000));
    const parts = [Math.floor(total / 86400), Math.floor(total / 3600) % 24, Math.floor(total / 60) % 60, total % 60];
    return <div className="lottery-countdown" aria-label={`${parts[0]} days, ${parts[1]} hours, ${parts[2]} minutes, ${parts[3]} seconds until the lottery`}>
        {parts.map((value, index) => <div key={index} className="lottery-time-unit"><span className="lottery-time-number">{pad(value)}</span><span className="lottery-time-label">{['Days', 'Hours', 'Minutes', 'Seconds'][index]}</span></div>)}
    </div>;
}

export default function LotteryRoom({ initial, id, unavailable = false }: { initial: LotteryResponse; id?: string; unavailable?: boolean }) {
    const { data, now, error } = useLottery(initial, id, unavailable);
    return <LotteryPresentation event={data.lottery} now={now} error={error} />;
}

// Both the public room and the admin rehearsal render the same presentation.
export function LotteryPresentation({ event, now, error = false, preview = false }: { event: PublicLottery | null; now: number; error?: boolean; preview?: boolean }) {
    const reduced = useReducedMotion();
    const [copied, setCopied] = useState(false);
    const [copyError, setCopyError] = useState(false);
    const remaining = event ? new Date(event.startsAt).getTime() - now : 0;
    const waiting = !!event && event.phase === 'scheduled' && remaining > 0;
    const winner = event?.entries.find((team) => team.id === event.winnerId);
    const lotteryPicks = event ? lotteryPickCount(event.entries) : 0;
    const revealedPicks = event?.revealed.filter((pick) => pick.pick <= lotteryPicks) ?? [];
    const latest = revealedPicks[0] ?? null;
    const participants = event?.entries.filter((team) => team.odds !== null) ?? [];
    const nextPick = lotteryPicks - revealedPicks.length;
    const nextIn = event?.nextRevealAt ? Math.max(0, Math.ceil((new Date(event.nextRevealAt).getTime() - now) / 1000)) : 0;
    const isIntro = !!event && now < new Date(event.startsAt).getTime() + INTRO_MS;
    const progress = event?.nextRevealAt ? Math.min(100, Math.max(0, 100 - ((new Date(event.nextRevealAt).getTime() - now) / (isIntro ? INTRO_MS : REVEAL_MS)) * 100)) : 100;
    const revealKey = winner ? `winner-${winner.id}` : latest ? `pick-${latest.pick}` : 'drawing';
    const Root = preview ? 'div' : 'main';

    return <Root className={`lottery-room ${preview ? 'lottery-preview' : ''}`}>
        <div className="lottery-grain" aria-hidden="true" />
        <div className="lottery-shell">
            <div className="lottery-masthead">
                <Link href="/" className="lottery-wordmark" aria-label="YOFHL home">YOFHL<span>THE DRAFT LOTTERY</span></Link>
                {event && !waiting && <span className={`lottery-status ${event.phase !== 'complete' ? 'is-live' : ''}`}>
                    <i aria-hidden="true" />{event.phase === 'complete' ? 'Results' : 'Live'}
                </span>}
            </div>
            {error && <div role="status" className="lottery-connection">Connection interrupted. Reconnecting automatically — the saved draw will not change.</div>}
            {!event ? <section className="lottery-empty">
                <h1>Draft <em>lottery</em></h1>
                <p>{error ? 'The lottery room is temporarily unavailable. Reconnecting…' : 'No lottery is scheduled.'}</p>
                <Link href="/teams/stats" className="lottery-button">Teams <span><Arrow /></span></Link>
            </section> : <>
                <section className={`lottery-hero ${waiting ? 'is-waiting' : 'is-revealing'}`} aria-labelledby="lottery-title">
                    <div className="lottery-hero-copy">
                        <h1 id="lottery-title">Draft<br /><em>lottery.</em></h1>
                        <p className="lottery-event-title">{event.title}</p>
                        <p className="lottery-date">{formatEastern(event.startsAt)}</p>
                        <div className="lottery-event-status">
                            <AnimatePresence initial={false} mode="wait">
                                {waiting ? <motion.div key="countdown" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: reduced ? 0 : -10 }} transition={{ duration: reduced ? 0.15 : 0.5 }}>
                                    <Countdown remaining={remaining} />
                                </motion.div> : <motion.div key={event.phase === 'complete' ? 'complete' : 'live'} className="lottery-live-message" initial={{ opacity: 0, y: reduced ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0.15 : 0.7, ease: revealEase }}>
                                    <span>{event.phase !== 'complete' && <i className="lottery-live-dot" aria-hidden="true" />}{event.phase === 'complete' ? 'Lottery concluded' : 'The lottery is live'}</span>
                                    {event.phase === 'complete' && <p>The final draft order is below.</p>}
                                </motion.div>}
                            </AnimatePresence>
                        </div>
                        <div className="lottery-share">
                            <button type="button" disabled={preview} title={preview ? 'Room links are available for scheduled lotteries.' : undefined} onClick={async () => {
                                try { await navigator.clipboard.writeText(`${window.location.origin}/lottery?id=${event.id}`); setCopied(true); setCopyError(false); }
                                catch { setCopyError(true); }
                            }} className="lottery-share-button">{copied ? 'Link copied ✓' : 'Copy room link ↗'}</button>
                            {copyError && <input aria-label="Lottery room link — select to copy" readOnly onFocus={(e) => e.target.select()} value={`${typeof window === 'undefined' ? '' : window.location.origin}/lottery?id=${event.id}`} className="lottery-share-input" />}
                            <span role="status" className="sr-only">{copied ? 'Lottery room link copied.' : ''}</span>
                        </div>
                    </div>
                    <div className={`lottery-stage ${winner ? 'has-winner' : ''}`}>
                        <div className="lottery-particles" aria-hidden="true">{prizeParticles.map((style, index) => <i key={index} style={style} />)}</div>
                        <div className="lottery-orbit orbit-one" aria-hidden="true" /><div className="lottery-orbit orbit-two" aria-hidden="true" /><div className="lottery-orbit orbit-three" aria-hidden="true" />
                        <div className="lottery-stage-cross cross-top" aria-hidden="true">+</div><div className="lottery-stage-cross cross-bottom" aria-hidden="true">+</div>
                        <AnimatePresence initial={false} mode="wait">
                            {waiting ? <motion.div key="prize" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 1.08, filter: 'blur(8px)' }} transition={{ duration: reduced ? 0.15 : 0.65, ease: revealEase }}>
                                <div className="lottery-prize">
                                    <span className="lottery-prize-number">01</span>
                                    <span className="lottery-prize-label">FIRST OVERALL</span>
                                </div>
                            </motion.div> : <motion.div key={revealKey} className="lottery-reveal" initial={reduced ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.88, filter: 'blur(12px)' }} animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, y: reduced ? 0 : -12 }} transition={{ duration: reduced ? 0.15 : 0.8, ease: revealEase }}>
                                {winner ? <>
                                    <span className="lottery-reveal-kicker">FIRST OVERALL PICK</span>
                                    <div className="lottery-winner-badge"><TeamBadge logo={winner.logo} abbreviation={winner.abbreviation} teamName={winner.name} size={140} ring="glow" priority /></div>
                                    <h2 className="lottery-winner-name"><Link href={`/teams/${winner.id}`} className="lottery-team-link">{winner.name}</Link></h2>
                                    <span className="lottery-winner-odds">{winner.odds}% odds</span>
                                    <span className="lottery-winner-seal">✦ LOTTERY WINNER ✦</span>
                                </> : latest ? <>
                                    <span className="lottery-reveal-kicker">PICK {pad(latest.pick)}</span>
                                    <TeamBadge logo={latest.team.logo} abbreviation={latest.team.abbreviation} teamName={latest.team.name} size={104} ring="none" />
                                    <h2 className="lottery-pick-name"><Link href={`/teams/${latest.team.id}`} className="lottery-team-link">{latest.team.name}</Link></h2>
                                </> : <>
                                    <span className="lottery-reveal-kicker">DRAW IN PROGRESS</span>
                                    <span className="lottery-drawing-mark" aria-hidden="true">✦</span>
                                </>}
                            </motion.div>}
                        </AnimatePresence>
                        {winner && event.phase === 'live' && <div className="lottery-confetti" aria-hidden="true">{Array.from({ length: 32 }, (_, index) => <i key={index} style={{ left: `${(index * 37) % 100}%`, animationDelay: `${(index % 8) * 0.15}s`, animationDuration: `${2.4 + (index % 5) * 0.3}s`, background: ['#eacb80', '#f8f4e9', '#679eae'][index % 3], transform: `rotate(${index * 23}deg)` }} />)}</div>}
                        <AnimatePresence>
                            {!waiting && !winner && <motion.div key="reveal-timing" className="lottery-stage-timing" initial={{ opacity: 0, y: reduced ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0.15 : 0.65, delay: reduced ? 0 : 0.8, ease: revealEase }}>
                                <div className="lottery-stage-footer"><span>{nextPick <= 2 ? 'FIRST PICK REVEAL' : `UP NEXT / PICK ${pad(nextPick)}`}</span><span>{nextIn > 0 ? `IN ${nextIn}s` : 'REVEALING…'}</span></div>
                                <div className="lottery-reveal-progress" aria-hidden="true"><span key={event.nextRevealAt} style={{ width: `${progress}%` }} /></div>
                            </motion.div>}
                        </AnimatePresence>
                    </div>
                </section>
                <div className="sr-only" role="status" aria-live="polite">{winner ? `${winner.name} wins the first overall pick.` : latest ? `Pick ${latest.pick}: ${latest.team.name}.` : ''}</div>
                <section className="lottery-contenders" aria-labelledby="contenders-title">
                    <div className="lottery-section-heading"><h2 id="contenders-title">Lottery board</h2></div>
                    <div className="lottery-team-grid">{participants.map((team, index) => <div key={team.id} className={`lottery-team-card ${winner?.id === team.id ? 'is-winner' : ''}`}>
                        <div className="lottery-team-card-top"><span>{pad(index + 1)}</span>{winner?.id === team.id && <span>✦ WINNER</span>}</div>
                        <TeamBadge logo={team.logo} abbreviation={team.abbreviation} teamName={team.name} size={80} sizeClass="lottery-team-logo" ring="none" />
                        <h3><Link href={`/teams/${team.id}`} className="lottery-team-link">{team.name}</Link></h3><div className="lottery-odds"><strong>{team.odds}<span>%</span></strong><span>ODDS</span></div>
                        <div className="lottery-odds-track" aria-hidden="true"><span style={{ width: `${team.odds}%` }} /></div>
                    </div>)}</div>
                </section>
                <section className="lottery-order-section" aria-labelledby="order-title">
                    <div className="lottery-section-heading"><h2 id="order-title">Draft order</h2></div>
                    <ol className="lottery-order-list" aria-label="Draft order">
                        {event.entries.map((original, index) => {
                            const revealed = event.revealed.find((pick) => pick.pick === index + 1);
                            const team = revealed?.team ?? (index >= lotteryPicks ? original : null);
                            return <li key={index} className={`lottery-order-row ${!waiting && index === 0 && winner ? 'is-first' : ''}`}>
                                <span className="lottery-order-number">{pad(index + 1)}</span>
                                <div className="lottery-order-slot">
                                    <AnimatePresence initial={false} mode="wait">
                                        <motion.div key={team?.id ?? 'locked'} className="lottery-order-content" initial={{ opacity: 0, x: reduced ? 0 : 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduced ? 0 : -8 }} transition={{ duration: reduced ? 0.15 : 0.65, ease: revealEase }}>
                                            {team ? <><TeamBadge logo={team.logo} abbreviation={team.abbreviation} teamName={team.name} size={36} ring="none" /><Link href={`/teams/${team.id}`} className="lottery-order-team lottery-team-link">{team.name}</Link>{index === 0 && winner && <span className="lottery-order-label">✦ WINNER</span>}</> : <><span className="lottery-locked-icon" aria-hidden="true">?</span><span className="lottery-order-team is-locked">TO BE DETERMINED</span></>}
                                        </motion.div>
                                    </AnimatePresence>
                                </div>
                            </li>;
                        })}
                    </ol>
                </section>
            </>}
        </div>
    </Root>;
}
