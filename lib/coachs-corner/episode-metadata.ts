import type { Metadata } from 'next';
import type { Episode } from './episode';
import { episodeHeadline } from './episode-label';

// What an episode's link tells the group chat, Discord, Slack and X: its label and title as the headline,
// and its pull quote as the reason to click. The preview image comes from the episode's opengraph-image route.

/** what the show is, for a link with no pull quote and for the Coach's Corner index */
export const SHOW_DESCRIPTION = 'Don and Ron break down the week in the YOFHL.';

/** a published episode's page metadata, from its stored row and its compiled Episode */
export function episodeMetadata(episode: { slug: string; title: string; week: number | null }, compiled: Pick<Episode, 'pullQuote'>): Metadata {
    const title = `${episodeHeadline(episode)} · Coach's Corner`;
    const description = compiled.pullQuote?.text ?? SHOW_DESCRIPTION;
    return {
        title,
        description,
        alternates: { canonical: `/coachs-corner/${episode.slug}` },
        openGraph: { type: 'article', siteName: 'YOFHL', title, description },
        twitter: { card: 'summary_large_image', title, description },
    };
}
