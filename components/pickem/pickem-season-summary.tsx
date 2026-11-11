import styles from './pickem.module.css';

// Each season's prize, by season year
const PRIZES: Record<number, string> = {
    2027: 'Free 2027–28 Fantrax fees, split if tied.',
};

/** The rules in a line, then the season's prize when it has one */
export default function PickemSeasonSummary({ seasonYear }: { seasonYear: number }) {
    const prize = PRIZES[seasonYear];
    return <>
        <p className={styles.rules}>
            Picks lock at noon ET on the first day of each matchup.
        </p>
        {prize && <p className={styles.prize}><span className={styles.goldSlab}>Prize</span>{prize}</p>}
    </>;
}
