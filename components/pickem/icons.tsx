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

export function Cross() {
    return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
        <path d="m3.5 3.5 9 9m0-9-9 9" />
    </svg>;
}

export function Undo() {
    return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
        <path d="M5.5 3 2.5 6l3 3" /><path d="M3 6h6.5a4 4 0 0 1 0 8H7" />
    </svg>;
}
