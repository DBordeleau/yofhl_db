import { Suspense } from 'react';
import SearchResults from '@/components/search/search-results';
import { searchPublicDirectory } from '@/lib/data/search';
import { parseSearch } from '@/lib/search/model';

export const metadata = { title: 'Search · YOFHL', robots: { index: false, follow: true } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const raw = await searchParams;
    const params = new URLSearchParams();
    for (const key of ['q', 'type', 'page']) {
        const value = Array.isArray(raw[key]) ? raw[key][0] : raw[key];
        if (typeof value === 'string') params.set(key, value);
    }
    const state = parseSearch(params);
    const initial = await searchPublicDirectory(state).catch(() => null);
    return <main className="mx-auto max-w-4xl px-4 pb-12 pt-8 md:px-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Search</h1>
        <Suspense fallback={<p>Loading search…</p>}><SearchResults initialState={state} initial={initial} /></Suspense>
    </main>;
}
