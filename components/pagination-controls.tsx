import React, { FC } from 'react';

interface PaginationControlsProps {
    currentPage: number;
    setCurrentPage: (page: number) => void;
    maxPages: number;
}

// first, last and the pages around the current one, with gaps marked by null
const pageWindow = (current: number, max: number): (number | null)[] => {
    const pages = new Set([1, max, current - 1, current, current + 1].filter((p) => p >= 1 && p <= max));
    const sorted = Array.from(pages).sort((a, b) => a - b);
    const out: (number | null)[] = [];
    sorted.forEach((page, i) => {
        if (i > 0 && page - sorted[i - 1] > 1) out.push(null);
        out.push(page);
    });
    return out;
};

const PaginationControls: FC<PaginationControlsProps> = ({ currentPage, setCurrentPage, maxPages }) => {
    if (maxPages <= 1) return null;

    const base = 'inline-flex h-11 min-w-11 items-center justify-center rounded-xl font-bold text-ink-soft tabular';
    const arrow = (d: string) => (
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d={d} /></svg>
    );

    return (
        <nav className="flex flex-wrap items-center justify-center gap-1 md:gap-1.5" aria-label="Pages">
            <button
                type="button"
                onClick={() => setCurrentPage(Math.max(currentPage - 1, 1))}
                disabled={currentPage === 1}
                className={`${base} hover:bg-rink-wash disabled:opacity-35 disabled:hover:bg-transparent`}
                aria-label="Previous page"
            >
                {arrow('M15 6l-6 6 6 6')}
            </button>
            {pageWindow(currentPage, maxPages).map((page, i) =>
                page === null ? (
                    <span key={`gap-${i}`} className={`${base} min-w-6`}>…</span>
                ) : (
                    <button
                        key={page}
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        className={`${base} ${page === currentPage ? 'bg-ink text-white' : 'hover:bg-rink-wash'}`}
                        aria-current={page === currentPage ? 'page' : undefined}
                    >
                        {page}
                    </button>
                )
            )}
            <button
                type="button"
                onClick={() => setCurrentPage(Math.min(currentPage + 1, maxPages))}
                disabled={currentPage === maxPages}
                className={`${base} hover:bg-rink-wash disabled:opacity-35 disabled:hover:bg-transparent`}
                aria-label="Next page"
            >
                {arrow('M9 6l6 6-6 6')}
            </button>
        </nav>
    );
};

export default PaginationControls;
