import Link from 'next/link';
import type { PickemWeekOption } from '@/lib/pickem/create-pickem';

interface Props {
    weeks: PickemWeekOption[];
    selected: number;
}

// Every Pick'em week of the season; locked weeks are marked so the open ones stand out.
export default function WeekSwitcher({ weeks, selected }: Props) {
    return <nav aria-label="Weeks" className="-mx-4 mt-6 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ol className="flex w-max gap-1.5">
            {weeks.map(option => {
                const current = option.week === selected;
                return <li key={option.week}>
                    <Link href={`/pickem/week/${option.week}`} scroll={false} aria-current={current ? 'page' : undefined}
                        title={option.phase === 'locked' ? `${option.name}, locked` : option.name}
                        className={`block min-w-10 rounded-lg px-2.5 py-1.5 text-center text-sm font-extrabold tabular-nums transition-colors ${current
                            ? 'bg-ink text-white'
                            : option.phase === 'locked' ? 'text-ink-faint hover:bg-ice' : 'bg-white text-ink shadow-sm hover:bg-ice'}`}>
                        {option.week}
                    </Link>
                </li>;
            })}
        </ol>
    </nav>;
}
