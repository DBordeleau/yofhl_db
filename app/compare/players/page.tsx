import { Suspense } from 'react';
import PlayerComparison from '@/components/compare/player-comparison';

export const metadata = { title: 'Compare players · YOFHL', description: 'Compare up to five players across their shared YOFHL seasons.' };
export default function PlayerComparisonPage() {
    return <Suspense fallback={<main className="mx-auto max-w-4xl p-8"><h1 className="text-2xl font-bold">Compare players</h1><p role="status" className="mt-4">Loading your comparison…</p></main>}><PlayerComparison /></Suspense>;
}
