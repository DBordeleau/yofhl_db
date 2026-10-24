import manifest from './media.json';

/** Hashes are generated before dev/build; no hashing or file access in the player. */
export function mediaUrl(source: string): string {
    const url = (manifest as Record<string, string>)[source];
    if (!url) throw new Error(`Missing Coach's Corner media: ${source}. Run npm run coachs:assets.`);
    return url;
}

// Only AVIF artwork ships; the WebP exports stay in assets/coachs-corner/robots-v2 for the catalog.
export const artUrl = (id: string, small = false) =>
    mediaUrl(`/coachs-corner/robots-v2/${id}${small ? '-640' : ''}.avif`);
export const THEME_URL = mediaUrl('/coachs-corner/coachs_corner_theme.mp3');
