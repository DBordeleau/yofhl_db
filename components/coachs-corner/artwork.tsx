'use client';

import React, { useState } from 'react';
import { artUrl, PREFER_AVIF } from '@/lib/coachs-corner/media';
import { artFor, type CharacterId } from '@/lib/coachs-corner/cast';

const SIZES = '(max-width: 700px) 60vw, 42vw';
// Mouth pairs are separate drawings. Only this face region should change on a
// syllable; swapping their complete images makes clothing and hands shimmer.
const MOUTH_CLIPS: Record<string, string> = {
    'don-talk': 'ellipse(11% 10% at 54% 41%)',
    'don-point-talk': 'ellipse(11% 10% at 49% 41%)',
    'don-thumbs-up-talk': 'ellipse(11% 10% at 54% 41%)',
    'ron-talk': 'ellipse(14% 8% at 45% 43%)',
};

/** Static files only: browser format selection, with the original WebP fallback. */
export default function Artwork({ pose, smallOnly = false, active, className, preferAvif = PREFER_AVIF, mouthClip }: {
    pose: string;
    smallOnly?: boolean;
    active?: boolean;
    className?: string;
    preferAvif?: boolean;
    mouthClip?: string;
}) {
    const [avifFailed, setAvifFailed] = useState(false);
    const useAvif = preferAvif && !avifFailed;
    const srcSet = (format: 'avif' | 'webp') => smallOnly ? artUrl(pose, true, format)
        : `${artUrl(pose, true, format)} 640w, ${artUrl(pose, false, format)} 1254w`;
    return (
        <picture>
            {useAvif && <source type="image/avif" srcSet={srcSet('avif')} sizes={smallOnly ? undefined : SIZES} />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                className={className}
                src={artUrl(pose, true)}
                srcSet={smallOnly ? undefined : srcSet('webp')}
                sizes={smallOnly ? undefined : SIZES}
                alt=""
                draggable={false}
                data-on={active || undefined}
                data-mouth={mouthClip ? true : undefined}
                style={mouthClip ? { clipPath: mouthClip } : undefined}
                onError={useAvif ? () => setAvifFailed(true) : undefined}
            />
        </picture>
    );
}

export function HostArtwork({ who, gesture, open, art, preferAvif }: { who: CharacterId; gesture: string; open: boolean; art: string[]; preferAvif?: boolean }) {
    const current = artFor(who, gesture, open);
    const body = artFor(who, gesture, false);
    return <>{art.map(id => <Artwork key={id} pose={id} active={id === body || id === current} mouthClip={MOUTH_CLIPS[id]} preferAvif={preferAvif} />)}</>;
}
