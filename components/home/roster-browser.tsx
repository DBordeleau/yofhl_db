'use client';

import { playerHref } from '@/lib/player-url';

import Link from 'next/link';
import { useEffect, useState, type CSSProperties } from 'react';
import TeamBadge from '@/components/team-badge';
import TeamBranding from '@/components/team-branding/team-branding';
import { periodLabel, rosterGroup, sortRosterPlayers, type Period, type RosterStats, type SnapshotPlayer, type SnapshotTeam } from '@/lib/fantrax/model';
import { formatFpts } from '@/lib/league';
import styles from './home.module.css';
import Arrow from '@/components/arrow';
import { broadcastType } from './broadcast-type';

const positions = [
    { key: 'LW', label: 'Left wing' }, { key: 'C', label: 'Centre' }, { key: 'RW', label: 'Right wing' },
    { key: 'D', label: 'Defence' }, { key: 'G', label: 'Goaltenders' },
];
const additionalGroups = [
    { key: 'MINORS', label: 'Prospects' }, { key: 'OTHER', label: 'Other roster slots' },
];

function Player({ player, stats, share, order }: { player: SnapshotPlayer; stats: RosterStats['players'][string] | undefined; share: number; order: number }) {
    const showPosition = ['MINORS', 'OTHER'].includes(rosterGroup(player));
    const content = <>
        <div className={styles.playerDetails}>
            <div className={styles.playerIdentity}>
                <span>{player.name}</span>
                {player.status === 'INJURED_RESERVE' ? <span className={styles.irBadge} title="Injured reserve" aria-label="Injured reserve">IR</span> : null}
            </div>
            <span className={styles.playerClub}>{showPosition ? `${player.position.replace(/,/g, '/')} · ` : ''}{player.nhlTeam === '(N/A)' ? 'FA' : player.nhlTeam}</span>
        </div>
        <dl className={styles.playerStats}>
            <div><dt className="sr-only">Fantasy points</dt><dd>{stats?.points == null ? <span aria-label="Unavailable">—</span> : formatFpts(stats.points)}</dd></div>
            <div><dt className="sr-only">Fantasy points per game</dt><dd>{stats?.perGame == null ? <span aria-label="Unavailable">—</span> : formatFpts(stats.perGame)}</dd></div>
        </dl>
    </>;
    return <li style={{ '--share': share, '--order': order } as CSSProperties}>
        {player.archiveId ? <Link href={playerHref(player.archiveId)} className={styles.playerRow} aria-label={player.name}>{content}</Link> : <div className={styles.playerRow}>{content}</div>}
    </li>;
}

// the stat labels sit once in each group's header, lined up over every column of rows below it
function GroupHeading({ code, label, columns = 1, filled = columns }: { code?: string; label: string; columns?: number; filled?: number }) {
    const heads = <span className={styles.statHeads} aria-hidden="true"><abbr title="Fantasy points">FPTS</abbr><abbr title="Fantasy points per game">FP/G</abbr></span>;
    return <div className={styles.groupHead}>
        {Array.from({ length: columns }, (_, index) => <div className={styles.groupHeadCell} key={index}>
            {index ? null : <h4>{code ? <span className={styles.positionCode} aria-hidden="true">{code}</span> : null}<span>{label}</span></h4>}
            {index < filled ? heads : null}
        </div>)}
    </div>;
}

export default function RosterBrowser({ teams, rosterPeriod, initialFranchiseId, stats }: { teams: SnapshotTeam[]; rosterPeriod: Period | null; initialFranchiseId?: number; stats: RosterStats | null }) {
    const [selectedId, setSelectedId] = useState(() => teams.find(team => team.franchiseId === initialFranchiseId)?.id ?? teams[0]?.id);
    useEffect(() => {
        const readSelection = () => {
            const franchiseId = Number(new URLSearchParams(window.location.search).get('roster'));
            setSelectedId(teams.find(team => team.franchiseId === franchiseId)?.id ?? teams[0]?.id);
        };
        readSelection();
        window.addEventListener('popstate', readSelection);
        return () => window.removeEventListener('popstate', readSelection);
    }, [teams]);
    const selectedIndex = Math.max(0, teams.findIndex(team => team.id === selectedId));
    const selected = teams[selectedIndex];
    if (!selected) return null;
    const players = sortRosterPlayers(selected.players, stats);
    const grouped = [...positions, ...additionalGroups].map(group => ({ ...group, players: players.filter(player => rosterGroup(player) === group.key) }));
    const changeTeam = (direction: number) => setSelectedId(teams[(selectedIndex + direction + teams.length) % teams.length].id);
    // each row's bar is its share of the roster's top scorer, so lines compare across positions at a glance
    const topPoints = Math.max(0, ...selected.players.map(player => stats?.players[player.id]?.points ?? 0));
    const player = (item: SnapshotPlayer, order: number) => {
        const line = stats?.players[item.id];
        return <Player key={item.id} player={item} stats={line} order={order} share={topPoints > 0 ? Math.max(0, line?.points ?? 0) / topPoints : 0} />;
    };

    return <section id="rosters" className={`${styles.rosterSection} ${broadcastType.variable}`} aria-labelledby="roster-heading" tabIndex={-1}>
        <div className={styles.sectionHeading}>
            <h2 id="roster-heading">Team rosters</h2>
            <div className={styles.rosterControls}>
                <button type="button" aria-label="Previous team roster" disabled={teams.length < 2} onClick={() => changeTeam(-1)}><Arrow direction="left" /></button>
                <div className={styles.teamPicker}>
                    <label className="sr-only" htmlFor="roster-team">Select a team roster</label>
                    <select id="roster-team" value={selected.id} onChange={event => setSelectedId(event.target.value)}>{teams.map(team => <option value={team.id} key={team.id}>{team.name}</option>)}</select>
                    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.8" /></svg>
                </div>
                <button type="button" aria-label="Next team roster" disabled={teams.length < 2} onClick={() => changeTeam(1)}><Arrow /></button>
            </div>
        </div>
        <TeamBranding key={selected.id} teamId={selected.franchiseId} data-brand-layout="roster" className={`${styles.rosterSheet} ${styles.rosterBranding}`}>
            <header data-brand-part="surface" className={styles.rosterHeader}>
                <span className={styles.rosterWatermark} aria-hidden="true">{selected.abbreviation}</span>
                <TeamBadge logo={selected.logo} abbreviation={selected.abbreviation} teamName={selected.name} size={88} ring="none" />
                <div className={styles.rosterIdentity} aria-live="polite">
                    <h3>{selected.franchiseId ? <Link href={`/teams/${selected.franchiseId}`} className={styles.rosterTitleLink}>{selected.name}</Link> : selected.name}</h3>
                    <p>{selected.players.length} players</p>
                </div>
            </header>
            <div data-brand-part="stripes" className={styles.rosterStripes} aria-hidden="true" />
            {selected.players.length ? <div className={styles.rosterBody}>
                <div className={styles.lineupGrid}>
                    {grouped.slice(0, positions.length).map(group => <section className={`${styles.positionGroup} ${group.key === 'D' ? styles.defenceGroup : ''}`} key={group.key} aria-label={group.label}>
                        <GroupHeading code={group.key} label={group.label} columns={group.key === 'D' ? 2 : 1} filled={Math.max(1, group.players.length)} />
                        {group.players.length ? <ul>{group.players.map(player)}</ul> : <p className={styles.emptyPosition}>No players</p>}
                    </section>)}
                </div>
                {grouped.slice(positions.length).filter(group => group.players.length).map(group => <section className={styles.additionalGroup} key={group.key} aria-label={group.label}>
                    <GroupHeading label={group.label} columns={3} filled={group.players.length} />
                    <ul>{group.players.map(player)}</ul>
                </section>)}
            </div> : <p className={styles.emptyState}>No roster available.</p>}
            <div className={styles.rosterFooter}>
                <span>{rosterPeriod ? `Lineup period ${rosterPeriod.number} · ${periodLabel(rosterPeriod)}` : 'Fantrax roster'}</span>
            </div>
        </TeamBranding>
    </section>;
}
