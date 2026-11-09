'use client';

import React from 'react';
import { artUrl } from '@/lib/coachs-corner/media';
import { artFor, type CharacterId, type Lapel } from '@/lib/coachs-corner/cast';

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
    'don-remembrance-talk': 'ellipse(11% 10% at 54% 41%)',
    'don-remembrance-point-talk': 'ellipse(11% 10% at 49% 41%)',
    'don-remembrance-thumbs-up-talk': 'ellipse(11% 10% at 54% 41%)',
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

// Where a poppy sits over each host's heart (the wearer's left lapel), as [x, y, scale] in the
// 1254 px frame. Every wardrobe shares its pose's geometry, so Don's suits use one spot per pose.
// null: Don's hand covers that lapel while he grabs the mic.
const DON_LAPEL: [number, number, number] = [840, 665, 0.85];
const RON_LAPEL: [number, number, number] = [821, 708, 0.85];
const LAPEL_SPOTS: Record<string, [number, number, number] | null> = {
    'don-point': [777, 665, 0.85],
    'don-lean-camera': [853, 646, 1],
    'don-mic-remove': null,
};
export const lapelSpot = (who: CharacterId, body: string) => {
    const pose = body.replace(/^don-(?:halloween|remembrance|alternate-\d)-/, 'don-');
    return pose in LAPEL_SPOTS ? LAPEL_SPOTS[pose] : who === 'don' ? DON_LAPEL : RON_LAPEL;
};

/** Same square frame as the artwork; give it the artwork's className to sit in the same box. */
export function Poppy({ spot, className }: { spot: [number, number, number] | null; className?: string }) {
    const [x, y, s] = spot ?? DON_LAPEL;
    return (
        <svg className={className} viewBox="0 0 1254 1254" data-lapel aria-hidden="true">
            <g style={{ transform: `translate(${x}px, ${y}px) scale(${s})`, opacity: spot ? 1 : 0 }}>
                <g transform="rotate(-14)">
                    <ellipse cx="5" cy="8" rx="40" ry="38" fill="#000" fillOpacity=".3" />
                    <g fill="#1a1012">
                        <circle cx="-14" cy="-14" r="27" /><circle cx="14" cy="-14" r="27" />
                        <circle cx="-14" cy="14" r="27" /><circle cx="14" cy="14" r="27" />
                    </g>
                    <circle cx="-14" cy="-14" r="22" fill="#b10e25" />
                    <circle cx="14" cy="-14" r="22" fill="#b10e25" />
                    <path d="M0 -31V-12" stroke="#1a1012" strokeWidth="4" strokeLinecap="round" />
                    <circle cx="-14" cy="14" r="22" fill="#e11a33" stroke="#1a1012" strokeWidth="4" />
                    <circle cx="14" cy="14" r="22" fill="#e11a33" stroke="#1a1012" strokeWidth="4" />
                    <g fill="none" stroke="#ff8a93" strokeWidth="4" strokeLinecap="round">
                        <path d="M-29 10q3-9 12-11" /><path d="M2 8q4-8 12-9" />
                        <path d="M-27 -20q4-8 12-9" strokeOpacity=".55" />
                    </g>
                    <circle r="11" fill="#111" />
                    <circle cx="-3" cy="-4" r="3.5" fill="#5c5c5c" />
                </g>
            </g>
        </svg>
    );
}

export function HostArtwork({ who, gesture, open, art, lapel }: { who: CharacterId; gesture: string; open: boolean; art: string[]; lapel?: Lapel }) {
    const current = artFor(who, gesture, open);
    const body = artFor(who, gesture, false);
    return (
        <>
            {art.map(id => <Artwork key={id} pose={id} active={id === body || id === current} mouthClip={MOUTH_CLIPS[id]} />)}
            {lapel === 'poppy' && <Poppy spot={lapelSpot(who, body)} />}
        </>
    );
}
