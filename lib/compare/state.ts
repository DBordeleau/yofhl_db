import { playerSlug } from '../player-url';

export type Metric = 'fpts' | 'fpg';
export interface ComparisonState { ids: string[]; metric: Metric }
export function parseComparison(params: Pick<URLSearchParams, 'get' | 'getAll' | 'toString'>): ComparisonState & { notice: string | null } {
    const ids: string[] = [];
    let invalid = false;
    let overflow = false;
    const raw = params.toString();
    const entries = raw.length > 2048 ? new URLSearchParams(raw.slice(0, 2048)).getAll('player') : params.getAll('player');
    for (const entry of entries) {
        const id = playerSlug(entry);
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) { invalid = true; continue; }
        if (ids.includes(id)) continue;
        if (ids.length === 5) { overflow = true; continue; }
        ids.push(id);
    }
    return { ids, metric: params.get('metric') === 'fpg' ? 'fpg' : 'fpts',
        notice: overflow || raw.length > 2048 ? 'A comparison can include up to five players. Only the first five valid selections were kept.'
            : invalid ? 'An invalid player ID was ignored.' : null };
}
export function comparisonHref(state: ComparisonState) {
    const params = new URLSearchParams();
    for (const id of state.ids) params.append('player', playerSlug(id));
    if (state.metric === 'fpg') params.set('metric', 'fpg');
    return `/compare/players${params.size ? `?${params}` : ''}`;
}

export function teamComparisonState(params: Pick<URLSearchParams, 'get'>, teamIds: number[]) {
    const a = teamIds.find(id => String(id) === params.get('a')) ?? (teamIds.includes(4) ? 4 : teamIds[0]);
    const b = teamIds.find(id => String(id) === params.get('b') && id !== a)
        ?? (teamIds.includes(5) && a !== 5 ? 5 : teamIds.find(id => id !== a)!);
    return { a, b, stage: params.get('stage') === 'playoff' ? 'playoff' as const : 'regular' as const };
}
export const teamComparisonHref = (a: number, b?: number, stage: 'regular' | 'playoff' = 'regular') =>
    `/compare/teams?a=${a}${b === undefined ? '' : `&b=${b}`}&stage=${stage}`;
