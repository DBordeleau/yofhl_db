import type { CSSProperties } from 'react';
import styles from './gold-dust.module.css';

// Seeded so the server and client render the same particles.
function seeded(seed: number) {
    return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}
const random = seeded(11);
const between = (a: number, b: number) => a + random() * (b - a);
const fixed = (n: number, digits = 1) => Number(n.toFixed(digits));
const vars = (values: Record<string, string | number>) => values as CSSProperties;

// Every seventh flake drifts nearer the camera: larger, faster and fully opaque.
const flakes = Array.from({ length: 110 }, (_, i) => {
    const near = i % 7 === 0;
    const size = near ? between(7, 10) : between(2.5, 5);
    const duration = near ? between(16, 22) : between(24, 40);
    return vars({
        left: `${fixed(between(0, 100))}%`, '--size': `${fixed(size)}px`, '--duration': `${fixed(duration)}s`, '--delay': `-${fixed(random() * duration)}s`,
        '--drift': `${fixed(between(-70, 70), 0)}px`, '--flip': `${fixed(between(2.4, 5))}s`, '--turn': `${fixed(between(0, 90), 0)}deg`, '--opacity': near ? .95 : fixed(between(.45, .85), 2),
    });
});
const bokeh = [[64, 22, 58], [88, 62, 34], [44, 78, 46], [8, 30, 26], [74, 86, 22], [96, 12, 40], [28, 12, 18]].map(([x, y, size], i) =>
    vars({ left: `${x}%`, top: `${y}%`, '--size': `${size}px`, '--duration': `${16 + i * 3}s`, '--dx': `${i % 2 ? 30 : -36}px`, '--dy': `${i % 2 ? -24 : 20}px` }));
const glints = [[58, 18], [93, 30], [71, 70], [83, 8], [36, 64], [99, 82], [49, 40]].map(([x, y], i) =>
    vars({ left: `${x}%`, top: `${y}%`, '--size': `${26 + (i % 3) * 12}px`, '--duration': `${fixed(5.5 + i * 1.3)}s`, '--delay': `${fixed(.8 + i * 1.7)}s` }));
// Camera flashes popping along the bottom of the hero.
const flashes = Array.from({ length: 12 }, () =>
    vars({ left: `${fixed(between(3, 97))}%`, top: `${fixed(between(72, 98))}%`, '--duration': `${fixed(between(5, 11))}s`, '--delay': `${fixed(between(0, 9))}s` }));
const shafts = [['58%', '9s', .9], ['72%', '12s', .6], ['86%', '10s', .75]].map(([x, duration, opacity]) => vars({ '--x': x, '--duration': duration, '--opacity': opacity }));

// The record book hero background: gilt flakes drifting through soft light, with the odd glint and flashbulb.
export default function GoldDust() {
    return <div className={styles.stage} aria-hidden="true">
        <div className={styles.backlight} />
        {shafts.map((style, i) => <div key={i} className={styles.shaft} style={style} />)}
        {bokeh.map((style, i) => <span key={i} className={styles.bokeh} style={style} />)}
        {flakes.map((style, i) => <span key={i} className={styles.flake} style={style}><i /></span>)}
        {glints.map((style, i) => <span key={i} className={styles.glint} style={style} />)}
        {flashes.map((style, i) => <span key={i} className={styles.flash} style={style} />)}
    </div>;
}
