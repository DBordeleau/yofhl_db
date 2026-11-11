import styles from './pickem.module.css';

/** The rules in a line, under the leaderboard */
export default function PickemSeasonSummary() {
    return <p className={styles.rules}>
        Picks lock at noon ET on the first day of each matchup.
    </p>;
}
