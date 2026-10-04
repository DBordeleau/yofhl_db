'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import styles from './page-contents.module.css';

export interface PageSection { id: string; label: string }

export default function PageContents({ title, contentId, sections }: { title: string; contentId: string; sections: PageSection[] }) {
    const [active, setActive] = useState(sections[0].id);
    const [open, setOpen] = useState(false);
    const nav = useRef<HTMLElement>(null);
    const toggle = useRef<HTMLButtonElement>(null);
    const activeIndex = Math.max(0, sections.findIndex((section) => section.id === active));

    useEffect(() => {
        const targets = sections.map((section) => document.getElementById(section.id)).filter((node): node is HTMLElement => node !== null);
        if (!targets.length) return;
        let frame = 0;
        const update = () => {
            frame = 0;
            const offset = parseFloat(getComputedStyle(targets[0]).scrollMarginTop) + 16;
            let current = targets[0];
            for (const target of targets) {
                if (target.getBoundingClientRect().top <= offset) current = target;
            }
            if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) current = targets[targets.length - 1];
            setActive(current.id);
        };
        const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
        const observer = new ResizeObserver(schedule);
        const content = document.getElementById(contentId);
        if (content) observer.observe(content);
        update();
        window.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', schedule);
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            window.removeEventListener('scroll', schedule);
            window.removeEventListener('resize', schedule);
        };
    }, [contentId, sections]);

    useEffect(() => {
        if (!open) return;
        const dismiss = (event: PointerEvent) => { if (!nav.current?.contains(event.target as Node)) setOpen(false); };
        document.addEventListener('pointerdown', dismiss);
        return () => document.removeEventListener('pointerdown', dismiss);
    }, [open]);

    const jump = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const target = document.getElementById(id);
        if (!target) return;
        event.preventDefault();
        setOpen(false);
        if (window.location.hash !== `#${id}`) window.history.pushState(null, '', `#${id}`);
        target.tabIndex = -1;
        target.focus({ preventScroll: true });
        target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    };

    return (
        <nav ref={nav} className={styles.nav} aria-label={`${title}: on this page`}
            onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
            onKeyDown={(event) => { if (event.key === 'Escape' && open) { setOpen(false); toggle.current?.focus(); } }}>
            <div className="hidden px-5 pb-4 pt-5 xl:block">
                <h2 className="text-[11px] font-extrabold uppercase tracking-[.15em] text-ink-muted">On this page</h2>
                <p className="mt-2 text-sm font-bold leading-snug text-ink">{title}</p>
            </div>
            <button ref={toggle} type="button" className="flex min-h-[68px] w-full items-center justify-between gap-3 rounded-2xl px-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rink-blue xl:hidden"
                aria-expanded={open} aria-controls={`${contentId}-links`} onClick={() => setOpen(!open)}>
                <span><span className="block text-[10px] font-extrabold uppercase tracking-[.14em] text-ink-muted">On this page</span>
                    <span className="mt-1 block text-sm font-bold">{sections[activeIndex].label}</span></span>
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors motion-reduce:transition-none ${open ? 'bg-ink text-white' : 'bg-rink-wash text-rink-blue'}`}>
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                        {open ? <path d="m7 7 10 10M17 7 7 17" /> : <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth="3" /></>}
                    </svg>
                </span>
            </button>
            <div id={`${contentId}-links`} className={`${styles.menu} ${open ? styles.open : ''}`}>
                <ul className="relative space-y-1">
                    {sections.map((section, index) => (
                        <li key={section.id}>
                            <a href={`#${section.id}`} aria-current={active === section.id ? 'location' : undefined} onClick={(event) => jump(event, section.id)}
                                className={`relative z-[1] flex h-11 items-center rounded-xl px-4 text-[13px] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rink-blue motion-reduce:transition-none ${index === activeIndex ? 'text-ink' : 'text-ink-muted hover:bg-rink-wash/70 hover:text-ink'}`}>
                                {section.label}
                            </a>
                        </li>
                    ))}
                </ul>
                <span className={styles.indicator} style={{ transform: `translateY(${activeIndex * 48}px)` }} aria-hidden="true" />
            </div>
        </nav>
    );
}
