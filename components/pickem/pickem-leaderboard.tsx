'use client';

import type { CSSProperties } from 'react';
import TeamBadge from '@/components/team-badge';
import { useTeamBranding } from '@/components/team-branding/branding-provider';
import type { PickemLeaderboardEntry } from '@/lib/pickem/create-pickem';
import { clubColours, clubTone } from './club-tone';
import { Check, Cross } from './icons';
import styles from './pickem.module.css';

// The Pick'em leaderboard as a navy standings board: rank, the entry's logo on its club-colour slab and its team
// name, then correct, wrong and percentage (on phones the correct and wrong heads draw as a check and a cross).
// Places shared by level entries read T2. First place takes gold, and the winner or joint winners head it once the
// season is complete. With nothing to rank yet it stays a quiet panel.

const named = ({ franchise }: PickemLeaderboardEntry) => franchise.name;

export default function PickemLeaderboard({ entries, winners, unavailable = false }: { entries: PickemLeaderboardEntry[]; winners: PickemLeaderboardEntry[]; unavailable?: boolean }) {
    const palettes = useTeamBranding();
    const empty = unavailable || !entries.length;
    return <section aria-labelledby="pickem-leaderboard" className={styles.board} data-empty={empty ? '' : undefined}>
        <div className={styles.boardHead}>
            <h2 id="pickem-leaderboard">Leaderboard</h2>
            {winners.length > 0 && <p className={styles.champion}>
                <span className={styles.goldSlab}>{winners.length > 1 ? 'Joint winners' : 'Winner'}</span>
                {winners.map(named).join(', ')}
            </p>}
        </div>
        {unavailable ? <p className={styles.boardEmpty}>The leaderboard is unavailable right now. Try again soon.</p>
            : !entries.length ? <p className={styles.boardEmpty}>No locked Pick&apos;em picks yet.</p>
            : <table className={styles.table}>
                <colgroup>
                    <col className={styles.colRank} />
                    <col />
                    <col className={styles.colCorrect} />
                    <col className={styles.colWrong} />
                    <col className={styles.colPct} />
                </colgroup>
                <thead>
                    <tr>
                        <th scope="col"><abbr title="Rank" className="no-underline">#</abbr></th>
                        <th scope="col">Team</th>
                        <th scope="col"><span className={styles.headWord}>Correct</span><span className={styles.headMark} title="Correct"><Check /></span></th>
                        <th scope="col"><span className={styles.headWord}>Wrong</span><span className={styles.headMark} title="Wrong"><Cross /></span></th>
                        <th scope="col"><abbr title="Percentage" className="no-underline">Pct</abbr></th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map((entry, i) => {
                        const tied = entries[i - 1]?.rank === entry.rank || entries[i + 1]?.rank === entry.rank;
                        return <tr key={entry.franchise.id} data-first={entry.rank === 1 ? '' : undefined} style={{ '--i': i } as CSSProperties}>
                            <td className={styles.rank}>
                                {tied && <abbr title="Tied" className="no-underline">T</abbr>}{entry.rank}
                            </td>
                            <td>
                                <span className={styles.entry}>
                                    <span className={styles.entryMark} style={clubTone(clubColours(palettes, entry.franchise.id))}>
                                        <TeamBadge logo={entry.franchise.logo} abbreviation={entry.franchise.abbreviation} teamName={entry.franchise.name} size={26} />
                                    </span>
                                    <span className={styles.entryName}>
                                        <b>{named(entry)}</b>
                                    </span>
                                </span>
                            </td>
                            <td className={styles.correct}>{entry.correct}</td>
                            <td className={styles.wrong}>{entry.wrong}</td>
                            <td className={styles.pct}>{entry.percentage === null ? '' : <>{Math.round(entry.percentage * 100)}<small>%</small></>}</td>
                        </tr>;
                    })}
                </tbody>
            </table>}
    </section>;
}
