// The episode module's label rule (GLOSSARY.md: Label). Kept apart from episode.ts and pilot.ts so the
// listing surfaces can label a stored summary without bundling the compiler or the pilot's script.

export const PILOT_SLUG = 'opening-week';

/** the episode's slot on the schedule: "Pilot" for the first show, otherwise its week */
export const episodeLabel = (episode: { slug: string; week: number | null }): string | null =>
    episode.slug === PILOT_SLUG ? 'Pilot' : episode.week !== null ? `Week ${episode.week}` : null;

/** the label and title as a headline, such as "Week 6: Recap"; just the title when there's no label */
export const episodeHeadline = (episode: { slug: string; week: number | null; title: string }): string => {
    const label = episodeLabel(episode);
    return label ? `${label}: ${episode.title}` : episode.title;
};
