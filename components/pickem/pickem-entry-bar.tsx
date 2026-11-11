'use client';

import { useState, type CSSProperties } from 'react';
import { Check, Cross } from './icons';
import styles from './pickem.module.css';

interface Props {
    picked: number;
    total: number;
    clearing: boolean;
    onClear: () => void;
}

// How far apart the segments of one change start: a batch (the owner's picks loading, Clear picks) runs as a cascade,
// filling from the first segment and draining from the last.
const FILL_STEP = 55;
const DRAIN_STEP = 38;

// The owner's entry bar, floating over the page: where the entry stands, a meter with a segment per matchup, and Clear
// picks. A call lights its segment like the strip's goal light: red wipes in along the slant, white-hot at first and
// cooling to red, as the segment jumps; the count rolls up to meet it. Clearing a call drains its segment back out, and
// Clear picks drains the whole meter from the end. Every pick of the week turns the count into the All in slab.
export default function PickemEntryBar({ picked, total, clearing, onClear }: Props) {
    // the last change of the count, kept through renders that don't change it so a running fill isn't cut short
    const [change, setChange] = useState({ from: picked, to: picked });
    if (change.to !== picked) setChange({ from: change.to, to: picked });
    const { from, to } = change;
    const idle = picked === 0 && !clearing;
    return <div className={styles.entryBar}>
        {picked === total && total > 0
            ? <span className={styles.allIn}><Check />All in</span>
            : <span className={styles.progressText}><Count value={picked} /> of {total} picked</span>}
        <span className={styles.pips} aria-hidden="true">
            {Array.from({ length: total }, (_, i) => {
                const filling = to > from && i >= from && i < to;
                const draining = to < from && i >= to && i < from;
                const delay = filling ? (i - from) * FILL_STEP : draining ? (from - 1 - i) * DRAIN_STEP : 0;
                return <span key={i} className={styles.pip} data-on={i < picked ? '' : undefined}
                    data-lit={filling && to - from === 1 ? '' : undefined} style={{ '--d': `${delay}ms` } as CSSProperties} />;
            })}
        </span>
        <button type="button" className={styles.clearButton} disabled={clearing || picked === 0} aria-busy={clearing}
            data-idle={idle ? '' : undefined} aria-hidden={idle ? true : undefined} onClick={onClear}>
            <Cross />{clearing ? 'Clearing…' : 'Clear picks'}
        </button>
    </div>;
}

/** The count, rolling up as a call goes in and down as one comes out */
function Count({ value }: { value: number }) {
    const [roll, setRoll] = useState<{ now: number; was: number | null }>({ now: value, was: null });
    if (roll.now !== value) setRoll({ now: value, was: roll.now });
    const style = { '--dir': roll.was !== null && value < roll.was ? -1 : 1 } as CSSProperties;
    return <b className={styles.count} style={style}>
        {roll.was !== null && <span key={`was-${roll.now}`} className={styles.countOut} aria-hidden="true">{roll.was}</span>}
        <span key={roll.now} className={roll.was !== null ? styles.countIn : undefined}>{roll.now}</span>
    </b>;
}
