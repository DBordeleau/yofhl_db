// Link arrow that nudges toward where it points when its link or button is hovered (see .nudge-arrow in globals.css).
// `out` is for links that leave the site; internal links point left, right, or down.
const GLYPHS = { left: '←', right: '→', down: '↓', out: '↗' } as const;

export default function Arrow({ direction = 'right', className = '' }: { direction?: keyof typeof GLYPHS; className?: string }) {
    return <span aria-hidden="true" className={`nudge-arrow nudge-${direction} ${className}`}>{GLYPHS[direction]}</span>;
}
