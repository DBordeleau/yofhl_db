import React from 'react';
import { ImageResponse } from 'next/og';
import { BLUE, BRAND_SLAB, Glow, loadPreviewFonts, NAVY, PREVIEW_HEIGHT, PREVIEW_WIDTH, RED } from './preview';

// The image behind every YOFHL link that has none of its own: the site's wordmark at centre ice, on the slab the home
// ticker wears. It reads no league data and no art, so Next renders it once at build time.
//
// It is the one preview that is light. The episode card and the share cards are navy, which is right when they sit on
// the page that drew them; a link preview sits in a chat full of other link previews, and the pale sheet is what makes
// this one get looked at.

const W = PREVIEW_WIDTH, H = PREVIEW_HEIGHT;
const RULE = 17;
/** centre ice, above the rule along the bottom */
const CX = W / 2, CY = (H - RULE) / 2;

const LINE_BLUE = '#2f7fcb', LINE_RED = '#d93850', PAINT = 'rgba(216,50,76,.42)';
/** the ice itself, and how cool it goes out at the boards */
const SHEET = 'linear-gradient(166deg, #ffffff 0%, #ffffff 58%, #f8fbfe 100%)';
const BOARDS = 'radial-gradient(rgba(255,255,255,0) 74%, rgba(158,190,216,.13) 100%)';

/** a neutral-zone faceoff spot */
const Spot = ({ x, y }: { x: number; y: number }) =>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'absolute',
        left: x - 52, top: y - 52, width: 104, height: 104, borderRadius: 104, border: `5px solid ${PAINT}` }}>
        <div style={{ width: 30, height: 30, borderRadius: 30, backgroundColor: PAINT }} />
    </div>;

/** the site's 1200×630 PNG link preview */
export async function renderSitePreview(): Promise<ImageResponse> {
    return new ImageResponse(
        <div style={{ display: 'flex', position: 'relative', width: W, height: H, fontFamily: 'Archivo',
            backgroundImage: SHEET }}>
            {/* the lines a rink is painted with: two blue lines, the red centre line, and four faceoff spots */}
            <div style={{ position: 'absolute', left: 300, top: 0, width: 17, height: H, background: LINE_BLUE }} />
            <div style={{ position: 'absolute', left: W - 317, top: 0, width: 17, height: H, background: LINE_BLUE }} />
            <div style={{ position: 'absolute', left: CX - 8, top: 0, width: 17, height: H, background: LINE_RED }} />
            <Spot x={158} y={CY - 176} />
            <Spot x={158} y={CY + 176} />
            <Spot x={W - 158} y={CY - 176} />
            <Spot x={W - 158} y={CY + 176} />

            {/* the house lights on the sheet. A glow that faded to transparent black would grey the ice it sits on. */}
            <Glow cx={CX} cy={40} rx={900} ry={540} colour="rgba(255,255,255,.72)" fade="rgba(255,255,255,0)" stop={100} />
            <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, backgroundImage: BOARDS }} />

            <div style={{ position: 'absolute', left: CX - 278, top: CY - 278, width: 556, height: 556,
                borderRadius: 556, border: `8px solid ${LINE_BLUE}` }} />

            {/* the wordmark on the slab the home ticker wears, standing at centre ice */}
            <div style={{ position: 'absolute', left: 0, top: CY - 108, width: W, height: 216, display: 'flex',
                alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', height: 196, padding: '0 72px',
                    backgroundImage: BRAND_SLAB, transform: 'skewX(-14deg)',
                    boxShadow: '0 26px 54px rgba(16,29,50,.38)' }}>
                    <div style={{ display: 'flex', transform: 'skewX(14deg)' }}>
                        <span style={{ fontFamily: 'Archivo SemiExpanded', fontStyle: 'italic', fontWeight: 900,
                            fontSize: 126, letterSpacing: '-0.045em', color: '#fff' }}>YOFHL</span>
                    </div>
                </div>
            </div>

            {/* the share cards' rule, with navy in the middle stripe so it reads against the ice */}
            <div style={{ position: 'absolute', left: 0, top: H - RULE, display: 'flex', flexDirection: 'column', width: W }}>
                <div style={{ height: 6, background: RED }} />
                <div style={{ height: 5, background: NAVY }} />
                <div style={{ height: 6, background: BLUE }} />
            </div>
        </div>,
        { width: W, height: H, fonts: await loadPreviewFonts() },
    );
}
