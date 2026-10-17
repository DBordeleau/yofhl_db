// Per-component, bounded cache for public filter results. Never stores failed or aborted loads.
export function createResultCache<T>() {
    const entries = new Map<string, { value: T; expires: number }>();
    const set = (key: string, value: T, age = 0) => {
        entries.delete(key);
        entries.set(key, { value, expires: Date.now() + Math.max(0, 60 - age) * 1000 });
        if (entries.size > 32) entries.delete(entries.keys().next().value!);
    };
    const get = (key: string) => {
        const entry = entries.get(key);
        if (!entry) return undefined;
        if (entry.expires <= Date.now()) { entries.delete(key); return undefined; }
        entries.delete(key); entries.set(key, entry);
        return entry.value;
    };
    const load = async (url: string, signal: AbortSignal): Promise<T> => {
        signal.throwIfAborted();
        const saved = get(url);
        if (saved !== undefined) return saved;
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error('Could not load data');
        const value: T = await response.json();
        signal.throwIfAborted();
        const age = Number(response.headers.get('age') ?? 0);
        set(url, value, Number.isFinite(age) && age >= 0 ? age : 0);
        return value;
    };
    return { get, set, load };
}
