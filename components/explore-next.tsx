import Link from 'next/link';
import { FiArrowUpRight } from 'react-icons/fi';
import { exploreLinks, type ExploreLink } from '@/lib/explore';

export default function ExploreNext({ links, currentHref, title = 'Explore next' }: { links: (ExploreLink | null | undefined | false)[]; currentHref: string; title?: string }) {
    const items = exploreLinks(links, currentHref);
    if (!items.length) return null;
    return <nav aria-label={title} className="mt-10 border-t border-line pt-6">
        <h2 className="font-wide mb-4 text-lg font-extrabold">{title}</h2>
        <ul className="grid gap-3 sm:grid-cols-2">{items.map(item => <li key={item.href}>
            <Link prefetch={false} href={item.href} className="group flex h-full min-h-24 items-start justify-between gap-4 rounded-2xl border border-line bg-white p-5 transition-colors hover:border-rink-blue hover:bg-rink-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-rink-blue">
                <span className="min-w-0"><strong className="block break-words text-sm text-ink">{item.title}</strong><span className="mt-2 block text-xs leading-relaxed text-ink-muted">{item.reason}</span></span><FiArrowUpRight className="shrink-0 text-rink-blue" aria-hidden="true" />
            </Link>
        </li>)}</ul>
    </nav>;
}
