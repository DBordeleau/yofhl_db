import styles from './pickem.module.css';

// Each season's prize, by season year
const PRIZES: Record<number, { what: string; season: string }> = {
    2027: { what: 'Fee Waiver', season: '2027–28' },
};

/** The season's first place prize, when it has one: a gold 1st slab cut into a navy plate as wide as the leaderboard,
    then the prize in the page title's voice with its season outlined after it */
export function PickemPrize({ seasonYear }: { seasonYear: number }) {
    const prize = PRIZES[seasonYear];
    return prize ? <p className={styles.prize}><span className={styles.prizeTag}><b>1st</b> <span>Place prize</span></span><span className={styles.prizeWhat}>{prize.what} <span>{prize.season}</span></span></p> : null;
}

/** The rules in a line, under the leaderboard */
export default function PickemSeasonSummary() {
    return <p className={styles.rules}>
        Picks lock at noon ET on the first day of each matchup.
    </p>;
}
