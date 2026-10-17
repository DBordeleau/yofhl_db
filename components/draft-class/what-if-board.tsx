'use client';

import { playerHref } from '@/lib/player-url';

import Link from 'next/link';
import { Fragment, useEffect, useRef, useState } from 'react';
import TeamBadge from '@/components/team-badge';
import { draftRegrets, laterAlternatives, type RankedPick } from '@/lib/draft/hindsight';
import type { SeasonDraftSelection } from '@/lib/history/model';
import { formatFpts } from '@/lib/league';
import { boardLayout, heatScale, lastName } from './board';
import FptsLegend from './fpts-legend';
import styles from './draft-class.module.css';

const CHIP_LIMIT = 8;

// Pick a regret; the board lights up the pick, the best same-position player still available, and the picks in between.
export default function WhatIfBoard({ picks, ranked, initialPick }: { picks: SeasonDraftSelection[]; ranked: RankedPick[]; initialPick?: number }) {
    const [samePosition, setSamePosition] = useState(true);
    const [chosen, setChosen] = useState(initialPick ?? 0);
    const [showAll, setShowAll] = useState(false);
    const [peek, setPeek] = useState<number | null>(null);
    const scroller = useRef<HTMLDivElement>(null);
    const regrets = draftRegrets(ranked, samePosition);
    const regret = regrets.find(r => r.pick.overall === chosen) ?? regrets[0];
    const { columns, rows } = boardLayout(picks);

    // when the board scrolls sideways (narrow screens), bring the pick and its alternative into view
    const focusKey = regret ? `${regret.pick.overall}-${regret.alternative.overall}` : '';
    useEffect(() => {
        const box = scroller.current;
        if (!box || box.scrollWidth <= box.clientWidth) return;
        const cells = [...box.querySelectorAll<HTMLElement>("[data-role='pick'], [data-role='alt']")];
        if (!cells.length) return;
        const frame = box.getBoundingClientRect();
        const lefts = cells.map(cell => cell.getBoundingClientRect().left - frame.left + box.scrollLeft);
        const rights = cells.map(cell => cell.getBoundingClientRect().right - frame.left + box.scrollLeft);
        const start = Math.min(...lefts), end = Math.max(...rights);
        const target = end - start < box.clientWidth - 48 ? (start + end - box.clientWidth) / 2 : lefts[0] - 40;
        box.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    }, [focusKey]);
    const heat = heatScale(picks);

    function choose(overall: number) {
        setChosen(overall);
        setPeek(null);
        const url = new URL(location.href);
        url.searchParams.set('pick', String(overall));
        history.replaceState(null, '', url);
    }

    const head = <div className={styles.subhead}>
        <div>
            <h3 className={styles.subtitle}>The what-if board</h3>
        </div>
        <label className={styles.checkbox}><input type="checkbox" checked={samePosition} onChange={e => setSamePosition(e.target.checked)} /> Same position only</label>
    </div>;

    if (!regret) return <section className={styles.view} aria-label="Draft regrets">
        {head}
        <p className={styles.empty}>No eligible pick left a {samePosition ? 'same-position ' : ''}player at least 100 FPts better on the board.</p>
    </section>;

    const { pick, alternative, gap } = regret;
    const also = laterAlternatives(pick, ranked, samePosition).slice(1, 3).map(p => p.overall);
    const visible = showAll ? regrets : regrets.slice(0, CHIP_LIMIT);
    if (!visible.includes(regret)) visible.push(regret);

    return <section className={styles.view} aria-label="Draft regrets">
        {head}
        <div role="group" aria-label="Regrets" className={styles.chips}>
            {visible.map(r => <button key={r.pick.overall} type="button" className={styles.chip} aria-pressed={r === regret} onClick={() => choose(r.pick.overall)}>
                <TeamBadge logo={r.pick.teamLogo} abbreviation={r.pick.teamAbbreviation} teamName={r.pick.teamName} size={32} ring="none" />
                #{r.pick.overall} {lastName(r.pick.player)}
                <span className={styles.chipGap}>−{formatFpts(r.gap)}</span>
            </button>)}
            {regrets.length > CHIP_LIMIT && <button type="button" className={`${styles.chip} ${styles.moreChip}`} onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Show fewer' : `Show all ${regrets.length}`}
            </button>}
        </div>

        <div className={styles.whatIf}>
            <div className={styles.panel}>
                <div className={styles.wiLegends}>
                    <div className={styles.wiLegend}>
                        <span><span className={styles.swatch} style={{ background: '#c8102e' }} />The pick</span>
                        <span><span className={styles.swatch} style={{ background: '#f0c75e' }} />Best still available</span>
                        <span><span className={styles.swatch} style={{ background: '#fff', boxShadow: 'inset 0 0 0 2px #c99a3e' }} />Also available</span>
                    </div>
                    <FptsLegend labels={heat.labels} />
                </div>
                <div ref={scroller} className={styles.scroll}>
                    <div className={`${styles.grid} ${styles.wiGrid}`} style={{ '--cols': columns } as React.CSSProperties}>
                        <span aria-hidden="true" />
                        {Array.from({ length: columns }, (_, index) => <span key={index} className={styles.colHead} aria-hidden="true">{index + 1}</span>)}
                        {rows.map(row => <Fragment key={row.round}>
                            <span className={styles.roundLabel}>R{row.round}</span>
                            {row.cells.map((cell, index) => {
                                if (!cell) return <div key={index} className={styles.cell} data-empty="" data-outside="" />;
                                const o = cell.overall;
                                const role = o === pick.overall ? 'pick' : o === alternative.overall ? 'alt' : also.includes(o) ? 'also' : undefined;
                                const outside = !role && (o < pick.overall || o > alternative.overall);
                                return <button key={index} type="button" className={styles.cell} onClick={() => setPeek(o)}
                                    aria-label={cell.player ? `${o}. ${cell.player}${cell.points === null ? '' : `, ${formatFpts(cell.points)} FPts`}` : `${o}. No selection recorded`}
                                    title={cell.player ? `#${o} ${cell.player} · ${cell.teamName ?? ''}` : `#${o}`}
                                    data-role={role} data-outside={outside ? '' : undefined} data-peek={peek === o ? '' : undefined}
                                    data-empty={cell.playerId ? undefined : ''} data-level={heat.level(cell.points) ?? undefined}>
                                    <span className={styles.cellTop}>
                                        {cell.playerId ? <TeamBadge logo={cell.teamLogo} abbreviation={cell.teamAbbreviation} teamName={cell.teamName} size={16} ring="none" /> : <span />}
                                        <span className={styles.cellNum}>{o}</span>
                                    </span>
                                    <span className={`${styles.cellName} ${styles.trunc}`}>{lastName(cell.player)}</span>
                                    <span className={styles.cellMeta}><span>{cell.points === null ? '' : formatFpts(cell.points)}</span></span>
                                </button>;
                            })}
                        </Fragment>)}
                    </div>
                </div>
            </div>

            <aside className={styles.faceoff} aria-live="polite">
                <div className={styles.foPick}>
                    <div className={styles.eyebrow}>The pick · #{pick.overall}</div>
                    <Link href={playerHref(pick.playerId!)} className={styles.foName}>{pick.player}</Link>
                    <div className={styles.foMeta}>
                        <TeamBadge logo={pick.teamLogo} abbreviation={pick.teamAbbreviation} teamName={pick.teamName} size={20} ring="none" />
                        <span>{pick.teamName} · {formatFpts(pick.value)} FPts</span>
                    </div>
                </div>
                <div className={styles.foAlt}>
                    <div className={styles.eyebrow}>Lasted {alternative.overall - pick.overall} more {alternative.overall - pick.overall === 1 ? 'pick' : 'picks'} · #{alternative.overall}</div>
                    <Link href={playerHref(alternative.playerId!)} className={styles.foName}>{alternative.player}</Link>
                    <div className={styles.foMeta}>
                        <TeamBadge logo={alternative.teamLogo} abbreviation={alternative.teamAbbreviation} teamName={alternative.teamName} size={20} ring="none" />
                        <span>{alternative.teamName} · {formatFpts(alternative.value)} FPts</span>
                    </div>
                </div>
                <div className={styles.foGap}>
                    <div className={styles.eyebrow}>Left on the board</div>
                    <div className={styles.gapValue}>+{formatFpts(gap)}</div>
                    <div className={styles.gapUnit}>fantasy points</div>
                </div>
            </aside>
        </div>
    </section>;
}
