import type { CSSProperties } from 'react';
import { teamMotif } from './team-branding-motifs';

export const backgroundStyles = [
    { value: 'stripes', label: 'Jersey stripes', description: 'Angled bands & club colours' },
    { value: 'gradient', label: 'Arena gradient', description: 'A softer wash of both colours' },
    { value: 'hoops', label: 'Heritage hoops', description: 'Broad horizontal jersey bands' },
    { value: 'split', label: 'Split colours', description: 'A bold two-tone diagonal' },
    { value: 'chevron', label: 'Victory chevron', description: 'Jersey chevrons with accent piping', tertiaryFocus: true },
    { value: 'weave', label: 'Diamond weave', description: 'Secondary bands, fine accent threads', tertiaryFocus: true },
] as const;

export const signatureStyles = [
    { value: 'fleur', label: 'Fleur-de-lis', description: 'An outlined owl crest nested in a fleur-de-lis', teamIds: [7] },
    { value: 'horns', label: 'Devil horns', description: 'A horned devil with a sharp, sinister gaze', teamIds: [1] },
    { value: 'fangs', label: 'Devil cat', description: 'A cat face with horn-shaped ears and white fangs', teamIds: [2] },
    { value: 'scythe', label: 'Reaper’s scythe', description: 'An outlined hooded reaper carrying a sweeping scythe', teamIds: [9] },
    { value: 'arcane', label: 'Arcane crest', description: 'A crooked wizard hat and flowing beard with spell runes', teamIds: [4] },
    { value: 'tides', label: 'Siren’s tide', description: 'A breaking wave with a bright foam edge and rolling surf', teamIds: [8] },
    { value: 'mullet', label: 'Mullet sunrise', description: 'Flowing hockey hair against a striped sunrise', teamIds: [5] },
    { value: 'western', label: 'Lone star', description: 'A faceted star crest with bold flag bands', teamIds: [6] },
    { value: 'flight', label: 'Goose flight', description: 'An outlined goose with sweeping wings and a bright cheek patch', teamIds: [3] },
] as const;

export const allBackgroundStyles = [...backgroundStyles, ...signatureStyles];

export interface TeamColours {
    primary: string;
    secondary: string;
    tertiary: string;
    treatment: typeof allBackgroundStyles[number]['value'];
}

// Suggested palettes for teams that have not saved a brand yet, and editor presets.
export const suggestedPalettes: Record<number, TeamColours> = {
    1: { primary: '#A71930', secondary: '#E6B85C', tertiary: '#FFFFFF', treatment: 'stripes' },
    2: { primary: '#BE2038', secondary: '#181A20', tertiary: '#FFFFFF', treatment: 'stripes' },
    3: { primary: '#182C4B', secondary: '#AA2A3A', tertiary: '#FFFFFF', treatment: 'stripes' },
    4: { primary: '#55328A', secondary: '#D7DC58', tertiary: '#FFFFFF', treatment: 'stripes' },
    5: { primary: '#242653', secondary: '#FFAD79', tertiary: '#FFC44F', treatment: 'stripes' },
    6: { primary: '#285B48', secondary: '#EDB34C', tertiary: '#FFFFFF', treatment: 'stripes' },
    7: { primary: '#185C9C', secondary: '#EFBC55', tertiary: '#FFFFFF', treatment: 'stripes' },
    8: { primary: '#217C78', secondary: '#AFDDE0', tertiary: '#FFFFFF', treatment: 'stripes' },
    9: { primary: '#158D32', secondary: '#E94B1D', tertiary: '#FFFFFF', treatment: 'stripes' },
    10: { primary: '#53318A', secondary: '#EB85B9', tertiary: '#FFFFFF', treatment: 'stripes' },
    11: { primary: '#B02236', secondary: '#2C65AD', tertiary: '#FFFFFF', treatment: 'stripes' },
    12: { primary: '#275A45', secondary: '#D7C05E', tertiary: '#FFFFFF', treatment: 'stripes' },
    13: { primary: '#1E466B', secondary: '#EB6957', tertiary: '#FFFFFF', treatment: 'stripes' },
    14: { primary: '#225C99', secondary: '#BEDDF4', tertiary: '#FFFFFF', treatment: 'stripes' },
};

export const fallbackColours: TeamColours = { primary: '#26365F', secondary: '#C8102E', tertiary: '#FFFFFF', treatment: 'stripes' };
export const isHexColour = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);

export function parseTeamColours(value: unknown, teamId?: number): TeamColours | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const colours = value as Partial<Omit<TeamColours, 'treatment'>> & { treatment?: string };
    const treatment = allBackgroundStyles.find(style => style.value === colours.treatment)?.value;
    if (!isHexColour(colours.primary) || !isHexColour(colours.secondary) || !isHexColour(colours.tertiary) || !treatment) return null;
    const signature = signatureStyles.find(style => style.value === treatment);
    if (signature && teamId !== undefined && !(signature.teamIds as readonly number[]).includes(teamId)) return null;
    return { primary: colours.primary.toUpperCase(), secondary: colours.secondary.toUpperCase(), tertiary: colours.tertiary.toUpperCase(), treatment };
}

// Shading gives the base some depth. Artwork uses the exact selected colours;
// the surface's directional scrim protects text without muting the whole design.
function shade(hex: string, strength: number) {
    const rgb = [1, 3, 5].map(offset => Math.round(parseInt(hex.slice(offset, offset + 2), 16) * strength));
    return `rgb(${rgb.join(' ')})`;
}

export function colourVariables(colours: TeamColours): CSSProperties {
    const motif = teamMotif(colours.treatment, colours.secondary, colours.tertiary, shade(colours.primary, 0.45), colours.primary);
    return {
        '--team-primary': colours.primary,
        '--team-secondary': colours.secondary,
        '--team-tertiary': colours.tertiary,
        '--team-detail': colours.tertiary,
        '--team-base': shade(colours.primary, 0.8),
        '--team-surface': 'linear-gradient(110deg, var(--team-base), var(--team-primary))',
        ...(motif ? {
            '--team-artwork': motif.emblem,
            '--team-watermark': motif.watermark,
            ...(motif.accents ? { '--team-accent-artwork': motif.accents } : {}),
        } : {}),
    } as CSSProperties;
}
