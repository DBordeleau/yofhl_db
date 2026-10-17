'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FiArrowUpRight, FiSearch, FiX } from 'react-icons/fi';
import TeamBadge from '@/components/team-badge';
import { TrophyArt } from '@/components/trophy-icons';
import { createResultCache } from '@/lib/result-cache';
import { normalizeSearch, searchHref, SEARCH_TYPES, type SearchResponse, type SearchType } from '@/lib/search/model';
import styles from './header-search.module.css';

const labels = { all: 'All', players: 'Players', teams: 'Teams', awards: 'Awards', seasons: 'Seasons' };

export default function HeaderSearch({ onOpen }: { onOpen: () => void }) {
    const pathname = usePathname();
    const router = useRouter();
    const root = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLInputElement>(null);
    const restoringFocus = useRef(false);
    const listId = useId();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [type, setType] = useState<SearchType>('all');
    const [active, setActive] = useState(-1);
    const [retry, setRetry] = useState(0);
    const [loaded, setLoaded] = useState<{ key: string; data: SearchResponse | null; failed: boolean } | null>(null);
    const cache = useMemo(() => createResultCache<SearchResponse>(), []);
    const href = searchHref({ q: query.trim(), type, page: 1 });
    const key = `/api${href}`;
    const enough = normalizeSearch(query).length >= 2;
    const data = loaded?.key === key ? loaded.data : null;
    const failed = loaded?.key === key && loaded.failed;
    const groups = data?.groups.filter(group => group.total > 0) ?? [];
    const results = groups.flatMap(group => group.results);
    const selected = active < results.length ? active : -1;

    useEffect(() => { setOpen(false); setQuery(''); setType('all'); setActive(-1); }, [pathname]);
    useEffect(() => {
        if (!open) return;
        const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
        document.addEventListener('pointerdown', outside);
        return () => document.removeEventListener('pointerdown', outside);
    }, [open]);
    useEffect(() => {
        if (!open || !enough) return;
        const controller = new AbortController();
        const saved = cache.get(key);
        if (saved) { setLoaded({ key, data: saved, failed: false }); return; }
        const timer = setTimeout(() => {
            setLoaded({ key, data: null, failed: false });
            cache.load(key, controller.signal).then(data => {
                if (!controller.signal.aborted) setLoaded({ key, data, failed: false });
            }).catch(() => { if (!controller.signal.aborted) setLoaded({ key, data: null, failed: true }); });
        }, 200);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [open, enough, key, cache, retry]);
    useEffect(() => {
        if (open && selected >= 0) document.getElementById(`${listId}-${selected}`)?.scrollIntoView({ block: 'nearest' });
    }, [open, selected, listId]);

    function show() { setOpen(true); onOpen(); }
    function close() { setOpen(false); setActive(-1); }
    function dismiss() {
        close();
        restoringFocus.current = true;
        input.current?.focus();
        restoringFocus.current = false;
    }
    function choose() {
        const result = enough && results[selected < 0 ? 0 : selected];
        if (!result) return;
        close(); input.current?.blur(); router.push(result.href);
    }
    function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); show();
            if (results.length) setActive(index => event.key === 'ArrowDown' ? (index + 1) % results.length : (index <= 0 ? results.length : index) - 1);
        }
    }

    let offset = 0;
    return <div ref={root} className={styles.root} data-header-search-open={open || undefined}
        onKeyDown={event => { if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); dismiss(); } }}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}>
        <form action="/search" role="search" aria-label="Quick search" className={styles.field} onSubmit={event => { event.preventDefault(); show(); choose(); }}>
            <FiSearch aria-hidden="true" />
            <input ref={input} id="header-search" name="q" type="search" role="combobox" aria-label="Search the league"
                aria-expanded={open} aria-controls={open ? listId : undefined} aria-autocomplete="list"
                aria-activedescendant={open && selected >= 0 ? `${listId}-${selected}` : undefined}
                autoComplete="off" autoCapitalize="none" spellCheck={false} enterKeyHint="go" maxLength={60}
                placeholder="Search the league" value={query} onFocus={() => { if (!restoringFocus.current) show(); }} onClick={show} onKeyDown={onKeyDown}
                onChange={event => { setQuery(event.target.value); setActive(-1); show(); }} />
            {query && <button type="button" aria-label="Clear quick search" onClick={() => { setQuery(''); setActive(-1); input.current?.focus(); }}><FiX aria-hidden="true" /></button>}
        </form>
        {open && <div className={styles.panel}>
            <div className={styles.filters} role="group" aria-label="Quick search categories">
                {(['all', ...SEARCH_TYPES] as const).map(kind => <button key={kind} type="button" aria-pressed={type === kind} onClick={() => {
                    setType(kind); setActive(-1); input.current?.focus();
                }}>{labels[kind]}</button>)}
            </div>
            <div className={styles.results}>
                <p role="status" className={enough && data?.total ? 'sr-only' : styles.message}>
                    {!enough ? 'Enter at least 2 letters or numbers.'
                        : failed ? 'Search is unavailable.' : !data ? 'Searching…' : data.total === 0 ? `No results for "${query.trim()}".` : `${data.total} ${data.total === 1 ? 'result' : 'results'}`}
                </p>
                {failed && <button type="button" className={styles.retry} onClick={() => setRetry(value => value + 1)}>Retry search</button>}
                <div id={listId} role="listbox" aria-label="Search suggestions">
                    {enough && groups.map(group => {
                        const start = offset; offset += group.results.length;
                        return <div key={group.kind} role="group" aria-label={labels[group.kind]}>
                            <div className={styles.groupTitle} aria-hidden="true">{labels[group.kind]}<span>{group.total}</span></div>
                            {group.results.map((result, index) => {
                                const position = start + index;
                                return <Link prefetch={false} id={`${listId}-${position}`} role="option" aria-selected={selected === position}
                                    tabIndex={-1} key={result.id} href={result.href} className={styles.result}
                                    onMouseMove={() => setActive(position)} onClick={close}>
                                    {result.kind === 'awards' ? <TrophyArt award={result.id} className="h-8 w-8" sizes="32px" />
                                        : result.kind !== 'players' && <TeamBadge logo={result.logo ?? null} abbreviation={result.abbreviation ?? 'YOF'} teamName={result.title} size={32} ring="none" />}
                                    <span className={styles.identity}><strong>{result.title}</strong><small>{result.subtitle}</small></span><FiArrowUpRight aria-hidden="true" />
                                </Link>;
                            })}
                        </div>;
                    })}
                </div>
            </div>
            <div className={styles.footer}>
                {enough && <Link prefetch={false} href={href} onClick={close}>View all results <FiArrowUpRight aria-hidden="true" /></Link>}
                <button type="button" onClick={dismiss}>Close</button>
            </div>
        </div>}
    </div>;
}
