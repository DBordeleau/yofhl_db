'use client';

import { playerHref } from '@/lib/player-url';

import Link from 'next/link';
import { Fragment, useState } from 'react';
import SearchBar from '@/components/search-bar';
import TeamBadge from '@/components/team-badge';
import type { RankedPick } from '@/lib/draft/hindsight';
import type { SeasonDraftSelection } from '@/lib/history/model';
import { formatFpts, splitPositions } from '@/lib/league';
import { boardLayout, heatScale, lastName } from './board';
import FptsLegend from './fpts-legend';
import styles from './draft-class.module.css';

const POSITIONS = ['All', 'C', 'LW', 'RW', 'D', 'G'];

// Every pick as drafted: rounds down, pick-in-round across, shaded by season FPts.
export default function DraftBoard({ picks, ranked, initialTeam }: {
    picks: SeasonDraftSelection[]; ranked: RankedPick[]; initialTeam?: string;
}) {
    const [team, setTeam] = useState<string | null>(initialTeam ?? null);
    const [position, setPosition] = useState('All');
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(ranked[0]?.overall ?? picks.find(pick => pick.playerId)?.overall ?? 0);
    const { columns, rows } = boardLayout(picks);
    const heat = heatScale(picks);
    // teams in draft order, each once
    const teams = [...new Map([...picks].sort((a, b) => a.overall - b.overall)
        .filter(pick => pick.franchiseId !== null).map(pick => [String(pick.franchiseId), pick])).values()];
    const search = query.trim().toLowerCase();
    const matches = (pick: SeasonDraftSelection) => (!team || String(pick.franchiseId) === team)
        && (position === 'All' || splitPositions(pick.positions ?? '').includes(position))
        && (!search || (pick.player ?? '').toLowerCase().includes(search));
    const detail = picks.find(pick => pick.overall === selected && pick.playerId);
    const rank = ranked.find(pick => pick.overall === selected)?.rank;

    return <div className={styles.view}>
        <p className={styles.lede}>Filter by team or position, or tap a pick for details.</p>

        <div className={styles.filters}>
            <div role="group" aria-label="Drafting team" className={styles.teamFilter}>
                {teams.map(pick => {
                    const id = String(pick.franchiseId);
                    return <button key={id} type="button" className={styles.teamButton} aria-pressed={team === id} aria-label={pick.teamName ?? undefined}
                        title={pick.teamName ?? undefined} data-dim={team && team !== id ? '' : undefined} onClick={() => setTeam(team === id ? null : id)}>
                        <TeamBadge logo={pick.teamLogo} abbreviation={pick.teamAbbreviation} teamName={pick.teamName} size={42} ring="none" />
                    </button>;
                })}
            </div>
            <div className={styles.filterRight}>
                <div role="group" aria-label="Position" className={styles.positions}>
                    {POSITIONS.map(value => <button key={value} type="button" className={styles.posButton} aria-pressed={position === value} onClick={() => setPosition(value)}>{value}</button>)}
                </div>
                <SearchBar searchQuery={query} setSearchQuery={setQuery} placeholder="Search draft picks" className="w-full md:w-60" />
            </div>
        </div>

        <div className={styles.panel}>
            <div className={styles.scroll}>
                <div className={`${styles.grid} ${styles.boardGrid}`} style={{ '--cols': columns } as React.CSSProperties}>
                    <span aria-hidden="true" />
                    {Array.from({ length: columns }, (_, index) => <span key={index} className={styles.colHead} aria-hidden="true">{index + 1}</span>)}
                    {rows.map(row => boardRow(row.round, row.cells))}
                </div>
            </div>
            <FptsLegend labels={heat.labels} />
        </div>

        {detail && <div className={styles.detail} aria-live="polite">
            <span className={styles.slant}>#{detail.overall}</span>
            <TeamBadge logo={detail.teamLogo} abbreviation={detail.teamAbbreviation} teamName={detail.teamName} size={52} ring="none" />
            <div className={styles.detailWho}>
                <Link href={playerHref(detail.playerId!)} className={styles.detailName}>{detail.player}</Link>
                <div className={styles.detailMeta}>
                    {detail.franchiseId ? <Link href={`/teams/${detail.franchiseId}`}>{detail.teamName}</Link> : 'No team recorded'}
                    {detail.positions && ` · ${splitPositions(detail.positions).join(' · ')}`} · Round {detail.round}, pick {detail.pick}
                </div>
            </div>
            <div className={styles.stats}>
                <div><div className={styles.statValue}>{detail.points === null ? '—' : formatFpts(detail.points)}</div><div className={styles.statLabel}>FPTS</div></div>
                <div><div className={styles.statValue}>{detail.fpg === null ? '—' : detail.fpg.toFixed(2)}</div><div className={styles.statLabel}>FP/G</div></div>
                <div><div className={`${styles.statValue} ${styles.gold}`}>{rank ? `#${rank}` : '—'}</div><div className={styles.statLabel}>FPTS FINISH</div></div>
            </div>
        </div>}
    </div>;

    function boardRow(round: number, cells: (SeasonDraftSelection | null)[]) {
        return <Fragment key={round}>
            <span className={styles.roundLabel}>R{round}</span>
            {cells.map((pick, index) => {
                if (!pick?.playerId) return <div key={index} className={styles.cell} data-empty="" data-dim={pick && !matches(pick) ? '' : undefined}
                    title={pick ? `#${pick.overall} · no selection recorded` : undefined}>
                    {pick && <div className={styles.cellTop}><span /><span className={styles.cellNum}>{pick.overall}</span></div>}
                </div>;
                return <button key={index} type="button" className={styles.cell} aria-pressed={pick.overall === selected}
                    aria-label={`${pick.overall}. ${pick.player}`} title={`${pick.player} · ${pick.teamName ?? ''}`}
                    data-level={heat.level(pick.points) ?? undefined} data-dim={matches(pick) ? undefined : ''} onClick={() => setSelected(pick.overall)}>
                    <span className={styles.cellTop}>
                        <TeamBadge logo={pick.teamLogo} abbreviation={pick.teamAbbreviation} teamName={pick.teamName} size={20} ring="none" />
                        <span className={styles.cellNum}>{pick.overall}</span>
                    </span>
                    <span className={`${styles.cellName} ${styles.trunc}`}>{lastName(pick.player)}</span>
                    <span className={styles.cellMeta}><span>{splitPositions(pick.positions ?? '').join('/')}</span><span>{pick.points === null ? '' : formatFpts(pick.points)}</span></span>
                </button>;
            })}
        </Fragment>;
    }
}
