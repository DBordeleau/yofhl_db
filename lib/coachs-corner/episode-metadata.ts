import type { Metadata } from 'next';
import type { Episode } from './episode';
import { episodeLabel } from './episode-label';

// What an episode's link tells the group chat, Discord, Slack and X: its label and title as the headline,
// and its pull quote as the reason to click. The preview image comes from the episode's opengraph-image route.

const FALLBACK = 'Don and Ron break down the week in the YOFHL.';

/** a published episode's page metadata, from its stored row and its compiled Episode */
export function episodeMetadata(episode: { slug: string; title: string; week: number | null }, compiled: Pick<Episode, 'pullQuote'>): Metadata {
    const label = episodeLabel(episode);
    const title = `${label ? `${label}: ` : ''}${episode.title} · Coach's Corner`;
    const description = compiled.pullQuote?.text ?? FALLBACK;
    return {
        title,
        description,
        openGraph: { type: 'article', siteName: 'YOFHL', title, description },
        twitter: { card: 'summary_large_image', title, description },
    };
}
