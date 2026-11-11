import Link from 'next/link';
import { seasonLabel } from '@/lib/league';
import styles from './pickem.module.css';

interface Props {
    /** every Pick'em season, newest first */
    seasons: number[];
    selected: number;
    /** the season being played, linked at /pickem; when unknown its /pickem/[season] link redirects there */
    beingPlayed: number | null;
}

// Every Pick'em season as small slabs under the title, newest on the left. Nothing when there is only one.
export default function SeasonSwitcher({ seasons, selected, beingPlayed }: Props) {
    if (seasons.length < 2) return null;
    return <nav aria-label="Seasons">
        <ol className={styles.seasons}>
            {seasons.map(seasonYear => <li key={seasonYear}>
                <Link href={seasonYear === beingPlayed ? '/pickem' : `/pickem/${seasonYear}`} aria-current={seasonYear === selected ? 'page' : undefined}>
                    {seasonLabel(seasonYear)}
                </Link>
            </li>)}
        </ol>
    </nav>;
}
