import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ShowPage from '@/components/coachs-corner/show-page';
import { episodeFrom } from '@/lib/coachs-corner/episode';
import { getPublishedEpisode, getPublishedEpisodes, getStudioBanners, getEpisodePlayers, getEpisodeTeams } from '@/lib/data/coachs-corner';

export const metadata: Metadata = {
    title: "Coach's Corner · YOFHL",
    description: 'Don and Ron break down the week in the YOFHL.',
};

// the latest episode
export default async function CoachsCorner() {
    const episodes = await getPublishedEpisodes();
    const episode = episodes[0] && await getPublishedEpisode(episodes[0].slug);
    if (!episode) notFound();
    // the share card, pull quote and player refs read this; the player compiles the same script in the browser
    const compiled = episodeFrom(episode.script, { slug: episode.slug });
    // the teams it aired with: its team snapshot, or the live list for an episode published before snapshots
    const [players, teams, banners] = await Promise.all([getEpisodePlayers(episode, compiled), getEpisodeTeams(episode), getStudioBanners()]);
    return <ShowPage episode={episode} compiled={compiled} episodes={episodes} teams={teams} players={players} banners={banners} />;
}
