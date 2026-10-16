'use client';

import Link from 'next/link';
import { useState } from 'react';
import TeamBadge from '@/components/team-badge';
import type { SeasonDraftSelection } from '@/lib/history/model';
import { draftRegrets, laterAlternatives, MIN_REGRET_GAP, rankDraft, redraftBoard, type DraftView } from '@/lib/draft/hindsight';
import { formatFpts, splitPositions } from '@/lib/league';
import styles from './draft-hindsight.module.css';

const ordinalRules = new Intl.PluralRules('en', { type: 'ordinal' });
const ordinalSuffixes: Record<string, string> = { one: 'st', two: 'nd', few: 'rd', other: 'th' };

function Player({ pick }: { pick: SeasonDraftSelection }) {
    return <Link href={`/player/${encodeURIComponent(pick.playerId!)}`} className={styles.player}>{pick.player}</Link>;
}

function Team({ pick }: { pick: SeasonDraftSelection }) {
    return <span className={styles.team}>
        <TeamBadge logo={pick.teamLogo} abbreviation={pick.teamAbbreviation} teamName={pick.teamName} size={22} ring="none" />
        {pick.franchiseId ? <Link href={`/teams/${pick.franchiseId}#draft-history`}>{pick.teamName}</Link> : 'No team recorded'}
    </span>;
}

function Movement({ value, originalOverall }: { value: number; originalOverall?: number }) {
    const spots = `${Math.abs(value)} ${Math.abs(value) === 1 ? 'spot' : 'spots'}`;
    const originalPosition = originalOverall === undefined ? '' : `${originalOverall}${ordinalSuffixes[ordinalRules.select(originalOverall)]} overall`;
    const origin = originalPosition ? ` from ${originalPosition}` : '';
    const unchanged = `No change${originalPosition ? ` · ${originalPosition}` : ''}`;
    const label = value === 0 ? unchanged : `${value > 0 ? 'Up' : 'Down'} ${spots}${origin}`;
    const text = value === 0 ? unchanged : originalOverall !== undefined ? `${value > 0 ? '↑' : '↓'} ${spots}${origin}` : value > 0 ? `+${value}` : `−${-value}`;
    return <span className={styles.movement} data-direction={value > 0 ? 'up' : value < 0 ? 'down' : 'same'}
        aria-label={label} title={label}>{text}</span>;
}

export default function DraftHindsight({ picks, view, initialPick }: {
    picks: SeasonDraftSelection[]; view: Exclude<DraftView, 'board'>;
    initialPick?: number;
}) {
    const [samePosition, setSamePosition] = useState(true);
    const [selectedPick, setSelectedPick] = useState(initialPick ?? 0);
    const [limit, setLimit] = useState(10);
    const ranked = rankDraft(picks);
    const steals = ranked.filter(p => p.movement > 0).sort((a, b) => b.movement - a.movement || b.value - a.value || a.overall - b.overall);
    const regrets = draftRegrets(ranked, samePosition);
    const reviewed = (regrets.find(r => r.pick.overall === selectedPick) ?? regrets[0])?.pick;
    const alternatives = reviewed ? laterAlternatives(reviewed, ranked, samePosition) : [];
    const best = alternatives[0];
    const board = redraftBoard(picks, ranked);
    const star = steals[0];

    function review(overall: number) {
        setSelectedPick(overall);
        const url = new URL(location.href);
        url.searchParams.set('pick', String(overall));
        history.replaceState(null, '', url);
    }

    return <div className={styles.review}>
        {view === 'regrets' ? <>
            <div className={styles.regretControls}>
                <select aria-label="Draft pick" value={reviewed?.overall ?? ''} onChange={e => review(Number(e.target.value))} disabled={!regrets.length}>
                    {!regrets.length && <option value="">No qualifying picks</option>}
                    {[...regrets].sort((a, b) => a.pick.overall - b.pick.overall).map(({ pick }) => <option key={pick.overall} value={pick.overall}>#{pick.overall} · {pick.player}</option>)}
                </select>
                <label className={styles.checkbox}><input type="checkbox" checked={samePosition} onChange={e => setSamePosition(e.target.checked)} /> Same position</label>
            </div>
            {reviewed ? <>
                <div className={styles.comparison}>
                    <div className={styles.chosen}>
                        <span className={styles.eyebrow}>The pick · #{reviewed.overall}</span>
                        <h3><Player pick={reviewed} /></h3>
                        <Team pick={reviewed} />
                        <strong className={styles.total}>{formatFpts(reviewed.value)} <small>FPts</small></strong>
                        <span className={styles.position}>{splitPositions(reviewed.positions).join(' · ')}</span>
                    </div>
                    <div className={styles.alternative}>
                        {best ? <>
                            <span className={styles.eyebrow}>Still on the board · #{best.overall}</span>
                            <h3><Player pick={best} /></h3>
                            <Team pick={best} />
                            <strong className={styles.total}>{formatFpts(best.value)} <small>FPts</small></strong>
                            <span className={styles.gap}>+{formatFpts(Math.round((best.value - reviewed.value) * 100) / 100)} FPts</span>
                        </> : <><span className={styles.eyebrow}>Still on the board</span><p className={styles.noBetter}>No later {samePosition ? 'position-matching ' : ''}selection scored more.</p></>}
                    </div>
                </div>
                {alternatives.length > 1 && <div className={styles.alsoAvailable}>
                    <span>Also available</span>{alternatives.slice(1, 4).map(p => <span key={p.overall}><Player pick={p} /><small>#{p.overall} · {formatFpts(p.value)} FPts</small></span>)}
                </div>}
                {regrets.some(r => r.pick.overall !== reviewed.overall) && <div className={styles.revisit}>
                    <h3>Other picks to revisit</h3>
                    {regrets.filter(r => r.pick.overall !== reviewed.overall).slice(0, 5).map(r => <button type="button" key={r.pick.overall} onClick={() => review(r.pick.overall)}>
                        <span className={styles.pickNumber}>#{r.pick.overall}</span><span>{r.pick.player}<small>{r.alternative.player} went #{r.alternative.overall}</small></span><strong>+{formatFpts(r.gap)}<small>FPts gap</small></strong>
                    </button>)}
                </div>}
            </> : <p className={styles.empty}>No picks have a later {samePosition ? 'same-position ' : ''}selection at least {MIN_REGRET_GAP} FPts ahead.</p>}
        </> : view === 'redraft' ? <>
            <div className={styles.table} role="table" aria-label="Original draft versus hindsight redraft">
                <div role="row" className={`${styles.redraftRow} ${styles.redraftHead}`}>
                    <span role="columnheader">Drafted</span><span role="columnheader">Original selection</span><span role="columnheader">Redraft by FPts</span>
                </div>
                {board.slice(0, limit).map(({ original, redrafted }) => <div role="row" className={styles.redraftRow} key={original.overall}>
                    <span role="cell" className={styles.slot} aria-label={`Drafted ${original.overall} overall`}><small className={styles.mobile}>Drafted</small>#{original.overall}</span>
                    <div role="cell" className={styles.originalSelection}>
                        <span className={styles.cellLabel}>Original selection</span>
                        {original.playerId ? <div className={styles.selectionScore}><Player pick={original} /><strong>{original.points === null ? '—' : formatFpts(original.points)}<small>FPts</small></strong></div> : <span className={styles.unranked}>No selection recorded</span>}
                        <div className={styles.draftedBy}><span>{original.playerId ? 'Drafted by' : 'Slot held by'}</span><Team pick={original} /></div>
                    </div>
                    <div role="cell" className={styles.redraftSelection}>
                        <span className={styles.cellLabel}>Redraft by FPts</span>
                        {redrafted ? <>
                            <div className={styles.selectionScore}><Player pick={redrafted} /><strong>{formatFpts(redrafted.value)}<small>FPts</small></strong></div>
                            <div className={styles.draftedBy}><span>Originally drafted by</span><Team pick={redrafted} /></div>
                            <span className={styles.originalNumber}><Movement value={redrafted.overall - original.overall} originalOverall={redrafted.overall} /></span>
                        </> : <span className={styles.unranked}>{original.playerId ? 'Unranked · no season stats' : 'Empty slot'}</span>}
                    </div>
                </div>)}
            </div>
            {board.length > limit && <button type="button" className={styles.showAll} onClick={() => setLimit(board.length)}>Show all {board.length} draft slots</button>}
        </> : <>
            {star && <div className={styles.spotlight}>
                <div><span className={styles.eyebrow}>Biggest climb</span><h3><Player pick={star} /></h3><Team pick={star} /><p>{formatFpts(star.value)} FPts · {splitPositions(star.positions).join(' · ')}</p></div>
                <div className={styles.climb}><div><span>Drafted</span><strong>#{star.overall}</strong></div><span aria-hidden="true">→</span><div><span>FPts rank</span><strong>#{star.rank}</strong></div></div>
            </div>}
            {steals.length ? <div className={styles.table} role="table" aria-label="Draft steals">
                <div role="row" className={`${styles.row} ${styles.tableHead}`}><span role="columnheader">Draft pick</span><span role="columnheader">Player</span><span role="columnheader" className={styles.desktop}>FPts rank</span><span role="columnheader">FPts</span><span role="columnheader">Rise</span></div>
                {steals.slice(0, limit).map(p => <div role="row" className={styles.row} key={p.overall}>
                    <span role="cell" className={styles.pickNumber}>{p.overall}</span>
                    <span role="cell" className={styles.playerCell}><Player pick={p} /><span className={styles.rowMeta}><span>{p.teamAbbreviation ?? p.teamName} · {splitPositions(p.positions).join('/')}</span><span className={styles.mobile}>FPts rank #{p.rank}</span></span></span>
                    <span role="cell" className={styles.desktop}>#{p.rank}</span>
                    <strong role="cell" className={styles.points}>{formatFpts(p.value)}</strong><span role="cell"><Movement value={p.movement} /></span>
                </div>)}
                {steals.length > limit && <button type="button" className={styles.showAll} onClick={() => setLimit(steals.length)}>Show all {steals.length} climbers</button>}
            </div> : <p className={styles.empty}>No selections gained places in this view.</p>}
        </>}
    </div>;
}
