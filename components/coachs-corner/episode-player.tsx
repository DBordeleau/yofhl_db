'use client';

import { useMemo } from 'react';
import { episodeFrom } from '@/lib/coachs-corner/episode';
import Player, { type PlayerProps } from './player';

// Public pages send the script, not the compiled episode: the compiled timeline and audio cues are about
// fifty times the script's size, and would be in every cached page's HTML. The browser compiles the same
// script with the same module, so the player sees exactly what the page compiled for its share card.
export default function EpisodePlayer({ script, slug, ...props }: Omit<PlayerProps, 'episode'> & { script: string; slug: string }) {
    const episode = useMemo(() => episodeFrom(script, { slug }), [script, slug]);
    return <Player episode={episode} {...props} />;
}
