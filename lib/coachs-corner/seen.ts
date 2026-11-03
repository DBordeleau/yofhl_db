// v2 keys by episode id, so renaming a slug never resets the badge; v1 keys were slugs.
const STORAGE_PREFIX = 'coachs-corner:seen:v2:';
const SEEN_EVENT = 'coachs-corner:seen';
// Keep the badge dismissed for this visit if browser storage is unavailable.
const unpersisted = new Set<string>();

export const episodeSeenKey = (episode: { id: number | null; publishedAt: string | null }) =>
    `${episode.id ?? 'pilot'}:${episode.publishedAt ?? 'pilot'}`;

export function hasSeenEpisode(episodeKey: string): boolean {
    if (typeof window === 'undefined') return false;
    if (unpersisted.has(episodeKey)) return true;
    try {
        return window.localStorage.getItem(STORAGE_PREFIX + episodeKey) === '1';
    } catch {
        return false;
    }
}

export function markEpisodeSeen(episodeKey: string): void {
    if (typeof window === 'undefined' || hasSeenEpisode(episodeKey)) return;
    try {
        window.localStorage.setItem(STORAGE_PREFIX + episodeKey, '1');
    } catch {
        unpersisted.add(episodeKey);
    }
    window.dispatchEvent(new Event(SEEN_EVENT));
}

export function subscribeToSeenEpisodes(onChange: () => void): () => void {
    const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key.startsWith(STORAGE_PREFIX)) {
            if (event.key === null) unpersisted.clear();
            else unpersisted.delete(event.key.slice(STORAGE_PREFIX.length));
            onChange();
        }
    };
    window.addEventListener(SEEN_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
        window.removeEventListener(SEEN_EVENT, onChange);
        window.removeEventListener('storage', onStorage);
    };
}
