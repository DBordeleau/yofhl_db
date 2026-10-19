// Kept apart from pilot.ts so client code can name the pilot without bundling its script.

export const PILOT_SLUG = 'opening-week';

/** the episode's slot on the schedule: "Pilot" for the first show, otherwise its week */
export const episodeLabel = (episode: { slug: string; week: number | null }): string | null =>
    episode.slug === PILOT_SLUG ? 'Pilot' : episode.week !== null ? `Week ${episode.week}` : null;
