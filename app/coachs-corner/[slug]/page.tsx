import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ShowPage from '@/components/coachs-corner/show-page';
import { episodeFrom } from '@/lib/coachs-corner/episode';
import { episodeLabel } from '@/lib/coachs-corner/episode-label';
import { getPublishedEpisode, getPublishedEpisodes, getStudioBanners, getEpisodePlayers, getStudioTeams } from '@/lib/data/coachs-corner';

type Props = { params: Promise<{ slug: string }> };

// Generate each URL on first visit, then cache it until publication invalidates
// it. New episode slugs remain available without a new deployment.
export function generateStaticParams() { return []; }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const episode = await getPublishedEpisode((await params).slug);
    if (!episode) return { title: "Coach's Corner · YOFHL" };
    const label = episodeLabel(episode);
    return { title: `${label ? `${label}: ` : ''}${episode.title} · Coach's Corner`, description: 'Don and Ron break down the week in the YOFHL.' };
}

export default async function CoachsCornerEpisode({ params }: Props) {
    const { slug } = await params;
    const [episode, episodes, teams] = await Promise.all([getPublishedEpisode(slug), getPublishedEpisodes(), getStudioTeams()]);
    if (!episode) notFound();
    // the share card, pull quote and player refs read this; the player compiles the same script in the browser
    const compiled = episodeFrom(episode.script, { slug: episode.slug });
    const [players, banners] = await Promise.all([getEpisodePlayers(episode, compiled.playerRefs), getStudioBanners()]);
    return <ShowPage episode={episode} compiled={compiled} episodes={episodes} teams={teams} players={players} banners={banners} />;
}
