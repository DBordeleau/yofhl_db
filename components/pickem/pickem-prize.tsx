'use client';

import { useEffect, useState } from 'react';
import styles from './pickem.module.css';

// Each season's prize, by season year
const PRIZES: Record<number, { what: string; season: string }> = {
    2027: { what: 'Fee Waiver', season: '2027–28' },
};

// Every week is its own page, so changing weeks mounts the prize afresh. The seasons whose prize has already caught
// the light this visit, so the glint plays once rather than on every week.
const glinted = new Set<number>();

/** The season's first place prize, when it has one: a gold 1st slab cut into a navy plate as wide as the leaderboard,
    then the prize in the page title's voice with its season outlined after it */
export function PickemPrize({ seasonYear }: { seasonYear: number }) {
    const [seen] = useState(() => glinted.has(seasonYear));
    useEffect(() => { glinted.add(seasonYear); }, [seasonYear]);
    const prize = PRIZES[seasonYear];
    return prize ? <p className={styles.prize}>
        <span className={styles.prizeTag} data-seen={seen ? '' : undefined}><b>1st</b> <span>Place prize</span></span>
        <span className={styles.prizeWhat}>{prize.what} <span>{prize.season}</span></span>
    </p> : null;
}
