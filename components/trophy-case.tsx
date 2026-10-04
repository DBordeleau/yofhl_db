'use client';

import React, { FC, useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { TrophyArt } from '@/components/trophy-icons';
import TrophySparkles from '@/components/trophy-sparkles';
import { awardHref, getAwardDefinition } from '@/lib/awards';

export interface TrophyItem {
    kind: 'cup' | 'award';
    name: string; // "Jagr Cup" or the award name
    detail: string; // team for a cup, award description for an award
    season: string;
}

interface TrophyCaseProps {
    items: TrophyItem[];
    className?: string;
}

const CARD = 230; // carousel card width
const GAP = 16;
const STEP = CARD + GAP;

const TrophyTile: FC<{ item: TrophyItem; index: number; large?: boolean; active?: boolean }> = ({ item, index, large, active = true }) => (
    <div
        className={`trophy-tile group relative flex h-full flex-col items-center gap-1 overflow-hidden rounded-[20px] border px-3 pb-5 pt-3 text-center text-white ${item.kind === 'cup'
            ? 'border-gold-light/70 shadow-[0_0_0_1px_rgba(240,199,94,.25),0_18px_36px_-18px_rgba(184,134,11,.6)]'
            : 'border-gold-light/20'
            }`}
    >
        <span className={`trophy-pool absolute left-1/2 -translate-x-1/2 rounded-full ${large ? 'top-[150px] h-7 w-[150px]' : 'top-[112px] h-6 w-[110px]'}`} />
        <span className="relative flex items-end justify-center drop-shadow-[0_6px_12px_rgba(240,199,94,.2)]">
            <TrophyArt award={item.name} className={large ? 'h-44 w-44' : 'h-32 w-32'} sizes={large ? '176px' : '128px'} />
            <TrophySparkles seed={`${item.name}-${item.season}-${index}`} />
        </span>
        <Link href={awardHref(item.name)} tabIndex={active ? undefined : -1} className={`font-wide relative mt-2 font-extrabold uppercase leading-tight underline-offset-4 hover:text-gold-light hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-light ${large ? 'text-sm' : 'text-xs'}`}>{getAwardDefinition(item.name)?.label ?? item.name}</Link>
        <span className="text-xs text-[#AFC0D8]">{item.detail}</span>
        <span className="tabular text-[13px] font-extrabold text-gold-light">{item.season}</span>
    </div>
);

// swipeable carousel used on small screens: drag, arrows, dots or tap a neighbouring card
const TrophyCarousel: FC<TrophyCaseProps> = ({ items }) => {
    const [index, setIndex] = useState(0);
    const x = useMotionValue(0);
    const dragged = useRef(false);
    const reduceMotion = useReducedMotion();

    useEffect(() => {
        const controls = animate(x, -index * STEP, reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 34 });
        return controls.stop;
    }, [index, x, reduceMotion]);

    const go = (i: number) => setIndex(Math.max(0, Math.min(items.length - 1, i)));

    const arrow = (d: string) => (
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d={d} /></svg>
    );

    return (
        <div aria-roledescription="carousel" aria-label="Trophy case">
            <div className="-mx-4 overflow-hidden pb-1 pt-1.5">
                <motion.div
                    className="flex cursor-grab touch-pan-y active:cursor-grabbing"
                    style={{ x, gap: GAP, marginLeft: `calc(50% - ${CARD / 2}px)` }}
                    drag="x"
                    dragConstraints={{ left: -(items.length - 1) * STEP, right: 0 }}
                    dragElastic={0.18}
                    onDragStart={() => { dragged.current = true; }}
                    onDragEnd={(_, info) => {
                        // project the release position forward with velocity, and let short flicks still advance one card
                        let next = Math.round(-(x.get() + info.velocity.x * 0.2) / STEP);
                        if (next === index && Math.abs(info.offset.x) > 40) next = index + (info.offset.x < 0 ? 1 : -1);
                        const target = Math.max(0, Math.min(items.length - 1, next));
                        // snap back even when the index doesn't change
                        animate(x, -target * STEP, { type: 'spring', stiffness: 320, damping: 34 });
                        setIndex(target);
                        setTimeout(() => { dragged.current = false; }, 0);
                    }}
                >
                    {items.map((item, i) => (
                        <motion.div
                            key={`${item.name}-${item.season}-${i}`}
                            className="min-h-[320px] flex-none"
                            style={{ width: CARD }}
                            animate={{ scale: i === index ? 1 : 0.86, opacity: i === index ? 1 : 0.5 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            onClick={() => { if (!dragged.current) go(i); }}
                            onClickCapture={(event) => { if (dragged.current) event.preventDefault(); }}
                            aria-roledescription="slide"
                            aria-label={`${i + 1} of ${items.length}: ${getAwardDefinition(item.name)?.label ?? item.name}, ${item.season}`}
                            aria-hidden={i !== index}
                        >
                            <TrophyTile item={item} index={i} large active={i === index} />
                        </motion.div>
                    ))}
                </motion.div>
            </div>
            {items.length > 1 && (
                <div className="mt-3.5 flex items-center justify-between">
                    <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line-strong bg-white text-ink disabled:opacity-35" aria-label="Previous trophy">
                        {arrow('M15 6l-6 6 6 6')}
                    </button>
                    <div className="mx-2 flex min-w-0 flex-1 flex-wrap justify-center">
                        {items.map((item, i) => (
                            <button key={i} type="button" onClick={() => go(i)} className="inline-flex h-11 w-7 items-center justify-center" aria-label={`Show ${getAwardDefinition(item.name)?.label ?? item.name}, ${item.season}`} aria-current={i === index}>
                                <i className={`block h-2 rounded-full transition-all duration-300 ${i === index ? 'w-[22px] bg-gold' : 'w-2 bg-line-strong'}`} />
                            </button>
                        ))}
                    </div>
                    <button type="button" onClick={() => go(index + 1)} disabled={index === items.length - 1} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line-strong bg-white text-ink disabled:opacity-35" aria-label="Next trophy">
                        {arrow('M9 6l6 6-6 6')}
                    </button>
                </div>
            )}
        </div>
    );
};

// Jagr Cups and individual awards for a player at /player/[ID]
const TrophyCase: FC<TrophyCaseProps> = ({ items, className = '' }) => (
    <section className={`rounded-3xl border border-line bg-white p-4 shadow-card md:p-6 ${className}`}>
        {/* below lg the player page tabs already label this panel */}
        <div className="mb-3.5 flex items-baseline justify-between max-lg:sr-only">
            <h2 className="font-wide m-0 text-lg font-extrabold uppercase">Trophy Case</h2>
            {items.length > 0 && (
                <span className="metal-gold inline-flex h-[30px] min-w-[30px] items-center justify-center rounded-full px-2.5 text-sm font-extrabold text-[#2B1D00]">{items.length}</span>
            )}
        </div>
        {items.length > 0 ? (
            <>
                <div className="hidden gap-3 md:grid md:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
                    {items.map((item, i) => (
                        <div key={`${item.name}-${item.season}-${i}`} className="animate-rise" style={{ animationDelay: `${i * 70}ms` }}>
                            <TrophyTile item={item} index={i} />
                        </div>
                    ))}
                </div>
                <div className="md:hidden">
                    <TrophyCarousel items={items} />
                </div>
            </>
        ) : (
            <div className="flex flex-col items-center gap-2.5 rounded-[20px] border-2 border-dashed border-line-strong px-4 py-7 font-semibold text-ink-faint">
                <svg className="h-[54px] w-12" viewBox="0 0 32 36" fill="none" stroke="#B4C0D0" strokeWidth="1.2" strokeDasharray="2 2" aria-hidden="true">
                    <path d="M9 2.5h14V11c0 4.4-3.1 8-7 8s-7-3.6-7-8z" />
                    <rect x="8" y="27" width="16" height="7" rx="1.2" />
                    <path d="M16 19v8" />
                </svg>
                No trophies yet
            </div>
        )}
    </section>
);

export default TrophyCase;
