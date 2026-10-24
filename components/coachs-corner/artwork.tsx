'use client';

import React from 'react';
import { artUrl } from '@/lib/coachs-corner/media';
import { artFor, type CharacterId } from '@/lib/coachs-corner/cast';

const SIZES = '(max-width: 700px) 60vw, 42vw';
// Mouth pairs are separate drawings. Only this face region should change on a
// syllable; swapping their complete images makes clothing and hands shimmer.
const MOUTH_CLIPS: Record<string, string> = {
    'don-talk': 'ellipse(11% 10% at 54% 41%)',
    'don-point-talk': 'ellipse(11% 10% at 49% 41%)',
    'don-thumbs-up-talk': 'ellipse(11% 10% at 54% 41%)',
    'don-halloween-talk': 'ellipse(11% 10% at 54% 41%)',
    'don-halloween-point-talk': 'ellipse(11% 10% at 49% 41%)',
    'don-halloween-thumbs-up-talk': 'ellipse(11% 10% at 54% 41%)',
    'don-alternate-1-talk': 'ellipse(11% 10% at 54% 41%)',
    'don-alternate-1-point-talk': 'ellipse(11% 10% at 49% 41%)',
    'don-alternate-1-thumbs-up-talk': 'ellipse(11% 10% at 54% 41%)',
    'don-alternate-2-talk': 'ellipse(11% 10% at 54% 41%)',
    'don-alternate-2-point-talk': 'ellipse(11% 10% at 49% 41%)',
    'don-alternate-2-thumbs-up-talk': 'ellipse(11% 10% at 54% 41%)',
    'don-alternate-3-talk': 'ellipse(11% 10% at 54% 41%)',
    'don-alternate-3-point-talk': 'ellipse(11% 10% at 49% 41%)',
    'don-alternate-3-thumbs-up-talk': 'ellipse(11% 10% at 54% 41%)',
    'ron-talk': 'ellipse(14% 8% at 45% 43%)',
};

/** Static AVIF files only, at 640 px or 1254 px. */
export default function Artwork({ pose, smallOnly = false, active, className, mouthClip }: {
    pose: string;
    smallOnly?: boolean;
    active?: boolean;
    className?: string;
    mouthClip?: string;
}) {
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            className={className}
            src={artUrl(pose, true)}
            srcSet={smallOnly ? undefined : `${artUrl(pose, true)} 640w, ${artUrl(pose)} 1254w`}
            sizes={smallOnly ? undefined : SIZES}
            alt=""
            draggable={false}
            data-on={active || undefined}
            data-mouth={mouthClip ? true : undefined}
            style={mouthClip ? { clipPath: mouthClip } : undefined}
        />
    );
}

export function HostArtwork({ who, gesture, open, art }: { who: CharacterId; gesture: string; open: boolean; art: string[] }) {
    const current = artFor(who, gesture, open);
    const body = artFor(who, gesture, false);
    return <>{art.map(id => <Artwork key={id} pose={id} active={id === body || id === current} mouthClip={MOUTH_CLIPS[id]} />)}</>;
}
