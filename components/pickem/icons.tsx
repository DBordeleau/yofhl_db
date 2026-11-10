// The few marks Pick'em draws: one 2px stroke, square ends.

export function Chevron({ left = false }: { left?: boolean }) {
    return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
        <path d={left ? 'M10 3 5 8l5 5' : 'm6 3 5 5-5 5'} />
    </svg>;
}

export function Check() {
    return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
        <path d="m2.5 8.5 3.5 3.5 7.5-8" />
    </svg>;
}
