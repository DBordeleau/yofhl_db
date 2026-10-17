'use client';

import { useState, type CSSProperties } from 'react';
import Image from 'next/image';
import { artworkBounds } from '@/lib/team-logo';
import styles from './team-badge.module.css';

interface TeamBadgeProps {
    logo: string | null;
    abbreviation: string | null;
    teamName: string | null;
    size: number;
    sizeClass?: string;
    // Legacy emphasis values now apply depth to the artwork, without circular rings.
    ring?: 'gold' | 'glow' | 'none';
    priority?: boolean;
}


export default function TeamBadge({ logo, abbreviation, teamName, size, sizeClass, ring = 'none', priority = false }: TeamBadgeProps) {
    const [failedSource, setFailedSource] = useState<string | null>(null);
    const bounds = logo ? artworkBounds[logo] : undefined;
    const fit = bounds ? {
        '--mark-ratio': bounds[4] / bounds[5],
        '--mark-width': `${bounds[0] / bounds[4] * 100}%`,
        '--mark-left': `${-bounds[2] / bounds[4] * 100}%`,
        '--mark-top': `${-bounds[3] / bounds[5] * 100}%`,
    } as CSSProperties : undefined;
    const resolution = Math.ceil(size * (bounds ? bounds[0] / Math.max(bounds[4], bounds[5]) : 1));
    const fallbackSize = Math.max(6.5, Math.min(size * .3, size * 1.1 / Math.max(abbreviation?.length ?? 1, 3)));

    return <span className={`${styles.badge} ${sizeClass ?? ''}`} style={sizeClass ? undefined : { width: size, height: size }} data-team-mark="" data-emphasis={ring}>
        {logo && failedSource !== logo ? <span className={styles.artwork} style={fit} data-fitted={bounds ? '' : undefined}>
            <Image src={logo} alt={teamName ? `${teamName} logo` : ''} width={bounds?.[0] ?? size} height={bounds?.[1] ?? size}
                sizes={`${resolution}px`} priority={priority} onError={() => setFailedSource(logo)} />
        </span> : <span className={styles.monogram} style={{ fontSize: fallbackSize }} role="img" aria-label={teamName ?? abbreviation ?? 'Team'}>{abbreviation ?? '?'}</span>}
    </span>;
}
