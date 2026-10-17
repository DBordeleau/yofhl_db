import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ShowPage from '@/components/coachs-corner/show-page';
import { getPublishedEpisode, getPublishedEpisodes, getStudioBanners, getEpisodePlayers, getStudioTeams } from '@/lib/data/coachs-corner';

export const metadata: Metadata = {
    title: "Coach's Corner · YOFHL DB",
    description: 'Don and Ron break down the week in the YOFHL.',
};

// the latest episode
export default async function CoachsCorner() {
    const [episodes, teams] = await Promise.all([getPublishedEpisodes(), getStudioTeams()]);
    const episode = episodes[0] && await getPublishedEpisode(episodes[0].slug);
    if (!episode) notFound();
    const [players, banners] = await Promise.all([getEpisodePlayers(episode), getStudioBanners()]);
    return <ShowPage episode={episode} episodes={episodes} teams={teams} players={players} banners={banners} />;
}
