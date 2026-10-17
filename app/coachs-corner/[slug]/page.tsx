import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ShowPage from '@/components/coachs-corner/show-page';
import { getPublishedEpisode, getPublishedEpisodes, getStudioBanners, getEpisodePlayers, getStudioTeams } from '@/lib/data/coachs-corner';

type Props = { params: Promise<{ slug: string }> };

// Generate each URL on first visit, then cache it until publication invalidates
// it. New episode slugs remain available without a new deployment.
export function generateStaticParams() { return []; }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const episode = await getPublishedEpisode((await params).slug);
    if (!episode) return { title: "Coach's Corner · YOFHL DB" };
    const week = episode.week !== null ? `Week ${episode.week}: ` : '';
    return { title: `${week}${episode.title} · Coach's Corner`, description: 'Don and Ron break down the week in the YOFHL.' };
}

export default async function CoachsCornerEpisode({ params }: Props) {
    const { slug } = await params;
    const [episode, episodes, teams] = await Promise.all([getPublishedEpisode(slug), getPublishedEpisodes(), getStudioTeams()]);
    if (!episode) notFound();
    const [players, banners] = await Promise.all([getEpisodePlayers(episode), getStudioBanners()]);
    return <ShowPage episode={episode} episodes={episodes} teams={teams} players={players} banners={banners} />;
}
