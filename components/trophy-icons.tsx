import { FC, SVGProps } from 'react';

// rendered once in the root layout so every trophy icon can reference the same gold gradient
export const GoldGradientDefs: FC = () => (
    <svg width="0" height="0" aria-hidden="true" className="absolute">
        <defs>
            <linearGradient id="yofhl-gold" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#FFF0B8" />
                <stop offset=".38" stopColor="#E7B83F" />
                <stop offset=".66" stopColor="#A97A0C" />
                <stop offset="1" stopColor="#F3CF68" />
            </linearGradient>
        </defs>
    </svg>
);

type IconProps = SVGProps<SVGSVGElement> & { title?: string; detailed?: boolean };

// tiered cup used for Jagr Cup championships everywhere on the site
export const JagrCupIcon: FC<IconProps> = ({ title, detailed = false, ...props }) => {
    const stroke = detailed ? 0.3 : 0.6;
    return (
        <svg viewBox="0 0 24 32" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} {...props}>
            {title && <title>{title}</title>}
            <path d="M4 2h16v3c0 4.4-3.6 7.6-8 7.6S4 9.4 4 5z" fill="url(#yofhl-gold)" stroke="#8A6410" strokeWidth={stroke} />
            <rect x="10" y="12.6" width="4" height="3" fill="url(#yofhl-gold)" />
            <rect x="7.5" y="15.6" width="9" height="4" rx=".6" fill="url(#yofhl-gold)" stroke="#8A6410" strokeWidth={stroke} />
            <rect x="6" y="19.6" width="12" height="4.4" rx=".6" fill="url(#yofhl-gold)" stroke="#8A6410" strokeWidth={stroke} />
            <rect x="4.5" y="24" width="15" height="6" rx=".8" fill="url(#yofhl-gold)" stroke="#8A6410" strokeWidth={stroke} />
            {detailed && <path d="M6 21.8h12M5.2 27h13.6" stroke="#8A6410" strokeWidth={stroke} opacity=".7" />}
            <path d="M7 4.4c.2 2 1.2 3.6 2.8 4.4" stroke="#FFFFFF" strokeOpacity=".8" strokeWidth={detailed ? 0.6 : 1} fill="none" strokeLinecap="round" />
        </svg>
    );
};

// handled trophy on a plinth used for individual awards
export const AwardTrophyIcon: FC<IconProps> = ({ title, ...props }) => (
    <svg viewBox="0 0 32 36" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} {...props}>
        {title && <title>{title}</title>}
        <path d="M9 6H5.5v2.6c0 3 2.2 5.3 5.2 5.5M23 6h3.5v2.6c0 3-2.2 5.3-5.2 5.5" fill="none" stroke="url(#yofhl-gold)" strokeWidth="1.8" />
        <path d="M9 2.5h14V11c0 4.4-3.1 8-7 8s-7-3.6-7-8z" fill="url(#yofhl-gold)" stroke="#8A6410" strokeWidth=".3" />
        <rect x="14" y="19" width="4" height="5" fill="url(#yofhl-gold)" />
        <rect x="10.5" y="24" width="11" height="3" rx="1" fill="url(#yofhl-gold)" stroke="#8A6410" strokeWidth=".25" />
        <rect x="8" y="27" width="16" height="7" rx="1.2" fill="#0B1022" stroke="url(#yofhl-gold)" strokeWidth=".7" />
        <rect x="12.5" y="29.4" width="7" height="2" rx=".4" fill="url(#yofhl-gold)" />
        <path d="M11.5 5c0 3 .8 5.6 2.4 7" stroke="#FFFFFF" strokeOpacity=".85" strokeWidth=".6" fill="none" strokeLinecap="round" />
    </svg>
);

// row of small cups next to a player's name, one per championship
export const CupRow: FC<{ count: number; className?: string }> = ({ count, className = 'h-[19px] w-[14px]' }) => {
    if (count <= 0) return null;
    return (
        <span className="inline-flex items-end gap-0.5" title={`${count} Jagr Cup${count === 1 ? '' : 's'}`}>
            {Array.from({ length: count }).map((_, i) => (
                <JagrCupIcon key={i} className={`${className} drop-shadow-[0_1px_1px_rgba(138,100,16,.35)]`} />
            ))}
            <span className="sr-only">{count} Jagr Cup{count === 1 ? '' : 's'}</span>
        </span>
    );
};
