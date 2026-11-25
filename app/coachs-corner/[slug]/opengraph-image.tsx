import { notFound } from 'next/navigation';
import { episodeFrom } from '@/lib/coachs-corner/episode';
import { getPublishedEpisode } from '@/lib/data/coachs-corner';
import { episodeShareCard } from '@/lib/share/model';
import { renderEpisodePreview } from '@/lib/share/episode-preview';
import { PREVIEW_HEIGHT, PREVIEW_WIDTH } from '@/lib/share/preview';

// The episode's link preview. It reads the episode through the same tag-cached lookup as the page, so publishing
// or republishing (which expires that tag) refreshes it. X uses this image too, through summary_large_image.

export const alt = "Don and Ron at the Coach's Corner desk";
export const size = { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT };
export const contentType = 'image/png';

// Rendered on the first unfurl, then cached until publication invalidates it, like the page.
export function generateStaticParams() { return []; }

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
    const episode = await getPublishedEpisode((await params).slug);
    if (!episode) notFound();
    return renderEpisodePreview(episodeShareCard(episode, episodeFrom(episode.script, { slug: episode.slug })));
}
