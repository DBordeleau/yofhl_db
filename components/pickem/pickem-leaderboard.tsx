import type { CSSProperties } from 'react';
import TeamBadge from '@/components/team-badge';
import type { PickemLeaderboardEntry } from '@/lib/pickem/create-pickem';
import styles from './pickem.module.css';

// The Pick'em leaderboard as a navy standings board: rank, owner and franchise, correct, wrong and percentage. The
// winner or joint winners head it once the season is complete; first place takes gold.

const percent = (value: number | null) => value === null ? '' : `${Math.round(value * 100)}%`;
const named = ({ owner, franchise }: PickemLeaderboardEntry) => owner ?? franchise.name;

export default function PickemLeaderboard({ entries, winners, unavailable = false }: { entries: PickemLeaderboardEntry[]; winners: PickemLeaderboardEntry[]; unavailable?: boolean }) {
    return <section aria-labelledby="pickem-leaderboard" className={styles.board}>
        <h2 id="pickem-leaderboard">Pick&apos;em leaderboard</h2>
        {winners.length > 0 && <p className={styles.champion}>
            <span className={styles.goldSlab}>{winners.length > 1 ? 'Joint winners' : 'Winner'}</span>
            {winners.map(named).join(', ')}
        </p>}
        {unavailable ? <p className={styles.boardEmpty}>The leaderboard is unavailable right now. Try again soon.</p>
            : !entries.length ? <p className={styles.boardEmpty}>No locked Pick&apos;em picks yet.</p>
            : <table className={styles.table}>
                <thead>
                    <tr>
                        <th scope="col"><abbr title="Rank" className="no-underline">#</abbr></th>
                        <th scope="col">Owner</th>
                        <th scope="col">Correct</th>
                        <th scope="col">Wrong</th>
                        <th scope="col"><abbr title="Percentage" className="no-underline">Pct</abbr></th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map((entry, i) => <tr key={entry.franchise.id} data-first={entry.rank === 1 ? '' : undefined} style={{ '--i': i } as CSSProperties}>
                        <td className={styles.rank}>{entry.rank}</td>
                        <td>
                            <span className={styles.entry}>
                                <TeamBadge logo={entry.franchise.logo} abbreviation={entry.franchise.abbreviation} teamName={entry.franchise.name} size={28} />
                                <span>
                                    <b>{named(entry)}</b>
                                    {entry.owner && <small>{entry.franchise.name}</small>}
                                </span>
                            </span>
                        </td>
                        <td>{entry.correct}</td>
                        <td className={styles.muted}>{entry.wrong}</td>
                        <td>{percent(entry.percentage)}</td>
                    </tr>)}
                </tbody>
            </table>}
    </section>;
}
