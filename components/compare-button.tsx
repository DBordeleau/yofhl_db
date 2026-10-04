'use client';

import { FC } from 'react';
import { useRouter } from 'next/navigation';

// hands the player to /compare, which picks them up from sessionStorage
const CompareButton: FC<{ id: string; name: string }> = ({ id, name }) => {
    const router = useRouter();
    return (
        <button
            type="button"
            onClick={() => {
                sessionStorage.setItem('comparePlayer', JSON.stringify({ ID: id, Player: name }));
                router.push('/compare');
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/30 bg-white/10 px-5 text-sm font-bold text-white transition-colors hover:bg-white hover:text-ink"
            title="Compare this player with others"
        >
            <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 19l5-6 4 3 7-9" /></svg>
            Compare
        </button>
    );
};

export default CompareButton;
