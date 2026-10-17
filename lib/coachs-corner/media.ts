import manifest from './media.json';

/** Hashes are generated before dev/build; no hashing or file access in the player. */
export function mediaUrl(source: string): string {
    const url = (manifest as Record<string, string>)[source];
    if (!url) throw new Error(`Missing Coach's Corner media: ${source}. Run npm run coachs:assets.`);
    return url;
}

// Set false and rebuild to restore the original WebP artwork everywhere.
export const PREFER_AVIF = true;
export const artUrl = (id: string, small = false, format: 'webp' | 'avif' = 'webp') =>
    mediaUrl(`/coachs-corner/robots-v2/${id}${small ? '-640' : ''}.${format}`);
export const THEME_URL = mediaUrl('/coachs-corner/coachs_corner_theme.mp3');
