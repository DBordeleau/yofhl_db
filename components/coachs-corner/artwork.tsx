'use client';

import React from 'react';
import { artUrl } from '@/lib/coachs-corner/media';
import { POPPY, POPPY_TILT } from '@/lib/coachs-corner/poppy';
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
                <g transform={`rotate(${POPPY_TILT})`}>
                    {POPPY.map((shape, index) => {
                        switch (shape.kind) {
                            case 'ellipse': return <ellipse key={index} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} fill={shape.fill} fillOpacity={shape.fillOpacity} />;
                            case 'circle': return <circle key={index} cx={shape.cx} cy={shape.cy} r={shape.r} fill={shape.fill} stroke={shape.stroke} strokeWidth={shape.strokeWidth} />;
                            case 'path': return <path key={index} d={shape.d} fill="none" stroke={shape.stroke} strokeWidth={shape.strokeWidth} strokeOpacity={shape.strokeOpacity} strokeLinecap="round" />;
                        }
                    })}
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
