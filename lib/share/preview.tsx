import React from 'react';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';

// What every link preview shares: the 1200×630 landscape unfurlers show whole, the share card's palette, the static
// Archivo cuts Satori needs, and its slanted slabs and pools of light. The share card (render-card.ts) draws the same
// shapes in the browser; colours and type follow it.

export const PREVIEW_WIDTH = 1200, PREVIEW_HEIGHT = 630;
export const NAVY = '#0b1426', ICE = '#b6dcf5', GOLD = '#f3d995', RED = '#c8102e', BLUE = '#3d8bda';

/** the navy the share cards sit on, lightest at the top */
export const PREVIEW_BACKGROUND = `linear-gradient(180deg, #0a1324 0%, ${NAVY} 60%, #07101e 100%)`;

type PreviewFonts = NonNullable<ConstructorParameters<typeof ImageResponse>[1]>['fonts'];

// Satori needs static instances and can't stretch type, so the semi-expanded cut is its own family.
const FONT_DIR = path.join(process.cwd(), 'assets/fonts/archivo');
let fonts: Promise<PreviewFonts> | undefined;

/** the bundled Archivo cuts, read once per process */
export const loadPreviewFonts = (): Promise<PreviewFonts> => fonts ??= Promise.all([
    ['Archivo-ExtraBold.ttf', 'Archivo', 800, 'normal'],
    ['Archivo-BlackItalic.ttf', 'Archivo', 900, 'italic'],
    ['Archivo_SemiExpanded-BlackItalic.ttf', 'Archivo SemiExpanded', 900, 'italic'],
] as const).then(files => Promise.all(files.map(async ([file, name, weight, style]) =>
    ({ name, weight, style, data: await readFile(path.join(FONT_DIR, file)) }))));

/** published art, ready to edit and convert: Satori decodes neither the WebP nor the AVIF the site serves */
export const publicArt = async (publicPath: string) => sharp(await readFile(path.join(process.cwd(), 'public', publicPath)));

type Art = ReturnType<typeof sharp>;

/** art as a PNG data URL, the only form Satori takes it in */
export const pngDataUrl = async (art: Art) => `data:image/png;base64,${(await art.png().toBuffer()).toString('base64')}`;

/**
 * A soft ellipse of light centred on cx, cy.
 *
 * It fades to transparent black, which is invisible over the navy the cards sit on. Over a light surface that same
 * fade greys everything it covers and leaves a visible rim where the gradient stops, so a glow on a light card passes
 * `fade` as a transparent version of its own colour.
 */
export const Glow = ({ cx, cy, rx, ry, colour, fade = 'rgba(0,0,0,0)', stop = 71 }:
    { cx: number; cy: number; rx: number; ry: number; colour: string; fade?: string; stop?: number }) =>
    <div style={{ position: 'absolute', left: cx - rx, top: cy - ry, width: rx * 2, height: ry * 2,
        backgroundImage: `radial-gradient(${colour} 0%, ${fade} ${stop}%)` }} />;

/** a slanted slab, as on the share card's brand bar */
export const Slab = ({ background, height = 46, padding = 30, children }:
    { background: string; height?: number; padding?: number; children: React.ReactNode }) =>
    <div style={{ display: 'flex', alignItems: 'center', height, padding: `0 ${padding}px`, marginRight: -14, background, transform: 'skewX(-17deg)' }}>
        <div style={{ display: 'flex', transform: 'skewX(17deg)' }}>{children}</div>
    </div>;

/** the red brand slab's wordmark, the one part of the site's name on every preview */
export const BRAND_SLAB = 'linear-gradient(180deg, #df1a3c 0%, #b00d28 100%)';
