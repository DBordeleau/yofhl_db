'use client';

import Link from 'next/link';
import { useState } from 'react';
import TeamBadge from '@/components/team-badge';
import TeamBranding from '@/components/team-branding/team-branding';
import { periodLabel, rosterGroup, type Period, type SnapshotPlayer, type SnapshotTeam } from '@/lib/fantrax/model';
import styles from './home.module.css';

const positions = [
    { key: 'LW', label: 'Left wing' }, { key: 'C', label: 'Centre' }, { key: 'RW', label: 'Right wing' },
    { key: 'D', label: 'Defence' }, { key: 'G', label: 'Goaltenders' },
];
const additionalGroups = [
    { key: 'MINORS', label: 'Minors' }, { key: 'OTHER', label: 'Other roster slots' },
];

function Player({ player }: { player: SnapshotPlayer }) {
    const showPosition = ['MINORS', 'OTHER'].includes(rosterGroup(player));
    return <li className={styles.playerRow}>
        <div className={styles.playerIdentity}>
            {player.archiveId ? <Link href={`/player/${encodeURIComponent(player.archiveId)}`}>{player.name}</Link> : <span>{player.name}</span>}
            {player.status === 'INJURED_RESERVE' ? <span className={styles.irBadge} title="Injured reserve" aria-label="Injured reserve">IR</span> : null}
        </div>
        <span className={styles.playerClub}>{showPosition ? `${player.position.replace(/,/g, '/')} · ` : ''}{player.nhlTeam === '(N/A)' ? 'FA' : player.nhlTeam}</span>
    </li>;
}

export default function RosterBrowser({ teams, rosterPeriod, initialFranchiseId }: { teams: SnapshotTeam[]; rosterPeriod: Period | null; initialFranchiseId?: number }) {
    const [selectedId, setSelectedId] = useState(() => teams.find(team => team.franchiseId === initialFranchiseId)?.id ?? teams[0]?.id);
    const selectedIndex = Math.max(0, teams.findIndex(team => team.id === selectedId));
    const selected = teams[selectedIndex];
    if (!selected) return null;
    const grouped = [...positions, ...additionalGroups].map(group => ({ ...group, players: selected.players.filter(player => rosterGroup(player) === group.key) }));
    const changeTeam = (direction: number) => setSelectedId(teams[(selectedIndex + direction + teams.length) % teams.length].id);

    return <section id="rosters" className={styles.rosterSection} aria-labelledby="roster-heading" tabIndex={-1}>
        <div className={styles.sectionHeading}>
            <h2 id="roster-heading">Team rosters</h2>
            <div className={styles.rosterControls}>
                <button type="button" aria-label="Previous team roster" disabled={teams.length < 2} onClick={() => changeTeam(-1)}><span aria-hidden="true">←</span></button>
                <div className={styles.teamPicker}>
                    <label className="sr-only" htmlFor="roster-team">Select a team roster</label>
                    <select id="roster-team" value={selected.id} onChange={event => setSelectedId(event.target.value)}>{teams.map(team => <option value={team.id} key={team.id}>{team.name}</option>)}</select>
                    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.8" /></svg>
                </div>
                <button type="button" aria-label="Next team roster" disabled={teams.length < 2} onClick={() => changeTeam(1)}><span aria-hidden="true">→</span></button>
            </div>
        </div>
        <div className={styles.rosterPanel}>
            <div key={selected.id} className={styles.rosterSheet}>
                <TeamBranding teamId={selected.franchiseId} data-brand-layout="roster" className={styles.rosterBranding}>
                    <header data-brand-part="surface" className={styles.rosterHeader}>
                        <span className={styles.rosterWatermark} aria-hidden="true">{selected.abbreviation}</span>
                        <TeamBadge logo={selected.logo} abbreviation={selected.abbreviation} teamName={selected.name} size={88} ring="none" />
                        <div className={styles.rosterIdentity} aria-live="polite">
                            <h3>{selected.franchiseId ? <Link href={`/teams/${selected.franchiseId}`} className={styles.rosterTitleLink}>{selected.name}</Link> : selected.name}</h3>
                            <p>{selected.owner ? <><span>{selected.owner}</span><span aria-hidden="true"> / </span></> : null}{selected.players.length} players</p>
                        </div>
                    </header>
                    <div data-brand-part="stripes" className={styles.rosterStripes} aria-hidden="true" />
                </TeamBranding>
                {selected.players.length ? <div className={styles.rosterBody}>
                    <div className={styles.lineupGrid}>
                        {grouped.slice(0, positions.length).map(group => <section className={`${styles.positionGroup} ${group.key === 'D' ? styles.defenceGroup : ''}`} key={group.key} aria-label={group.label}>
                            <h4>{group.label}<span className={styles.groupCount}>{group.players.length}</span></h4>
                            {group.players.length ? <ul>{group.players.map(player => <Player key={player.id} player={player} />)}</ul> : <p className={styles.emptyPosition}>No players</p>}
                        </section>)}
                    </div>
                    {grouped.slice(positions.length).filter(group => group.players.length).map(group => <section className={styles.additionalGroup} key={group.key} aria-label={group.label}>
                        <h4>{group.label}<span className={styles.groupCount}>{group.players.length}</span></h4>
                        <ul>{group.players.map(player => <Player key={player.id} player={player} />)}</ul>
                    </section>)}
                </div> : <p className={styles.emptyState}>No roster available.</p>}
            </div>
            <div className={styles.rosterFooter}>{rosterPeriod ? `Lineup period ${rosterPeriod.number} · ${periodLabel(rosterPeriod)}` : 'Fantrax roster'}<span>Updated daily</span></div>
        </div>
    </section>;
}
