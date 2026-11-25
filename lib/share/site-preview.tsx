import React from 'react';
import { ImageResponse } from 'next/og';
import { catalogueAward } from '../awards';
import { BRAND_SLAB, GOLD, Glow, loadPreviewFonts, pngDataUrl, PREVIEW_BACKGROUND, PREVIEW_HEIGHT, PREVIEW_WIDTH,
    publicArt, RED, Slab, BLUE } from './preview';

// The image behind every YOFHL link that has none of its own: the share cards' navy and glows, the red YOFHL slab, the
// Jagr Cup, and what the site holds. It reads no league data, so Next renders it once at build time.

const W = PREVIEW_WIDTH, H = PREVIEW_HEIGHT, PAD = 56;
const CUP_BOX = { left: 800, top: 80, width: 320, height: 440 };

/** the line the card leads with, and what the image is described as to a screen reader */
export const SITE_PREVIEW_LINE = 'Every season, team, player and record.';

/** The Jagr Cup, scaled to fit its box: Satori won't size an image for us, so the art's own shape decides. */
async function cupImage() {
    const trophy = catalogueAward('jagr-cup').image;
    if (!trophy) throw new Error('the Jagr Cup has no art, so the default link preview has no trophy to draw');
    const art = await publicArt(trophy);
    const { width = 1, height = 1 } = await art.metadata();
    const scale = Math.min(CUP_BOX.width / width, CUP_BOX.height / height);
    const drawn = { width: Math.round(width * scale), height: Math.round(height * scale) };
    return { src: await pngDataUrl(art), ...drawn,
        left: CUP_BOX.left + (CUP_BOX.width - drawn.width) / 2, top: CUP_BOX.top + (CUP_BOX.height - drawn.height) / 2 };
}

/** the site's 1200×630 PNG link preview */
export async function renderSitePreview(): Promise<ImageResponse> {
    const [cup, fonts] = await Promise.all([cupImage(), loadPreviewFonts()]);
    return new ImageResponse(
        <div style={{ display: 'flex', position: 'relative', width: W, height: H, fontFamily: 'Archivo', color: '#fff',
            backgroundImage: PREVIEW_BACKGROUND }}>
            <Glow cx={600} cy={0} rx={560} ry={380} colour="rgba(214,232,255,.07)" />
            <Glow cx={960} cy={280} rx={340} ry={310} colour="rgba(243,217,149,.28)" />
            <Glow cx={170} cy={600} rx={430} ry={320} colour="rgba(200,16,46,.3)" />
            <Glow cx={1090} cy={590} rx={400} ry={300} colour="rgba(61,139,218,.24)" />

            {/* the trophy stands in its own light, as on the award share card */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cup.src} alt="" width={cup.width} height={cup.height} style={{ position: 'absolute', left: cup.left, top: cup.top }} />
            <Glow cx={CUP_BOX.left + CUP_BOX.width / 2} cy={cup.top + cup.height + 6} rx={175} ry={20} colour="rgba(0,0,0,.7)" />

            <div style={{ position: 'absolute', left: PAD, top: 0, width: 700, height: H - 34, display: 'flex',
                flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ display: 'flex', marginLeft: -14, paddingLeft: 14 }}>
                    <Slab background={BRAND_SLAB} height={132} padding={44}>
                        <span style={{ fontFamily: 'Archivo SemiExpanded', fontStyle: 'italic', fontWeight: 900, fontSize: 96,
                            letterSpacing: '-0.05em' }}>YOFHL</span>
                    </Slab>
                </div>
                <div style={{ display: 'block', marginTop: 34, width: 620, fontWeight: 800, fontSize: 46, lineHeight: 1.14,
                    letterSpacing: '-0.02em', color: '#e8eef6' }}>{SITE_PREVIEW_LINE}</div>
                <div style={{ display: 'flex', marginTop: 26, fontWeight: 800, fontSize: 21, letterSpacing: '0.16em', color: GOLD }}>
                    YOFHL.COM
                </div>
            </div>

            {/* the share cards' red, white and blue rule */}
            <div style={{ position: 'absolute', left: 0, top: H - 17, display: 'flex', flexDirection: 'column', width: W }}>
                <div style={{ height: 6, background: RED }} />
                <div style={{ height: 5, background: '#fff' }} />
                <div style={{ height: 6, background: BLUE }} />
            </div>
        </div>,
        { width: W, height: H, fonts },
    );
}
