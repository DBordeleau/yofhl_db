'use client';

import type { ReactNode } from 'react';

export default function SectionLink({ href, className, children }: { href: `#${string}`; className?: string; children: ReactNode }) {
    return <a href={href} className={className} onClick={event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const target = document.getElementById(href.slice(1));
        if (!target) return;
        event.preventDefault();
        if (window.location.hash !== href) window.history.pushState(null, '', href);
        target.tabIndex = -1;
        target.focus({ preventScroll: true });
        target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    }}>{children}</a>;
}
