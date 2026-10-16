'use client';

import Link from 'next/link';
import { useState } from 'react';
import TeamBadge from '@/components/team-badge';
import type { SeasonDraftSelection } from '@/lib/history/model';
import { draftRegrets, laterAlternatives, rankDraft, type DraftHindsightData, type DraftView, type DraftWindow, type RankedPick } from '@/lib/draft/hindsight';
import { formatFpts, seasonLabel, splitPositions } from '@/lib/league';
import styles from './draft-hindsight.module.css';

function Player({ pick }: { pick: RankedPick }) {
    return <Link href={`/player/${encodeURIComponent(pick.playerId!)}`} className={styles.player}>{pick.player}</Link>;
}

function Team({ pick }: { pick: SeasonDraftSelection }) {
    return <span className={styles.team}>
        <TeamBadge logo={pick.teamLogo} abbreviation={pick.teamAbbreviation} teamName={pick.teamName} size={22} ring="none" />
        {pick.franchiseId ? <Link href={`/teams/${pick.franchiseId}#draft-history`}>{pick.teamName}</Link> : 'No team recorded'}
    </span>;
}

function Movement({ value }: { value: number }) {
    return <span className={styles.movement} data-direction={value > 0 ? 'up' : value < 0 ? 'down' : 'same'}
        aria-label={value > 0 ? `Up ${value} places` : value < 0 ? `Down ${-value} places` : 'Unchanged'}>{value > 0 ? `+${value}` : value < 0 ? `−${-value}` : '—'}</span>;
}

export default function DraftHindsight({ year, picks, data, view, team, onTeamChange, initialPick }: {
    year: number; picks: SeasonDraftSelection[]; data: DraftHindsightData; view: Exclude<DraftView, 'board'>;
    team: string; onTeamChange: (team: string) => void; initialPick?: number;
}) {
    const [window, setWindow] = useState<DraftWindow>('season');
    const [samePosition, setSamePosition] = useState(true);
    const [selectedPick, setSelectedPick] = useState(initialPick ?? 0);
    const [limit, setLimit] = useState(10);
    const teams = [...new Map(picks.filter(p => p.franchiseId !== null).map(p => [String(p.franchiseId), p.teamName!])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const activeTeam = teams.some(([id]) => id === team) ? team : 'all';
    const ranked = rankDraft(picks, data.production, window);
    const teamPicks = ranked.filter(p => activeTeam === 'all' || String(p.franchiseId) === activeTeam);
    const steals = [...teamPicks].filter(p => p.movement > 0).sort((a, b) => b.movement - a.movement || b.value - a.value || a.overall - b.overall);
    const regrets = draftRegrets(ranked, samePosition).filter(r => activeTeam === 'all' || String(r.pick.franchiseId) === activeTeam);
    const reviewed = teamPicks.find(p => p.overall === selectedPick) ?? regrets[0]?.pick ?? teamPicks[0];
    const alternatives = reviewed ? laterAlternatives(reviewed, ranked, samePosition) : [];
    const best = alternatives[0];
    const listed = view === 'steals' ? steals : teamPicks;
    const star = steals[0];

    function changeTeam(value: string) {
        onTeamChange(value); setSelectedPick(0); setLimit(10);
        const url = new URL(location.href);
        url.searchParams.set('team', value); url.searchParams.delete('pick');
        history.replaceState(null, '', url);
    }
    function review(overall: number) {
        setSelectedPick(overall);
        const url = new URL(location.href);
        url.searchParams.set('pick', String(overall));
        history.replaceState(null, '', url);
    }

    return <div className={styles.review}>
        <div className={styles.controls}>
            <div className={styles.window} aria-label="Production window">
                <button type="button" aria-pressed={window === 'season'} onClick={() => { setWindow('season'); setLimit(10); }}>Draft season</button>
                {data.latestYear > year && <button type="button" aria-pressed={window === 'since'} onClick={() => { setWindow('since'); setLimit(10); }}>Since draft</button>}
            </div>
            <label className={styles.teamFilter}><span className="sr-only">Hindsight drafting team</span><select value={activeTeam} onChange={e => changeTeam(e.target.value)}>
                <option value="all">All teams</option>{teams.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select></label>
        </div>
        <div className={styles.context}>
            <p>{window === 'season' ? seasonLabel(year) : `${seasonLabel(year)} to ${seasonLabel(data.latestYear)}`} · {window === 'since' ? 'Recorded FPts' : 'Full-season FPts'}</p>
            <p>{ranked.length} of {picks.filter(p => p.playerId).length} selected players ranked</p>
        </div>

        {view === 'regrets' ? <>
            <div className={styles.regretControls}>
                <label>Review a pick<select value={reviewed?.overall ?? ''} onChange={e => review(Number(e.target.value))} disabled={!teamPicks.length}>
                    {!teamPicks.length && <option value="">No picks with stats</option>}
                    {[...teamPicks].sort((a, b) => a.overall - b.overall).map(p => <option key={p.overall} value={p.overall}>#{p.overall} · {p.player}</option>)}
                </select></label>
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
            </> : <p className={styles.empty}>No recorded stats for these selections.</p>}
        </> : <>
            {view === 'steals' && star && <div className={styles.spotlight}>
                <div><span className={styles.eyebrow}>Biggest climb{activeTeam !== 'all' ? ' · selected team' : ''}</span><h3><Player pick={star} /></h3><Team pick={star} /><p>{formatFpts(star.value)} FPts · {splitPositions(star.positions).join(' · ')}</p></div>
                <div className={styles.climb}><div><span>Drafted</span><strong>#{star.overall}</strong></div><span aria-hidden="true">→</span><div><span>FPts rank</span><strong>#{star.rank}</strong></div><p>Up {star.movement} places</p></div>
            </div>}
            <div className={styles.listHeading}><h3>{view === 'steals' ? 'Biggest climbs' : 'The hindsight order'}</h3><span>{view === 'steals' ? 'Draft pick − FPts rank' : 'Drafted players, sorted by FPts'}</span></div>
            {listed.length ? <div className={styles.table} role="table" aria-label={view === 'steals' ? 'Draft steals' : 'Hindsight redraft'}>
                <div role="row" className={`${styles.row} ${styles.tableHead}`}><span role="columnheader">{view === 'steals' ? 'Pick' : 'Rank'}</span><span role="columnheader">Player</span><span role="columnheader" className={styles.desktop}>{view === 'steals' ? 'Rank' : 'Pick'}</span><span role="columnheader">FPts</span><span role="columnheader">Rise</span></div>
                {listed.slice(0, limit).map(p => <div role="row" className={styles.row} key={p.overall}>
                    <span role="cell" className={styles.pickNumber}>{view === 'steals' ? p.overall : p.rank}</span>
                    <span role="cell" className={styles.playerCell}><Player pick={p} /><span className={styles.rowMeta}><span>{p.teamAbbreviation ?? p.teamName} · {splitPositions(p.positions).join('/')}</span><span className={styles.mobile}>{view === 'steals' ? `Rank #${p.rank}` : `Pick #${p.overall}`}</span></span></span>
                    <span role="cell" className={styles.desktop}>#{view === 'steals' ? p.rank : p.overall}</span>
                    <strong role="cell" className={styles.points}>{formatFpts(p.value)}</strong><span role="cell"><Movement value={p.movement} /></span>
                </div>)}
                {listed.length > limit && <button type="button" className={styles.showAll} onClick={() => setLimit(listed.length)}>Show all {listed.length} {view === 'steals' ? 'climbers' : 'players'}</button>}
            </div> : <p className={styles.empty}>{view === 'steals' ? 'No selections gained places in this view.' : 'No recorded stats for these selections.'}</p>}
        </>}
        <details className={styles.method}><summary>How this works</summary>
            <p>FPts cover full seasons, regardless of roster moves. Since draft adds recorded seasons through {seasonLabel(data.latestYear)}, including the draft season. Missing stats are not treated as zero.</p>
            <p>Ranks compare selected players with recorded stats across the whole class and stay the same when filtering a team. Empty draft slots are excluded. Equal FPts share a rank. Rise is the original overall pick minus that rank.</p>
            <p>Regrets compare only players selected later in this draft. Same position uses the positions in the draft export. This redraft orders players by production; it does not recreate keeper decisions or roster requirements.</p>
        </details>
    </div>;
}
