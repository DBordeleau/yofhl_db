'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Artwork, { HostArtwork } from './artwork';
import { CAST, CHARACTERS, gestureAction, type CharacterId } from '@/lib/coachs-corner/cast';
import type { CaptionFrame, Frame, HostFrame, Line, Timeline } from '@/lib/coachs-corner/timeline';
import { INTRO_MS } from '@/lib/coachs-corner/timeline';
import type { StudioBanner, StudioPlayer, StudioTeam } from '@/lib/coachs-corner/teams';
import Monitor, { spillColour } from './monitor';
import styles from './coachs-corner.module.css';

// ---------- the arena behind the glass ----------

// deterministic crowd so server and client draw the same seats
const rand = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// banner slots sit inside the window panes, clear of the mullions and the monitor
const BANNER_SLOTS = [92, 196, 364, 470, 1130, 1236, 1404, 1508];

const Arena = memo(function Arena({ banners }: { banners: StudioBanner[] }) {
    const r = rand(7);
    const hung = banners.slice(-BANNER_SLOTS.length);
    const offset = Math.floor((BANNER_SLOTS.length - hung.length) / 2);
    const seat = ['#3a4c80', '#7a3550', '#2f5f8f', '#6b6f86', '#8a6b4a', '#c8d4e6', '#4a3a66'];
    // out-of-focus fans in the far bowl, bigger and brighter toward the glass
    const crowd = Array.from({ length: 170 }, () => {
        const x = r() * 1640 - 20;
        const depth = r();
        const top = 300 - 90 * Math.sin(Math.PI * Math.min(1, Math.max(0, x / 1600)));
        return { x, y: top + 14 + depth * (505 - top - 20), r: 4 + depth * 9, fill: seat[Math.floor(r() * seat.length)], o: 0.28 + depth * 0.35 };
    });
    return (
        <svg className={styles.arena} viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <defs>
                <linearGradient id="cc-roof" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#03060f" />
                    <stop offset="1" stopColor="#0d1733" />
                </linearGradient>
                <linearGradient id="cc-ice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#e3eef8" />
                    <stop offset=".5" stopColor="#bcd2e8" />
                    <stop offset="1" stopColor="#89a6c8" />
                </linearGradient>
                <filter id="cc-soft" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur stdDeviation="2.6" /></filter>
                {/* the rafters sit far behind the glass: softened, dimmed and pulled toward the roof colour */}
                <filter id="cc-far" x="-10%" y="-10%" width="120%" height="120%">
                    <feGaussianBlur stdDeviation="1.8" />
                    <feColorMatrix type="saturate" values=".55" />
                </filter>
                <radialGradient id="cc-iceglow" cx=".5" cy=".35" r=".6">
                    <stop offset="0" stopColor="#ffffff" stopOpacity=".55" />
                    <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="cc-bowlfade" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#000" stopOpacity=".85" />
                    <stop offset="1" stopColor="#000" stopOpacity=".15" />
                </linearGradient>
            </defs>
            <rect width="1600" height="900" fill="url(#cc-roof)" />
            {/* rafters and banners */}
            <path d="M0 70 H1600 M0 128 H1600" stroke="#16213f" strokeWidth="3" />
            <g filter="url(#cc-far)" opacity=".5">
            {hung.map((b, i) => (
                <g key={b.label} transform={`translate(${BANNER_SLOTS[i + offset]} 70)`} className={styles.banner}>
                    <path d="M-40 0 H40 V146 L0 166 L-40 146 Z" fill={b.primary} />
                    <rect x="-40" y="0" width="80" height="24" fill="#f4f7fb" />
                    <text x="0" y="17" textAnchor="middle" fill="#12182e" fontSize="13" fontWeight="900">YOFHL</text>
                    <text x="0" y="52" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="800" letterSpacing="1.5">CHAMPIONS</text>
                    <text x="0" y="80" textAnchor="middle" fill="#fff" fontSize="19" fontWeight="900" className={styles.bannerYear}>{b.label}</text>
                    <text x="0" y="106" textAnchor="middle" fill="#fff" fontSize="15" fontWeight="900">{b.abbreviation}</text>
                    <rect x="-40" y="118" width="80" height="6" fill={b.secondary} />
                    <rect x="-40" y="124" width="80" height="4" fill="#f4f7fb" />
                    <rect x="-40" y="128" width="80" height="6" fill={b.secondary} />
                </g>
            ))}
            </g>
            {/* far-side seating bowl */}
            <path d="M-20 300 Q800 210 1620 300 V520 H-20 Z" fill="#0c1430" />
            <g filter="url(#cc-soft)">{crowd.map((c, i) => <circle key={i} cx={c.x} cy={c.y} r={c.r} fill={c.fill} opacity={c.o} />)}</g>
            <path d="M-20 300 Q800 210 1620 300 V520 H-20 Z" fill="url(#cc-bowlfade)" />
            <path d="M-20 296 Q800 206 1620 296" stroke="#1e2c55" strokeWidth="10" fill="none" />
            <path d="M-20 400 Q800 330 1620 400" stroke="#0a1128" strokeWidth="14" fill="none" opacity=".8" />
            {/* glass and boards */}
            <rect x="-20" y="505" width="1640" height="22" fill="#cfd9e6" opacity=".22" />
            <rect x="-20" y="520" width="1640" height="26" fill="#d9e2ec" />
            <rect x="-20" y="540" width="1640" height="8" fill="#e8c34a" opacity=".85" />
            {/* the ice, foreshortened */}
            <path d="M-20 548 H1620 V900 H-20 Z" fill="url(#cc-ice)" />
            <path d="M-20 548 H1620 V900 H-20 Z" fill="url(#cc-iceglow)" />
            <path d="M-20 612 H1620" stroke="#2f6fd0" strokeWidth="8" opacity=".6" />
            <path d="M-20 736 H1620" stroke="#d0334a" strokeWidth="9" opacity=".55" />
            <ellipse cx="800" cy="736" rx="250" ry="64" stroke="#2e5fb0" strokeWidth="5" fill="none" opacity=".5" />
            <ellipse cx="800" cy="736" rx="10" ry="4" fill="#2e5fb0" opacity=".7" />
        </svg>
    );
});

/** sparse, random flashbulbs in the stands; never two at once in the same spot, never in unison */
function Flashes({ active }: { active: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const box = ref.current;
        if (!box || !active || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        let timer = 0;
        const pop = () => {
            const s = document.createElement('i');
            s.style.left = `${4 + Math.random() * 92}%`;
            s.style.top = `${Math.random() * 100}%`;
            s.addEventListener('animationend', () => s.remove());
            box.appendChild(s);
            timer = window.setTimeout(pop, 260 + Math.random() * 900);
        };
        timer = window.setTimeout(pop, 600);
        return () => window.clearTimeout(timer);
    }, [active]);
    return <div ref={ref} className={styles.flashes} aria-hidden="true" />;
}

// ---------- the hosts ----------

const Host = memo(function Host({ who, host, art }: { who: CharacterId; host: HostFrame; art: string[] }) {
    const prevGesture = useRef(host.gesture);
    const action = gestureAction(host.gesture);
    const pound = who === 'don' && action === 'pound';
    const deskAction = pound || (who === 'don' && action === 'pound-ready');
    // mouth flaps swap fast; a new gesture blends a touch slower
    const fade = deskAction ? 0 : prevGesture.current === host.gesture ? 55 : 150;
    prevGesture.current = host.gesture;
    // A tiny compression at contact, followed by one settle. Show-time sampling
    // keeps this aligned with the sound across pause, scrub and playback speeds.
    const impact = pound ? Math.max(0, 1 - host.gestureMs / 160) : 0;
    const settle = pound && host.gestureMs < 140 ? 0.3 * Math.pow(1 - host.gestureMs / 140, 2) : 0;
    return (
        <div className={styles.host} data-who={who} data-flinch={host.flinch || undefined} data-desk-action={deskAction || undefined}>
            <div className={styles.breath}>
                <div className={styles.body} data-motion={host.motion ?? undefined} style={{ '--fade': `${fade}ms`, '--contact-y': `${settle}%` } as React.CSSProperties}>
                    <HostArtwork who={who} gesture={host.gesture} open={host.open} art={art} />
                </div>
            </div>
            {impact > 0 && <svg className={styles.deskImpact} viewBox="0 0 1254 1254" aria-hidden="true" style={{ opacity: impact * 0.65 }}>
                <g transform={`translate(405 1200) scale(${1 + (1 - impact) * 0.12})`}>
                    <path d="M-145 -14 l-22 -8 M145 -14 l22 -8" />
                </g>
            </svg>}
        </div>
    );
});

// ---------- speech plates ----------

const Plate = memo(function Plate({ who, line, caption }: { who: CharacterId; line: Line; caption: CaptionFrame }) {
    const textRef = useRef<HTMLParagraphElement>(null);
    const [box, setBox] = useState({ height: 0, shift: 0 });

    // roll-up captions: the plate grows with the revealed text, then scrolls a line at a time
    const measure = useCallback(() => {
        const el = textRef.current;
        if (!el) return;
        const words = el.querySelectorAll<HTMLElement>('[data-w][data-on]');
        if (!words.length) return;
        // Roll whole visual rows, including taller yell words, so no line is sliced in half.
        const rows: { top: number; bottom: number }[] = [];
        words.forEach(word => {
            const top = word.offsetTop, bottom = top + word.offsetHeight;
            const row = rows[rows.length - 1];
            // Integer offset metrics can overlap adjacent fractional-height rows by 1px.
            if (row && top < row.bottom - 1) {
                row.top = Math.min(row.top, top);
                row.bottom = Math.max(row.bottom, bottom);
            } else rows.push({ top, bottom });
        });
        const count = Number(getComputedStyle(el).getPropertyValue('--caption-lines') || 3);
        const shift = rows.length > count ? rows[rows.length - count].top : 0;
        const bottom = rows[rows.length - 1].bottom;
        setBox(b => (b.height === bottom - shift && b.shift === shift ? b : { height: bottom - shift, shift }));
    }, []);
    useLayoutEffect(measure, [caption.shown, line, measure]);
    useLayoutEffect(() => {
        const el = textRef.current;
        if (!el) return;
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [measure]);

    let n = 0;
    return (
        <div
            className={styles.plate}
            data-who={who}
            data-active={caption.active || undefined}
            data-knocked={caption.knocked || undefined}
            aria-hidden={!caption.active || undefined}
        >
            <span className={styles.tag}>{CAST[who].name}</span>
            <div className={styles.plateWindow} style={{ height: box.height || undefined }}>
                <p ref={textRef} className={styles.plateText} style={{ transform: `translateY(${-box.shift}px)` }}>
                    {line.words.map((word, i) => (
                        <span key={i}>
                            {word.space}
                            <span className={styles.word} data-w data-on={i < caption.shown || undefined}>
                                {word.pieces.map((piece, k) => (
                                    <span key={k} data-d={piece.delivery} style={{ '--i': n++ } as React.CSSProperties}>{piece.text}</span>
                                ))}
                            </span>
                        </span>
                    ))}
                </p>
            </div>
        </div>
    );
});

// ---------- overlays ----------

const clock = (ms: number) => {
    const over = ms < 0;
    const s = Math.ceil(Math.abs(ms) / 1000);
    return `${over ? '+' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function Lockup({ tl }: { tl: Timeline }) {
    const { meta } = tl;
    return (
        <>
            <i className={styles.bumperRed} />
            <i className={styles.bumperNavy} />
            <Artwork className={styles.bumperDon} pose="don-thumbs-up" smallOnly />
            <Artwork className={styles.bumperRon} pose="ron-default" smallOnly />
            <div className={styles.bumperType}>
                <b>Coach&rsquo;s</b>
                <b>Corner</b>
                <span className={styles.gStripes} />
                {meta.week !== undefined && <small>Week {meta.week}</small>}
                {meta.title && <strong>{meta.title}</strong>}
            </div>
        </>
    );
}

/** the six-second open, timed to the theme's hits */
function Bumper({ tl, offset, paused }: { tl: Timeline; offset: number; paused: boolean }) {
    return (
        <div className={styles.bumper} style={{ '--offset': `${-offset}ms` } as React.CSSProperties} data-paused={paused || undefined} aria-hidden="true">
            <Lockup tl={tl} />
            <i className={styles.bumperFlash} />
        </div>
    );
}

/** the still title card shown before the episode starts, and again as the closing card */
export function TitleCard({ tl, closing }: { tl: Timeline; closing?: boolean }) {
    return (
        <div className={styles.bumper} data-still data-closing={closing || undefined} aria-hidden="true">
            <Lockup tl={tl} />
        </div>
    );
}

// ---------- the studio ----------

export interface StudioProps {
    tl: Timeline;
    frame: Frame;
    teams: StudioTeam[];
    players: StudioPlayer[];
    banners: StudioBanner[];
    started: boolean;
    playing: boolean;
    /** time when the bumper mounted, so a paused or seeked intro picks up mid-animation */
    introOffset: number;
    /** the page header is out of view, so the show titles itself */
    fullscreen?: boolean;
}

function Studio({ tl, frame, teams, players, banners, started, playing, introOffset, fullscreen }: StudioProps) {
    const art = useRef<Record<CharacterId, string[]>>();
    if (!art.current || art.current.don.length === 0) {
        art.current = Object.fromEntries(CHARACTERS.map(who => [who, tl.art.filter(id => id.startsWith(`${who}-`))])) as Record<CharacterId, string[]>;
    }
    const graphic = tl.monitor[frame.monitor].value;
    const spill = spillColour(graphic, teams);
    const live = started && frame.phase !== 'intro';
    const overtime = frame.clock < 0;
    const chyron = fullscreen && live && frame.line >= 0 && tl.lines[frame.line].t0 - INTRO_MS < 6000 && frame.phase === 'show';

    return (
        <div className={styles.studio} data-shot={frame.shot} style={{ '--spill': spill } as React.CSSProperties}>
            {/* alternating animation names restart the punch without remounting the set */}
            <div className={styles.jolt} data-jolt={frame.punch?.who === 'don' ? frame.punch.index % 2 : undefined}>
                <div className={styles.world}>
                    <div className={styles.punch} data-punch={frame.punch?.who} data-n={frame.punch ? frame.punch.index % 2 : undefined}>
                        <Arena banners={banners} />
                        <Flashes active={playing} />
                        <div className={styles.glassWall} aria-hidden="true" />
                        <div className={styles.soffit} aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <i key={i} />)}</div>
                        <div className={styles.deskTop} aria-hidden="true" />
                        <div className={styles.spill} aria-hidden="true" />
                        <Monitor graphic={graphic} index={frame.monitor} previous={tl.monitor[frame.monitor - 1]?.value} teams={teams} players={players} running={playing} />
                        {CHARACTERS.map(who => <Host key={who} who={who} host={frame.hosts[who]} art={art.current![who]} />)}
                        <div className={styles.keyLight} aria-hidden="true" />
                        <div className={styles.desk} aria-hidden="true">
                            <div className={styles.deskFront}>
                                <span className={styles.deskSlab}>Coach&rsquo;s Corner</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles.plates}>
                {CHARACTERS.map(who => {
                    const c = frame.captions[who];
                    return c && live ? <Plate key={`${who}${c.line}`} who={who} line={tl.lines[c.line]} caption={c} /> : null;
                })}
            </div>

            <div className={styles.bug} aria-hidden="true">YOFHL</div>
            {started && (
                <div className={styles.clock} data-over={overtime || undefined} aria-hidden="true">
                    {clock(frame.clock)}
                </div>
            )}
            {chyron && (
                <div className={styles.chyron} aria-hidden="true">
                    <span>{[tl.meta.week !== undefined ? `Week ${tl.meta.week}` : null, tl.meta.title].filter(Boolean).join(' · ')}</span>
                </div>
            )}
            {started && frame.phase === 'intro' && <Bumper key={introOffset} tl={tl} offset={introOffset} paused={!playing} />}
        </div>
    );
}

export default memo(Studio);
