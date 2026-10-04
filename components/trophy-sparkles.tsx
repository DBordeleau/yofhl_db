import type { CSSProperties } from 'react';

export default function TrophySparkles({ seed }: { seed: string }) {
    // Stable randomness keeps server/client markup identical and varies each trophy display.
    let state = 2166136261;
    for (const character of seed) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
    const random = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };

    return (
        <span className="trophy-sparkles pointer-events-none absolute inset-0" aria-hidden="true">
            {Array.from({ length: 2 * (7 + Math.floor(random() * 3)) }, (_, index) => {
                const glint = index % 3 === 0;
                const size = glint ? 6 + random() * 5 : 1.5 + random() * 1.5;
                const duration = 4.5 + random() * 6;
                return <span key={index} className={`trophy-particle${glint ? ' trophy-particle-glint' : ''}`} style={{
                    left: `${12 + random() * 76}%`,
                    top: `${8 + random() * 80}%`,
                    width: `${size}px`,
                    height: `${size}px`,
                    color: random() > 0.45 ? '#FFF8E5' : '#F0C75E',
                    animationDuration: `${duration}s`,
                    animationDelay: `${-random() * duration}s`,
                    '--sparkle-peak': 0.5 + random() * 0.5,
                    '--sparkle-drift': `${-3 + random() * 6}px`,
                } as CSSProperties} />;
            })}
        </span>
    );
}
