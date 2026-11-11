'use client';

import { useEffect, useState } from 'react';
import TeamBadge from '@/components/team-badge';
import type { PickemWhoIsIn } from '@/lib/pickem/create-pickem';
import { ENTRY_EVENT, type EntryEvent } from './entry-event';
import styles from './pickem.module.css';

// Who's in for the next week to lock: how many owners have picked every matchup, as a scoreboard figure, then every
// club's logo, lit once its owner is in and a faint silhouette until then. No picks are shown. The signed-in owner's
// own logo follows their picks at once, before the cached list catches up.
export default function PickemWhosIn({ whosIn, seasonYear, week }: { whosIn: PickemWhoIsIn[]; seasonYear: number; week: number }) {
    const [own, setOwn] = useState<{ franchiseId: number; in: boolean } | null>(null);

    useEffect(() => {
        const listen = (event: Event) => {
            const { detail } = event as CustomEvent<EntryEvent>;
            if (detail.seasonYear === seasonYear && detail.week === week) setOwn({ franchiseId: detail.franchiseId, in: detail.in });
        };
        window.addEventListener(ENTRY_EVENT, listen);
        return () => window.removeEventListener(ENTRY_EVENT, listen);
    }, [seasonYear, week]);

    const entries = whosIn.map(entry => entry.franchise.id === own?.franchiseId ? { ...entry, in: own.in } : entry);
    const ins = entries.filter(entry => entry.in).length;
    return <section aria-labelledby="pickem-whos-in" className={styles.whos}>
        <h2 id="pickem-whos-in" className={styles.whosCount} aria-label={`${ins} of ${entries.length} owners have picked`}>
            {ins}<span>/{entries.length}</span>
        </h2>
        <ul className={styles.whosList}>
            {entries.map(({ franchise, owner, in: isIn }) => <li key={franchise.id} className={styles.whosItem} data-in={isIn ? '' : undefined}
                title={`${owner ?? franchise.name}${owner ? ` · ${franchise.name}` : ''}: ${isIn ? 'in' : 'not yet'}`}>
                <TeamBadge logo={franchise.logo} abbreviation={franchise.abbreviation} teamName={franchise.name} size={36} />
                <span className={styles.whosName}>{owner ?? franchise.name}, {isIn ? 'in' : 'not yet'}</span>
            </li>)}
        </ul>
    </section>;
}
