import styles from './pickem.module.css';

// Each season's prize, by season year
const PRIZES: Record<number, string> = {
    2027: "The winner's 2027–28 Fantrax fees waived, split between joint winners.",
};

/** The rules in a line, then the season's prize when it has one */
export default function PickemSeasonSummary({ seasonYear }: { seasonYear: number }) {
    const prize = PRIZES[seasonYear];
    return <>
        <p className={styles.rules}>
            Pick the winner of each regular-season matchup before noon ET on the week&apos;s first day. Ranked by most
            correct, then fewest wrong. Playoffs don&apos;t count.
        </p>
        {prize && <p className={styles.prize}><span className={styles.goldSlab}>Prize</span>{prize}</p>}
    </>;
}
