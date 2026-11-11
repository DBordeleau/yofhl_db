'use client';

import { useEffect, useState } from 'react';
import { pickemPrize } from './prizes';
import styles from './pickem.module.css';

// Every week is its own page, so changing weeks mounts the prize afresh. The seasons whose prize has already caught
// the light this visit, so the glint plays once rather than on every week.
const glinted = new Set<number>();

/** The season's first place prize, when it has one: a gold 1st slab cut into a navy plate as wide as the leaderboard,
    then the prize in the page title's voice with its season outlined after it */
export function PickemPrize({ seasonYear }: { seasonYear: number }) {
    const [seen] = useState(() => glinted.has(seasonYear));
    useEffect(() => { glinted.add(seasonYear); }, [seasonYear]);
    const prize = pickemPrize(seasonYear);
    return prize ? <p className={styles.prize}>
        <span className={styles.prizeTag} data-seen={seen ? '' : undefined}><b>1st</b> <span>Place prize</span></span>
        <span className={styles.prizeWhat}>{prize.what} <span>{prize.season}</span></span>
    </p> : null;
}
