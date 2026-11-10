import Link from 'next/link';
import { seasonLabel } from '@/lib/league';

interface Props {
    /** every Pick'em season, newest first */
    seasons: number[];
    selected: number;
    /** the season being played, linked at /pickem; when unknown its /pickem/[season] link redirects there */
    beingPlayed: number | null;
}

// Every Pick'em season, newest on the left. Nothing when there is only one.
export default function SeasonSwitcher({ seasons, selected, beingPlayed }: Props) {
    if (seasons.length < 2) return null;
    return <nav aria-label="Seasons" className="-mx-4 mt-4 flex justify-center overflow-x-auto px-4 md:mx-0 md:px-0">
        <ol className="flex w-max gap-1.5">
            {seasons.map(seasonYear => {
                const current = seasonYear === selected;
                return <li key={seasonYear}>
                    <Link href={seasonYear === beingPlayed ? '/pickem' : `/pickem/${seasonYear}`} aria-current={current ? 'page' : undefined}
                        className={`block rounded-lg px-2.5 py-1.5 text-sm font-extrabold tabular-nums transition-colors ${current
                            ? 'bg-ink text-white' : 'bg-white text-ink shadow-sm hover:bg-ice'}`}>
                        {seasonLabel(seasonYear)}
                    </Link>
                </li>;
            })}
        </ol>
    </nav>;
}
