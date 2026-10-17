'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FiArrowRight, FiSearch, FiX } from 'react-icons/fi';
import TeamBadge from '@/components/team-badge';
import { TrophyArt } from '@/components/trophy-icons';
import { createResultCache } from '@/lib/result-cache';
import { normalizeSearch, parseSearch, searchDirectory, searchHref, SEARCH_TYPES, type SearchResponse, type SearchState } from '@/lib/search/model';
import styles from './search.module.css';

const labels = { all: 'All', players: 'Players', teams: 'Teams', awards: 'Awards', seasons: 'Seasons' };
const api = (state: SearchState) => `/api${searchHref(state)}`;

export default function SearchResults({ initialState, initial }: { initialState: SearchState; initial: SearchResponse | null }) {
    const params = useSearchParams();
    const state = parseSearch(params);
    const key = api(state);
    const [draft, setDraft] = useState(state.q);
    const [loaded, setLoaded] = useState({ key: api(initialState), data: initial, failed: !initial });
    const [retry, setRetry] = useState(0);
    const input = useRef<HTMLInputElement>(null);
    const cache = useMemo(() => {
        const result = createResultCache<SearchResponse>();
        if (initial) result.set(api(initialState), initial);
        return result;
    }, [initial, initialState]);
    useEffect(() => setDraft(state.q), [state.q]);
    useEffect(() => {
        if (draft.trim() === state.q) return;
        const timer = setTimeout(() => window.history.replaceState(null, '', searchHref({ ...state, q: draft.trim(), page: 1 })), 250);
        return () => clearTimeout(timer);
    }, [draft, state.q, state.type, state.page]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        const controller = new AbortController();
        if (normalizeSearch(state.q).length < 2) {
            setLoaded({ key, data: searchDirectory([], state), failed: false });
            return;
        }
        const saved = cache.get(key);
        if (saved) { setLoaded({ key, data: saved, failed: false }); return; }
        setLoaded({ key, data: null, failed: false });
        cache.load(key, controller.signal).then(data => {
            if (!controller.signal.aborted) setLoaded({ key, data, failed: false });
        }).catch(() => { if (!controller.signal.aborted) setLoaded({ key, data: null, failed: true }); });
        return () => controller.abort();
    }, [key, cache, retry]); // eslint-disable-line react-hooks/exhaustive-deps

    function navigate(next: SearchState, event?: MouseEvent<HTMLAnchorElement>) {
        if (event && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
        event?.preventDefault();
        const href = searchHref(next);
        if (`${window.location.pathname}${window.location.search}` !== href) window.history.pushState(null, '', href);
    }
    function submit(event: FormEvent) {
        event.preventDefault();
        navigate({ ...state, q: draft.trim(), page: 1 });
        input.current?.blur();
        if (loaded.failed) setRetry(value => value + 1);
    }
    const data = loaded.key === key ? loaded.data : null;
    const enough = normalizeSearch(state.q).length >= 2;
    const failed = loaded.key === key && loaded.failed;
    const pending = enough && !data && !failed;

    return <div className={styles.search}>
        <form action="/search" method="get" onSubmit={submit} role="search" className={styles.form}>
            <label htmlFor="public-search" className="sr-only">Search players, teams, awards, seasons</label>
            <FiSearch aria-hidden="true" />
            <input ref={input} id="public-search" name="q" type="search" autoComplete="off" maxLength={60} value={draft}
                onChange={event => setDraft(event.target.value)} placeholder="Search by name or season" />
            {state.type !== 'all' && <input type="hidden" name="type" value={state.type} />}
            {draft && <button type="button" aria-label="Clear search" className={styles.clear} onClick={() => {
                setDraft(''); navigate({ ...state, q: '', page: 1 }); input.current?.focus();
            }}><FiX /></button>}
            <button className={styles.submit} type="submit">Search</button>
        </form>
        <nav aria-label="Search categories" className={styles.filters}>
            {(['all', ...SEARCH_TYPES] as const).map(type => {
                const next = { ...state, type, page: 1 };
                return <Link prefetch={false} key={type} href={searchHref(next)} aria-current={state.type === type ? 'page' : undefined}
                    onClick={event => navigate(next, event)}>{labels[type]}</Link>;
            })}
        </nav>
        <div role="status" aria-live="polite" className={state.q ? styles.status : 'sr-only'}>
            {!state.q ? '' : pending ? 'Searching…' : failed ? 'Search is unavailable.' : !enough
                ? 'Enter at least 2 letters or numbers.'
                : data?.total === 0 ? `No results for "${state.q}".` : `${data?.total ?? 0} ${data?.total === 1 ? 'result' : 'results'}`}
        </div>
        {failed && <button className={styles.retry} type="button" onClick={() => setRetry(value => value + 1)}>Retry search</button>}
        {!state.q && <nav aria-label="Browse the league" className={styles.start}>
            <Link href="/stats/all-time/all">Player leaderboards <FiArrowRight aria-hidden="true" /></Link>
            <Link href="/teams/stats">All teams <FiArrowRight aria-hidden="true" /></Link>
            <Link href="/season">Season archive <FiArrowRight aria-hidden="true" /></Link>
        </nav>}
        {data?.groups.filter(group => group.total > 0).map(group => <section key={group.kind} className={styles.group} aria-labelledby={`results-${group.kind}`}>
            <div className={styles.groupTitle}><h2 id={`results-${group.kind}`}>{labels[group.kind]} <span>{group.total}</span></h2>
                {state.type === 'all' && group.total > 5 && <Link prefetch={false} href={searchHref({ ...state, type: group.kind, page: 1 })}
                    onClick={event => navigate({ ...state, type: group.kind, page: 1 }, event)}>View all {labels[group.kind].toLowerCase()} <FiArrowRight /></Link>}
            </div>
            <ul className={styles.results}>{group.results.map(result => <li key={result.id}>
                <Link prefetch={false} href={result.href}>
                    {result.kind === 'awards' ? <TrophyArt award={result.id} className="h-11 w-11" sizes="44px" />
                        : result.kind !== 'players' && <TeamBadge logo={result.logo ?? null} abbreviation={result.abbreviation ?? (result.kind === 'seasons' ? result.id : 'YOF')} teamName={result.title} size={42} ring="none" />}
                    <span><strong>{result.title}</strong><small>{result.subtitle}</small></span><FiArrowRight aria-hidden="true" />
                </Link>
            </li>)}</ul>
        </section>)}
        {data && data.pages > 1 && <nav aria-label="Search pages" className={styles.pagination}>
            {data.page > 1 && <Link prefetch={false} href={searchHref({ ...state, page: data.page - 1 })} onClick={event => navigate({ ...state, page: data.page - 1 }, event)}>Previous</Link>}
            <span>Page {data.page} of {data.pages}</span>
            {data.page < data.pages && <Link prefetch={false} href={searchHref({ ...state, page: data.page + 1 })} onClick={event => navigate({ ...state, page: data.page + 1 }, event)}>Next</Link>}
        </nav>}
    </div>;
}
