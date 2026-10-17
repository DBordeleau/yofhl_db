'use client';

import { useSyncExternalStore } from 'react';
import { hasSeenEpisode, subscribeToSeenEpisodes } from '@/lib/coachs-corner/seen';
import styles from './new-episode-badge.module.css';

const serverSnapshot = () => false;

export default function NewEpisodeBadge({ episodeKey }: { episodeKey: string | null }) {
    const unseen = useSyncExternalStore(
        subscribeToSeenEpisodes,
        () => episodeKey !== null && !hasSeenEpisode(episodeKey),
        serverSnapshot,
    );
    return unseen ? <span className={styles.badge} title="New episode to watch">New</span> : null;
}
