'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Next's client navigation scrolls to hashes without updating CSS :target.
export default function SeasonArrival() {
    const pathname = usePathname();
    useEffect(() => {
        let highlighted: HTMLElement | null = null;
        let frame = 0;
        const highlight = () => {
            cancelAnimationFrame(frame);
            highlighted?.classList.remove('arrival-highlight');
            frame = requestAnimationFrame(() => {
                const target = document.getElementById(window.location.hash.slice(1));
                if (!target?.classList.contains('arrival-target')) return;
                highlighted = target;
                target.classList.add('arrival-highlight');
                const section = target.closest('section');
                const destination = section && section.getBoundingClientRect().height <= window.innerHeight - 48 ? section : target;
                destination.scrollIntoView({ block: 'start' });
                target.setAttribute('tabindex', '-1');
                target.focus({ preventScroll: true });
            });
        };
        highlight();
        window.addEventListener('hashchange', highlight);
        window.addEventListener('popstate', highlight);
        return () => {
            cancelAnimationFrame(frame);
            highlighted?.classList.remove('arrival-highlight');
            window.removeEventListener('hashchange', highlight);
            window.removeEventListener('popstate', highlight);
        };
    }, [pathname]);
    return null;
}
