import Link from 'next/link';
import { FiBarChart2 } from 'react-icons/fi';
import { comparisonHref } from '@/lib/compare/state';

export default function CompareButton({ id }: { id: string; name: string }) {
    return <Link href={comparisonHref({ ids: [id], metric: 'fpts' })} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/30 bg-white/10 px-5 text-sm font-bold text-white transition-colors hover:bg-white hover:text-ink" title="Compare this player with others"><FiBarChart2 aria-hidden="true" /> Compare</Link>;
}
