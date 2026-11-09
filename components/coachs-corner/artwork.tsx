'use client';

import React from 'react';
import { artUrl } from '@/lib/coachs-corner/media';
import { artFor, lapelFor, mouthClipFor, type CharacterId, type Lapel, type LapelSpot, type Pose } from '@/lib/coachs-corner/cast';

const SIZES = '(max-width: 700px) 60vw, 42vw';

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

// A hidden poppy rests on Don's usual lapel, so the next pose's spot slides from there.
const HIDDEN_LAPEL = lapelFor('don', artFor('don', 'rest', { mouth: 'closed' }))!;

/** Same square frame as the artwork; give it the artwork's className to sit in the same box. */
export function Poppy({ spot, className }: { spot: LapelSpot | null; className?: string }) {
    const [x, y, s] = spot ?? HIDDEN_LAPEL;
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

export function HostArtwork({ who, gesture, open, art, lapel }: { who: CharacterId; gesture: string; open: boolean; art: Pose[]; lapel?: Lapel }) {
    const current = artFor(who, gesture, { mouth: open ? 'open' : 'closed' });
    const body = artFor(who, gesture, { mouth: 'closed' });
    return (
        <>
            {art.map(id => <Artwork key={id} pose={id} active={id === body || id === current} mouthClip={mouthClipFor(who, id)} />)}
            {lapel === 'poppy' && <Poppy spot={lapelFor(who, body)} />}
        </>
    );
}
