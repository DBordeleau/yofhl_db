import Link from 'next/link';
import type { PickemWeekOption } from '@/lib/pickem/create-pickem';

interface Props {
    weeks: PickemWeekOption[];
    selected: number;
    /** where each week lives: /pickem/week/[week] for the season being played */
    base?: string;
}

// Every Pick'em week of the season; locked weeks are marked so the open ones stand out.
export default function WeekSwitcher({ weeks, selected, base = '/pickem/week' }: Props) {
    return <nav aria-label="Weeks" className="-mx-4 mt-6 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ol className="flex w-max gap-1.5">
            {weeks.map(option => {
                const current = option.week === selected;
                return <li key={option.week}>
                    <Link href={`${base}/${option.week}`} scroll={false} aria-current={current ? 'page' : undefined}
                        title={option.phase === 'locked' ? `${option.name}, locked` : option.name}
                        className={`block min-w-10 rounded border px-2.5 py-1.5 text-center text-sm font-extrabold tabular-nums transition-colors ${current
                            ? 'border-ink bg-ink text-white'
                            : option.phase === 'locked' ? 'border-transparent text-ink-faint hover:bg-[#E6EEF7]' : 'border-[#D4DEE9] bg-white text-ink hover:bg-[#E6EEF7]'}`}>
                        {option.week}
                    </Link>
                </li>;
            })}
        </ol>
    </nav>;
}
