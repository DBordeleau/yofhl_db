import type { PlayerProfile } from '../data/league';
import type { createResultCache } from '../result-cache';

export type ProfileResult = { id: string; status: 'ready'; player: PlayerProfile } | { id: string; status: 'missing' | 'error' };
export async function loadComparisonProfiles(ids: string[], signal: AbortSignal, cache: ReturnType<typeof createResultCache<PlayerProfile>>, request: typeof fetch = fetch): Promise<ProfileResult[]> {
    signal.throwIfAborted();
    return Promise.all(ids.slice(0, 5).map(async (id): Promise<ProfileResult> => {
        const url = `/api/players/${encodeURIComponent(id)}`;
        try {
            const saved = cache.get(url);
            if (saved) return { id, status: 'ready', player: saved };
            const response = await request(url, { signal });
            signal.throwIfAborted();
            if (response.status === 404) return { id, status: 'missing' };
            if (!response.ok) return { id, status: 'error' };
            const player = await response.json() as PlayerProfile;
            signal.throwIfAborted();
            if (typeof player.name !== 'string' || !Array.isArray(player.playerStats)) return { id, status: 'error' };
            const age = Number(response.headers.get('age') ?? 0);
            cache.set(url, player, Number.isFinite(age) && age >= 0 ? age : 0);
            return { id, status: 'ready', player };
        } catch (error) {
            if (signal.aborted) throw error;
            return { id, status: 'error' };
        }
    }));
}
