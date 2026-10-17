import Link from 'next/link';

export default function CompareTabs({ active }: { active: 'players' | 'teams' }) {
    return <nav aria-label="Comparison type" className="mb-6 flex flex-wrap gap-2">
        {(['players', 'teams'] as const).map(type => <Link prefetch={false} key={type} href={`/compare/${type}`} aria-current={active === type ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-bold ${active === type ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:bg-rink-wash'}`}>
            {type === 'players' ? 'Players' : 'Teams'}
        </Link>)}
    </nav>;
}
