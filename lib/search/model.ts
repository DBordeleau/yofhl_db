export const SEARCH_TYPES = ['players', 'teams', 'awards', 'seasons'] as const;
export type SearchKind = typeof SEARCH_TYPES[number];
export type SearchType = SearchKind | 'all';
export interface SearchState { q: string; type: SearchType; page: number }
export interface SearchResult {
    kind: SearchKind;
    id: string;
    title: string;
    subtitle: string;
    href: string;
    logo?: string | null;
    abbreviation?: string | null;
}
export interface SearchEntry extends SearchResult {
    aliases?: { text: string; note?: string }[];
    defunct?: boolean;
    careerPoints?: number;
}
export interface SearchResponse extends SearchState {
    groups: { kind: SearchKind; total: number; results: SearchResult[] }[];
    total: number;
    pages: number;
}

export const normalizeSearch = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/['’]/g, '').replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');

export function parseSearch(params: Pick<URLSearchParams, 'get'>): SearchState {
    const type = params.get('type');
    const page = params.get('page') ?? '';
    return { q: (params.get('q') ?? '').slice(0, 60).trim(),
        type: SEARCH_TYPES.includes(type as SearchKind) ? type as SearchKind : 'all',
        page: /^\d{1,6}$/.test(page) && Number(page) > 0 ? Number(page) : 1 };
}

export function searchHref(state: SearchState) {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q.slice(0, 60));
    if (state.type !== 'all') params.set('type', state.type);
    if (state.page > 1 && state.type !== 'all') params.set('page', String(state.page));
    return `/search${params.size ? `?${params}` : ''}`;
}

function oneTypo(a: string, b: string) {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) { i++; j++; continue; }
        if (++edits > 1) return false;
        if (a.length === b.length && a[i] === b[j + 1] && a[i + 1] === b[j]) { i += 2; j += 2; }
        else if (a.length > b.length) i++;
        else if (b.length > a.length) j++;
        else { i++; j++; }
    }
    return edits + Number(i < a.length || j < b.length) <= 1;
}

function match(value: string, query: string) {
    const normalized = normalizeSearch(value);
    if (normalized === query) return 0;
    const words = normalized.split(' ');
    const tokens = query.split(' ');
    if (tokens.every(token => words.includes(token))) return 1;
    if (tokens.every(token => words.some(word => word.startsWith(token)))) return 2;
    if (tokens.every(token => normalized.includes(token))) return 3;
    // Keep short queries precise; allow one mistyped name token after stronger matches.
    const unmatched = tokens.filter(token => !words.some(word => word.startsWith(token)));
    if (unmatched.length === 1 && unmatched[0].length >= 5 && words.some(word => oneTypo(unmatched[0], word))) return 4;
    return Infinity;
}

export function searchDirectory(directory: SearchEntry[], state: SearchState): SearchResponse {
    const query = normalizeSearch(state.q);
    const groups = SEARCH_TYPES.filter(kind => state.type === 'all' || state.type === kind).map(kind => {
        const matches = query.length < 2 ? [] : directory.filter(entry => entry.kind === kind).map(entry => {
            let score = match(entry.title, query);
            let note: string | undefined;
            for (const alias of entry.aliases ?? []) {
                const aliasScore = Math.max(1, match(alias.text, query));
                if (aliasScore < score) { score = aliasScore; note = alias.note; }
            }
            return { entry, score, note };
        }).filter(row => Number.isFinite(row.score)).sort((a, b) => a.score - b.score
            || (kind === 'players' ? (b.entry.careerPoints ?? 0) - (a.entry.careerPoints ?? 0) : 0)
            || Number(!!a.entry.defunct) - Number(!!b.entry.defunct)
            || a.entry.title.localeCompare(b.entry.title) || a.entry.id.localeCompare(b.entry.id));
        const page = Math.min(state.page, Math.max(1, Math.ceil(matches.length / 25)));
        const start = state.type === 'all' ? 0 : (page - 1) * 25;
        return { kind, total: matches.length, results: matches.slice(start, start + (state.type === 'all' ? 5 : 25)).map(({ entry, note }) => ({
            kind: entry.kind, id: entry.id, title: entry.title, href: entry.href,
            subtitle: note ? `${note} · ${entry.subtitle}` : entry.subtitle,
            logo: entry.logo, abbreviation: entry.abbreviation,
        })) };
    });
    const total = groups.reduce((sum, group) => sum + group.total, 0);
    const pages = state.type === 'all' ? 1 : Math.max(1, Math.ceil(total / 25));
    return { ...state, page: Math.min(state.page, pages), groups, total, pages };
}
