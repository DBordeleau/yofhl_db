'use client';

import type { HTMLAttributes } from 'react';
import { colourVariables, signatureStyles, type TeamColours } from '@/lib/team-branding';
import { useTeamBranding } from './branding-provider';
import styles from './branding.module.css';

export default function TeamBranding({ teamId, colours, as: Tag = 'div', className = '', style, ...props }: HTMLAttributes<HTMLElement> & {
    teamId?: number | null;
    colours?: TeamColours;
    as?: 'div' | 'section' | 'header';
}) {
    const palettes = useTeamBranding();
    const palette = colours ?? (teamId ? palettes[teamId] : null);
    return <Tag {...props} className={`${className}${palette ? ` ${styles.scope}` : ''}`} style={palette ? { ...style, ...colourVariables(palette) } : style} data-team-id={teamId} data-treatment={palette?.treatment} data-team-signature={palette && signatureStyles.some(option => option.value === palette.treatment) ? '' : undefined} />;
}
