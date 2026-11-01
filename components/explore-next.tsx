import Link from 'next/link';
import Arrow from '@/components/arrow';
import { exploreLinks, type ExploreLink } from '@/lib/explore';
import styles from './explore-next.module.css';

// One broadcast band at the foot of a page: the title, then each next stop with the reason to go there.
export default function ExploreNext({ links, currentHref, title = 'Explore next' }: { links: (ExploreLink | null | undefined | false)[]; currentHref: string; title?: string }) {
    const items = exploreLinks(links, currentHref);
    if (!items.length) return null;
    return <nav aria-label={title} className={styles.band}>
        <h2 className={styles.title}>{title}</h2>
        <ul className={styles.links}>{items.map(item => <li key={item.href}>
            <Link prefetch={false} href={item.href} className={styles.link}>
                <span className={styles.reason}>{item.reason}</span>
                <strong>{item.title} <Arrow className={styles.arrow} /></strong>
            </Link>
        </li>)}</ul>
    </nav>;
}
