'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { FiPlus } from 'react-icons/fi';
import TeamBadge from '@/components/team-badge';
import Arrow from '@/components/arrow';
import type { FranchiseCard } from '@/lib/data/league';
import type { Chase } from '@/lib/records/model';
import { seasonLabel } from '@/lib/league';
import styles from './records.module.css';

export const number = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });
type Props = { chases: Chase[]; teams: FranchiseCard[]; year: number; compact?: boolean };
const ease = [.16, 1, .3, 1] as const;
const progressOf = (chase: Chase) => Math.max(0, Math.min(100, (chase.total - (chase.target - chase.step)) / chase.step * 100));

function ChaseDetail({ chase, year, close }: { chase: Chase; year: number; close: () => void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const [closing, setClosing] = useState(false);
    const reducedMotion = useReducedMotion();
    useEffect(() => {
        const element = dialog.current;
        element?.showModal();
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = overflow; };
    }, []);
    useEffect(() => {
        if (!closing) return;
        const timer = window.setTimeout(() => dialog.current?.close(), reducedMotion ? 0 : 180);
        return () => window.clearTimeout(timer);
    }, [closing, reducedMotion]);
    return <dialog ref={dialog} className={`${styles.dialog} ${closing ? styles.dialogClosing : ''}`} aria-labelledby="chase-title" onClose={close} onCancel={event => { event.preventDefault(); setClosing(true); }} onClick={event => { if (event.target === event.currentTarget) setClosing(true); }}>
        <div className={styles.dialogInner}>
            <button type="button" className={styles.close} aria-label="Close milestone details" onClick={() => setClosing(true)}>×</button>
            <p className={styles.kick}>{chase.kind}</p><h2 id="chase-title">{chase.name}</h2>
            <p className={styles.dialogGap}>{number(chase.gap)} <span>{chase.unit} to {number(chase.target)}</span></p>
            <dl className={styles.breakdown}>
                <div><dt>Through {seasonLabel(year - 1)}</dt><dd>{number(chase.archived)}</dd></div>
                <div><dt>{seasonLabel(year)}</dt><dd>+{number(chase.current)}</dd></div>
                <div><dt>Total</dt><dd>{number(chase.total)}</dd></div>
            </dl>
            <div className={styles.dialogLinks}><Link href={chase.href}>Career history <Arrow direction="out" /></Link></div>
        </div>
    </dialog>;
}

function ChaseProgress({ chase }: { chase: Chase }) {
    const reducedMotion = useReducedMotion();
    const progress = progressOf(chase);
    return <div className={styles.chaseProgress}>
        <div className={styles.progressLabels}><span>{number(chase.total)} {chase.unit}</span><span>{number(chase.target)}</span></div>
        <div className={styles.progress} role="meter" aria-label={`${chase.name}: progress to next milestone`} aria-valuemin={chase.target - chase.step} aria-valuemax={chase.target} aria-valuenow={chase.total} aria-valuetext={`${number(chase.total)} of ${number(chase.target)} ${chase.unit}`}>
            <motion.span initial={{ width: reducedMotion ? `${progress}%` : 0 }} animate={{ width: `${progress}%` }} transition={{ duration: reducedMotion ? 0 : .7, ease }} />
        </div>
    </div>;
}

// Progress to the next milestone as a lane: the puck slides toward the goal line at the target.
function ChaseLane({ chase }: { chase: Chase }) {
    const reducedMotion = useReducedMotion();
    const progress = `${progressOf(chase)}%`;
    const transition = { duration: reducedMotion ? 0 : .9, ease };
    return <div className={styles.lane}>
        <div className={styles.laneLabels}><span>{number(chase.total)} {chase.unit}</span><span className={styles.laneGoal}>{number(chase.target)}</span></div>
        <div className={styles.laneBox} role="meter" aria-label={`${chase.name}: progress to next milestone`} aria-valuemin={chase.target - chase.step} aria-valuemax={chase.target} aria-valuenow={chase.total} aria-valuetext={`${number(chase.total)} of ${number(chase.target)} ${chase.unit}`}>
            <div className={styles.laneTrack}>
                <motion.span className={styles.laneFill} initial={{ width: reducedMotion ? progress : 0 }} animate={{ width: progress }} transition={transition} />
                <motion.span className={styles.puck} initial={{ left: reducedMotion ? progress : 0 }} animate={{ left: progress }} transition={transition} />
            </div>
            <span className={styles.goal} />
        </div>
    </div>;
}

const scopes = [['all', 'All'], ['players', 'Players'], ['teams', 'Teams']] as const;

// The record book hero: the page title beside the featured chase, with the next three chases in a strip below.
export function ChaseHero({ chases, teams, year, children }: Omit<Props, 'compact'> & { children: ReactNode }) {
    const [scope, setScope] = useState<typeof scopes[number][0]>('all');
    const [index, setIndex] = useState(0);
    const [direction, setDirection] = useState(1);
    const [selected, setSelected] = useState<Chase | null>(null);
    const reducedMotion = useReducedMotion();
    const candidates = chases.filter(chase => scope === 'all' || (scope === 'players' ? chase.id.startsWith('player-') : !chase.id.startsWith('player-'))).slice(0, 12);
    const activeIndex = index % Math.max(1, candidates.length);
    const chase = candidates[activeIndex];
    const team = chase && teams.find(t => t.ID === chase.team);
    // Up to five upcoming chases; the stylesheet shows more of them as the screen widens.
    const next = Array.from({ length: Math.min(5, Math.max(0, candidates.length - 1)) }, (_, offset) => (activeIndex + offset + 1) % candidates.length);
    const step = (delta: number) => { setDirection(delta); setIndex((activeIndex + delta + candidates.length) % candidates.length); };
    const shift = reducedMotion ? 0 : 16 * direction;

    return <>
        <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div className={styles.heroTitle}>{children}</div>
            <div className={styles.horizon}>
                <div className={styles.horizonTop}>
                    <h2 id="chases-heading">On the horizon</h2>
                    <div className={styles.pills} role="group" aria-label="Milestone type">{scopes.map(([id, label]) => <button type="button" key={id} aria-pressed={scope === id} onClick={() => { setScope(id); setIndex(0); setDirection(1); }}>{label}</button>)}</div>
                </div>
                {chase ? <div className={styles.feature}>
                    <div className={styles.featureHead}>
                        {team ? <TeamBadge logo={team.LogoUrl} abbreviation={team.Abbreviation} teamName={team.Team} size={52} ring="none" /> : null}
                        <span className={styles.featureKind}>{chase.kind}{team ? <small>{team.Team}</small> : null}</span>
                        <div className={styles.pager}>
                            <button type="button" disabled={candidates.length < 2} aria-label="Previous milestone" onClick={() => step(-1)}><Arrow direction="left" animated={false} /></button>
                            <button type="button" disabled={candidates.length < 2} aria-label="Next milestone" onClick={() => step(1)}><Arrow animated={false} /></button>
                        </div>
                    </div>
                    <AnimatePresence mode="wait" initial={false}><motion.div key={chase.id} initial={{ opacity: 0, x: shift }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -shift }} transition={{ duration: reducedMotion ? 0 : .18 }}>
                        <h3 className={styles.featureName}>{chase.name}</h3>
                        {/* On wide cards the lane sits beside the countdown; otherwise it wraps below it. */}
                        <div className={styles.featureRow}>
                            <strong className={styles.featureGap}>{number(chase.gap)}</strong>
                            <span className={styles.featureTo}>{chase.unit} to<b>{number(chase.target)}</b></span>
                            <ChaseLane chase={chase} />
                            <button type="button" className={styles.viewDetails} aria-label={`View milestone details for ${chase.name}`} title="View milestone details" aria-haspopup="dialog" onClick={() => setSelected(chase)}><FiPlus size={20} aria-hidden="true" /></button>
                        </div>
                    </motion.div></AnimatePresence>
                </div> : <p className={styles.heroEmpty}>Current scoring is unavailable.</p>}
            </div>
        </div>
        {next.length ? <div className={styles.queueBar}><div className={`${styles.wrap} ${styles.queue}`}>{next.map(i => {
            const candidate = candidates[i];
            const franchise = teams.find(t => t.ID === candidate.team);
            return <button type="button" key={candidate.id} onClick={() => { setDirection(1); setIndex(i); }} aria-label={`Show ${candidate.name}: ${number(candidate.target)} ${candidate.unit} milestone`}>
                {franchise ? <TeamBadge logo={franchise.LogoUrl} abbreviation={franchise.Abbreviation} teamName={franchise.Team} size={40} ring="none" /> : null}
                <span className={styles.queueName}><strong>{candidate.name}</strong><small>{number(candidate.target)} {candidate.unit} · {candidate.kind}</small></span>
                <span className={styles.queueGap}><small>To go</small><b>{number(candidate.gap)}</b></span>
            </button>;
        })}</div></div> : null}
        {selected ? <ChaseDetail chase={selected} year={year} close={() => setSelected(null)} /> : null}
    </>;
}

// Compact chase cards for the home page preview.
export default function Chases({ chases, year }: Props) {
    const [selected, setSelected] = useState<Chase | null>(null);
    return <>
        <div className={styles.compactChases}>{chases.map(chase => <button type="button" key={chase.id} className={styles.compactChase} onClick={() => setSelected(chase)}>
            <span>{chase.kind}</span><strong>{chase.name}</strong><b>{number(chase.gap)} <small>{chase.unit} to {number(chase.target)}</small></b><ChaseProgress chase={chase} /><span className={styles.compactArrow}><Arrow /></span>
        </button>)}</div>
        {selected ? <ChaseDetail chase={selected} year={year} close={() => setSelected(null)} /> : null}
    </>;
}
