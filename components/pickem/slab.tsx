import type { ReactNode } from 'react';

// A small parallelogram badge (DESIGN.md, "Shapes"): a 5px cut, 900 italic uppercase, red or navy.
const TONES = { red: 'bg-rink-red', navy: 'bg-ink' } as const;

export default function Slab({ tone = 'red', children }: { tone?: keyof typeof TONES; children: ReactNode }) {
    return <span className={`inline-flex h-5 shrink-0 items-center px-2.5 text-[11px] font-black uppercase italic leading-none text-white ${TONES[tone]} [clip-path:polygon(5px_0,100%_0,calc(100%_-_5px)_100%,0_100%)]`}>
        {children}
    </span>;
}
