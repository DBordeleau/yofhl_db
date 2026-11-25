import React from 'react';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { ART_FRAME, artFor, lapelFor, type CharacterId, type Pose } from '../coachs-corner/cast';
import { POPPY, POPPY_TILT, type PoppyShape } from '../coachs-corner/poppy';
import { artUrl } from '../coachs-corner/media';
import type { EpisodeShareCard } from './model';

// An episode's link preview: the episode share card's data in a 1200×630 landscape that unfurlers show whole.
// The share card (render-card.ts) draws the same card in the browser; colours and type follow it.

export const PREVIEW_WIDTH = 1200, PREVIEW_HEIGHT = 630;
const W = PREVIEW_WIDTH, H = PREVIEW_HEIGHT, PAD = 56;
const NAVY = '#0b1426', ICE = '#b6dcf5', GOLD = '#f3d995', RED = '#c8102e', BLUE = '#3d8bda';
const DESK = 568, HOST = 480, COLUMN = 600;

// Satori needs static instances and can't stretch type, so the semi-expanded cut is its own family.
const FONT_DIR = path.join(process.cwd(), 'assets/fonts/archivo');
let fonts: Promise<NonNullable<ConstructorParameters<typeof ImageResponse>[1]>['fonts']> | undefined;
const loadFonts = () => fonts ??= Promise.all([
    ['Archivo-ExtraBold.ttf', 'Archivo', 800, 'normal'],
    ['Archivo-BlackItalic.ttf', 'Archivo', 900, 'italic'],
    ['Archivo_SemiExpanded-BlackItalic.ttf', 'Archivo SemiExpanded', 900, 'italic'],
] as const).then(files => Promise.all(files.map(async ([file, name, weight, style]) =>
    ({ name, weight, style, data: await readFile(path.join(FONT_DIR, file)) }))));

const svgShape = (shape: PoppyShape) => {
    switch (shape.kind) {
        case 'ellipse': return `<ellipse cx="${shape.cx}" cy="${shape.cy}" rx="${shape.rx}" ry="${shape.ry}" fill="${shape.fill}" fill-opacity="${shape.fillOpacity}"/>`;
        case 'circle': return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}" fill="${shape.fill}"${shape.stroke ? ` stroke="${shape.stroke}" stroke-width="${shape.strokeWidth ?? 1}"` : ''}/>`;
        case 'path': return `<path d="${shape.d}" fill="none" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}" stroke-opacity="${shape.strokeOpacity ?? 1}" stroke-linecap="round"/>`;
    }
};

/** A pose from the published art as a PNG data URL (Satori can't decode AVIF), with the lapel poppy pinned on when the card wears one. */
async function hostImage(who: CharacterId, pose: Pose, lapel: EpisodeShareCard['lapel']) {
    const art = sharp(await readFile(path.join(process.cwd(), 'public', artUrl(pose, true))));
    const { width = 640 } = await art.metadata();
    const spot = lapel === 'poppy' ? lapelFor(who, pose) : null;
    if (spot) {
        const [x, y, scale] = spot;
        const poppy = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}" viewBox="0 0 ${ART_FRAME} ${ART_FRAME}">`
            + `<g transform="translate(${x} ${y}) scale(${scale}) rotate(${POPPY_TILT})">${POPPY.map(svgShape).join('')}</g></svg>`;
        art.composite([{ input: Buffer.from(poppy), top: 0, left: 0 }]);
    }
    return `data:image/png;base64,${(await art.png().toBuffer()).toString('base64')}`;
}

/** a soft ellipse of light centred on cx, cy */
const Glow = ({ cx, cy, rx, ry, colour }: { cx: number; cy: number; rx: number; ry: number; colour: string }) =>
    <div style={{ position: 'absolute', left: cx - rx, top: cy - ry, width: rx * 2, height: ry * 2,
        backgroundImage: `radial-gradient(${colour} 0%, rgba(0,0,0,0) 71%)` }} />;

/** a slanted slab, as on the share card's brand bar */
const Slab = ({ background, children }: { background: string; children: React.ReactNode }) =>
    <div style={{ display: 'flex', alignItems: 'center', height: 46, padding: '0 30px', marginRight: -14, background, transform: 'skewX(-17deg)' }}>
        <div style={{ display: 'flex', transform: 'skewX(17deg)' }}>{children}</div>
    </div>;

// Satori can't shrink text to fit, so sizes step down with length; lineClamp (block boxes only) catches the rest.
const quoteSize = (text: string) => text.length <= 32 ? 42 : text.length <= 56 ? 36 : text.length <= 80 ? 31 : 27;
/** with no quote the title takes the bubble's space */
const titleStyle = (title: string, quoted: boolean) => quoted
    ? { fontSize: title.length <= 30 ? 38 : 32, lineClamp: 2 }
    : { fontSize: title.length <= 24 ? 60 : title.length <= 48 ? 50 : 42, lineClamp: 3 };

/** a 1200×630 PNG link preview of an episode share card */
export async function renderEpisodePreview(card: EpisodeShareCard): Promise<ImageResponse> {
    const { quote, wardrobe, lapel } = card;
    // As on the share card, the speaker yells and the other host takes it in; with no quote, Don stares and Ron is skeptical.
    // Don is in the episode's opening wardrobe; Ron has only the normal one.
    const donPose = quote?.who === 'don' ? artFor('don', 'angry', { wardrobe, mouth: 'open' }) : artFor('don', 'stare', { wardrobe, mouth: 'closed' });
    const ronPose = quote?.who === 'ron' ? artFor('ron', 'rest', { mouth: 'open' }) : artFor('ron', 'skeptical', { mouth: 'open' });
    const [don, ron, fontList] = await Promise.all([hostImage('don', donPose, lapel), hostImage('ron', ronPose, lapel), loadFonts()]);
    const hostTop = DESK - Math.round(HOST * 0.63);
    const mark = { fontFamily: 'Archivo SemiExpanded', fontStyle: 'italic', fontWeight: 900, fontSize: 92, lineHeight: 0.92, letterSpacing: '-0.05em' } as const;

    return new ImageResponse(
        <div style={{ display: 'flex', position: 'relative', width: W, height: H, fontFamily: 'Archivo', color: '#fff',
            backgroundImage: `linear-gradient(180deg, #0a1324 0%, ${NAVY} 60%, #07101e 100%)` }}>
            <Glow cx={600} cy={0} rx={560} ry={380} colour="rgba(214,232,255,.07)" />
            <Glow cx={790} cy={540} rx={420} ry={330} colour="rgba(200,16,46,.3)" />
            <Glow cx={1090} cy={540} rx={420} ry={330} colour="rgba(61,139,218,.24)" />

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ron} alt="" width={HOST} height={HOST} style={{ position: 'absolute', left: 780, top: hostTop + 8 }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={don} alt="" width={HOST} height={HOST} style={{ position: 'absolute', left: 540, top: hostTop }} />
            <div style={{ position: 'absolute', left: 0, top: DESK, width: W, height: H - DESK, display: 'flex', flexDirection: 'column',
                backgroundImage: 'linear-gradient(180deg, #16233b 0%, #08101f 100%)' }}>
                <div style={{ height: 5, background: RED }} />
                <div style={{ height: 4, background: '#fff' }} />
                <div style={{ height: 5, background: BLUE }} />
            </div>

            <div style={{ position: 'absolute', left: PAD, top: 40, width: COLUMN - PAD, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', overflow: 'hidden', marginLeft: -12, paddingLeft: 12 }}>
                    <Slab background="linear-gradient(180deg, #df1a3c 0%, #b00d28 100%)">
                        <span style={{ fontFamily: 'Archivo SemiExpanded', fontStyle: 'italic', fontWeight: 900, fontSize: 25, letterSpacing: '-0.04em' }}>YOFHL</span>
                    </Slab>
                    {card.label && <Slab background="#050c18">
                        <span style={{ fontWeight: 800, fontSize: 19, letterSpacing: '0.1em', textTransform: 'uppercase', color: GOLD }}>{card.label}</span>
                    </Slab>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', marginTop: 20, marginLeft: -4 }}>
                    <span style={{ ...mark, textShadow: '0 6px 24px rgba(5,12,24,.7)' }}>COACH’S</span>
                    {/* Satori drops transparent text and paints the stroke under the fill, so the outline is a navy fill over a doubled stroke */}
                    <span style={{ ...mark, color: NAVY, WebkitTextStrokeWidth: 5, WebkitTextStrokeColor: ICE }}>CORNER</span>
                </div>
                <div style={{ display: 'block', marginTop: quote ? 14 : 22, fontWeight: 800, lineHeight: 1.12, color: '#e8eef6',
                    ...titleStyle(card.episode, !!quote) }}>{card.episode}</div>
                {quote && <div style={{ display: 'flex', alignItems: 'center', marginTop: 22 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, padding: '24px 30px 22px', borderRadius: 18, background: '#f4f8fb',
                        boxShadow: '0 12px 30px rgba(0,0,0,.45)' }}>
                        <span style={{ display: 'block', fontStyle: 'italic', fontWeight: 900, fontSize: quoteSize(quote.text), lineHeight: 1.1, letterSpacing: '-0.02em',
                            color: '#101a30', lineClamp: 3 }}>{`“${quote.text}”`}</span>
                        <span style={{ marginTop: 12, fontWeight: 800, fontSize: 17, letterSpacing: '0.16em', color: '#b00d28' }}>
                            {`— ${quote.who === 'don' ? 'DON' : 'RON'}`}
                        </span>
                    </div>
                    {/* the tail points across the desk at whoever said it: level at Don, up over his head at Ron */}
                    <svg width={34} height={60} viewBox="0 0 34 60" style={{ marginLeft: -1 }}>
                        <path d={quote.who === 'don' ? 'M0 14 L34 34 L0 46 Z' : 'M0 18 L34 0 L0 44 Z'} fill="#f4f8fb" />
                    </svg>
                </div>}
            </div>
        </div>,
        { width: W, height: H, fonts: fontList },
    );
}
