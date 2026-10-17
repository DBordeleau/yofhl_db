'use client';

import { playerHref } from '@/lib/player-url';

import Link from 'next/link';
import { useState } from 'react';
import TeamBadge from '@/components/team-badge';
import { redraftBoard, type RankedPick } from '@/lib/draft/hindsight';
import type { SeasonDraftSelection } from '@/lib/history/model';
import { formatFpts } from '@/lib/league';
import { ordinal } from './board';
import styles from './draft-class.module.css';

function Team({ pick }: { pick: SeasonDraftSelection }) {
    return <>
        <TeamBadge logo={pick.teamLogo} abbreviation={pick.teamAbbreviation} teamName={pick.teamName} size={20} ring="none" />
        {pick.franchiseId ? <Link href={`/teams/${pick.franchiseId}#draft-history`} className={styles.trunc}>{pick.teamName}</Link> : <span className={styles.trunc}>No team recorded</span>}
    </>;
}

// Each slot re-picked by season FPts, side by side with who was actually taken there.
export default function Redraft({ picks, ranked }: { picks: SeasonDraftSelection[]; ranked: RankedPick[] }) {
    const board = redraftBoard(picks, ranked);
    const rounds = [...new Set(picks.map(pick => pick.round))].sort((a, b) => a - b);
    const [round, setRound] = useState(rounds[0] ?? 1);
    const rows = board.filter(row => row.original.round === round);

    return <div className={styles.view}>
        <div role="tablist" aria-label="Round" className={styles.rounds}>
            {rounds.map(value => <button key={value} type="button" role="tab" className={styles.roundTab} aria-selected={value === round} aria-label={`Round ${value}`} onClick={() => setRound(value)}>
                <span className={styles.roundLong}>Round {value}</span><span className={styles.roundShort}>R{value}</span>
            </button>)}
        </div>

        <div role="table" aria-label={`Round ${round}: redraft versus original selections`} className={styles.rdTable}>
            <div role="row" className={styles.rdHead}>
                <span role="columnheader"><span className="sr-only">Pick</span></span>
                <span role="columnheader">REDRAFT</span>
                <span role="columnheader">ORIGINAL</span>
            </div>
            {rows.map(({ original, redrafted }) => {
                const move = redrafted ? redrafted.overall - original.overall : 0;
                const spots = `${Math.abs(move)} ${Math.abs(move) === 1 ? 'spot' : 'spots'}`;
                const gain = redrafted && original.points !== null ? Math.round((redrafted.value - original.points) * 100) / 100 : 0;
                const direction = gain > 0 ? 'up' : gain < 0 ? 'down' : 'same';
                return <div role="row" key={original.overall} className={styles.rdRow}>
                    <div role="cell" className={styles.rdSlot} aria-label={`Drafted ${original.overall} overall`}>
                        <span className={styles.rdSlotNum}>#{original.overall}</span>
                        <span className={styles.rdSlotSub}>R{original.round} · P{original.pick}</span>
                    </div>

                    <div role="cell" className={`${styles.rdCell} ${styles.rdNew}`} data-better={gain > 0 ? '' : undefined}>
                        {redrafted ? <>
                            <div className={styles.rdWho}>
                                <Link href={playerHref(redrafted.playerId!)} className={`${styles.rdName} ${styles.trunc}`}>{redrafted.player}</Link>
                                <span className={styles.rdBy}><span>Originally drafted by</span><Team pick={redrafted} /></span>
                                <span className={styles.move} data-dir={move > 0 ? 'up' : move < 0 ? 'down' : 'same'}>
                                    {move === 0 ? `No change · ${ordinal(original.overall)} overall` : `${move > 0 ? '↑' : '↓'} ${spots} from ${ordinal(redrafted.overall)} overall`}
                                </span>
                            </div>
                            <div className={styles.rdScore}>
                                <div className={styles.rdPts}>{formatFpts(redrafted.value)}<span className={styles.unit}>FPTS</span></div>
                                <div className={styles.swing} data-dir={direction}>
                                    <strong>{gain === 0 ? '±0' : `${gain > 0 ? '+' : '−'}${formatFpts(Math.abs(gain))}`}</strong>
                                    <span>FPTS vs original</span>
                                </div>
                            </div>
                        </> : <span className={styles.rdEmpty}>{original.playerId ? 'Unranked · no season stats' : 'Empty slot'}</span>}
                    </div>

                    <div role="cell" className={`${styles.rdCell} ${styles.rdOrig}`} data-worse={gain > 0 ? '' : undefined}>
                        <div className={styles.rdWho}>
                            {original.playerId
                                ? <Link href={playerHref(original.playerId)} className={`${styles.rdName} ${styles.trunc}`}>{original.player}</Link>
                                : <span className={styles.rdEmpty}>No selection recorded</span>}
                            <span className={styles.rdBy}><span>{original.playerId ? 'Drafted by' : 'Slot held by'}</span><Team pick={original} /></span>
                        </div>
                        {original.playerId && <div className={styles.rdScore}>
                            <div className={styles.rdPts}>{original.points === null ? '—' : formatFpts(original.points)}<span className={styles.unit}>FPTS</span></div>
                        </div>}
                    </div>
                </div>;
            })}
        </div>
    </div>;
}
