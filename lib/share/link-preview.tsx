import React from 'react';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { formatFpts, positionNames } from '../league';
import type { TeamColours } from '../team-branding';
import { BRAND_SLAB, GOLD, Glow, ICE, loadPreviewFonts, pngDataUrl, PREVIEW_BACKGROUND, PREVIEW_HEIGHT, PREVIEW_WIDTH,
    publicArt, Slab } from './preview';
import { SHARE_SITE, type PlayerShareCard, type SeasonShareCard, type ShareTeam, type TeamShareCard } from './model';

// The link preview of a player, team or season page: the page's share card data in the landscape every preview shares
// (./preview.tsx). Each kind fills one frame: a name, a line under it, a few stats and a picture, lit in the team's
// colours. Chat apps show it as a thumbnail, so nothing on it is smaller than a phone can read at a third of its size.

const W = PREVIEW_WIDTH, H = PREVIEW_HEIGHT, PAD = 60;
const COLUMN = 720, ART = 380, ART_LEFT = 770, ART_TOP = 118;

/** what one kind of page puts in the frame */
export interface PreviewFrame {
    /** the page kind, on the slab beside the wordmark: "Player" */
    label: string;
    /** a gold slab after the label, for a standing worth leading with: "All-time #4" */
    tag: string | null;
    name: string;
    /** the line above the name, behind a bar in the team's second colour: the player's team */
    subtitle: string | null;
    /** white chips under the name, then a line of detail beside them */
    chips: string[];
    detail: string | null;
    /** two to four stats along the bottom */
    stats: { value: string; label: string }[];
    /** the picture on the right as a PNG data URL, or the abbreviation drawn in its place */
    picture: string | null;
    abbreviation: string | null;
}

const BLOB_HOST = /\.public\.blob\.vercel-storage\.com$/;

/**
 * A team's logo as a PNG data URL: a public path read from disk, or an owner's upload fetched from Blob storage.
 * Satori decodes neither the WebP uploads nor every JPEG, so sharp converts it. Null when there's no logo or it can't be read.
 */
export async function logoPicture(logo: string | null): Promise<string | null> {
    if (!logo) return null;
    try {
        let art: ReturnType<typeof sharp>;
        if (logo.startsWith('/')) art = await publicArt(logo);
        else {
            const url = new URL(logo);
            if (url.protocol !== 'https:' || !BLOB_HOST.test(url.hostname)) return null;
            const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
            if (!response.ok) return null;
            art = sharp(Buffer.from(await response.arrayBuffer()));
        }
        // trimmed to the artwork, so a logo drawn with a wide margin fills the frame's picture box like any other
        return await pngDataUrl(sharp(await art.trim().toBuffer()).resize(ART * 2, ART * 2, { fit: 'inside', withoutEnlargement: true }));
    } catch {
        return null;
    }
}

const teamPicture = async (team: ShareTeam | null) => ({ picture: await logoPicture(team?.logo ?? null), abbreviation: team?.abbreviation ?? null });

async function playerFrame(card: PlayerShareCard): Promise<PreviewFrame> {
    return {
        label: 'Player',
        tag: card.rank ? `All-time #${card.rank}` : null,
        name: card.name,
        subtitle: card.team?.name ?? null,
        chips: card.positions,
        detail: [card.positions.map(position => positionNames[position] ?? position).join(' / '),
            card.seasons ? `${card.seasons} season${card.seasons === 1 ? '' : 's'}` : null].filter(Boolean).join('  ·  ') || null,
        stats: [
            { value: formatFpts(card.totalFPts), label: 'Career FPts' },
            { value: card.fpg.toFixed(2), label: 'FP/G' },
            { value: String(card.cups), label: card.cups === 1 ? 'Jagr Cup' : 'Jagr Cups' },
        ],
        ...(card.team ? await teamPicture(card.team) : { picture: null, abbreviation: null }),
    };
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

// The team share card's facts: its owner and span over the name, its record, win rate and points for along the bottom,
// and its Jagr Cups and finals on the gold slab the card draws its honours in.
async function teamFrame(card: TeamShareCard): Promise<PreviewFrame> {
    return {
        label: card.defunct ? 'Defunct franchise' : 'Franchise',
        tag: [card.cups ? plural(card.cups, 'Jagr Cup') : null, card.finals ? plural(card.finals, 'Final') : null].filter(Boolean).join('  ·  ') || null,
        name: card.team.name,
        subtitle: [card.owner, card.span].filter(Boolean).join('  ·  ') || null,
        chips: [],
        detail: card.seasons.length ? plural(card.seasons.length, 'season') : null,
        stats: [
            { value: card.record, label: 'Record' },
            { value: `${card.winRate.toFixed(1)}%`, label: 'Win rate' },
            { value: formatFpts(card.fptsFor), label: 'Points for' },
        ],
        ...await teamPicture(card.team),
    };
}

function frameFor(card: PlayerShareCard | TeamShareCard | SeasonShareCard): Promise<PreviewFrame> {
    switch (card.kind) {
        case 'player': return playerFrame(card);
        case 'team': return teamFrame(card);
        // season pages get their link previews in later work on #206
        default: throw new Error(`No link preview is drawn for a ${card.kind} card yet`);
    }
}

const rgba = (hex: string, alpha: number) => `rgba(${[1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)).join(',')},${alpha})`;
// Satori can't shrink text to fit, so the name steps down with length; lineClamp (block boxes only) catches the rest.
const nameSize = (name: string) => name.length <= 10 ? 100 : name.length <= 17 ? 88 : name.length <= 24 ? 76 : 62;

function Frame({ frame, colours }: { frame: PreviewFrame; colours: TeamColours }) {
    const slabText = { fontWeight: 800, fontSize: 22, letterSpacing: '0.1em', textTransform: 'uppercase' } as const;
    return (
        <div style={{ display: 'flex', position: 'relative', width: W, height: H, fontFamily: 'Archivo', color: '#fff', backgroundImage: PREVIEW_BACKGROUND }}>
            <Glow cx={ART_LEFT + ART / 2} cy={ART_TOP + ART / 2} rx={560} ry={420} colour={rgba(colours.primary, 0.85)} />
            <Glow cx={ART_LEFT + ART / 2} cy={ART_TOP + ART / 2} rx={260} ry={220} colour={rgba(colours.secondary, 0.22)} />
            <Glow cx={300} cy={0} rx={520} ry={300} colour="rgba(214,232,255,.06)" />

            <div style={{ position: 'absolute', left: ART_LEFT, top: ART_TOP, width: ART, height: ART, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {frame.picture
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={frame.picture} alt="" width={ART} height={ART} style={{ objectFit: 'contain' }} />
                    : frame.abbreviation && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: ART - 40, height: ART - 40,
                        borderRadius: 999, background: colours.primary, border: `10px solid ${colours.secondary}`,
                        fontFamily: 'Archivo SemiExpanded', fontStyle: 'italic', fontWeight: 900, letterSpacing: '-0.04em',
                        fontSize: frame.abbreviation.length <= 3 ? 130 : 96, color: colours.tertiary }}>{frame.abbreviation}</div>}
            </div>

            <div style={{ position: 'absolute', left: PAD, top: 44, width: COLUMN, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', overflow: 'hidden', marginLeft: -12, paddingLeft: 12 }}>
                    <Slab background={BRAND_SLAB} height={50}>
                        <span style={{ fontFamily: 'Archivo SemiExpanded', fontStyle: 'italic', fontWeight: 900, fontSize: 28, letterSpacing: '-0.04em' }}>YOFHL</span>
                    </Slab>
                    <Slab background="#050c18" height={50}><span style={{ ...slabText, color: '#fff' }}>{frame.label}</span></Slab>
                    {frame.tag && <Slab background="#050c18" height={50}><span style={{ ...slabText, color: GOLD }}>{frame.tag}</span></Slab>}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', height: 40, marginTop: 40 }}>
                    {frame.subtitle && <>
                        <div style={{ width: 8, height: 36, borderRadius: 2, background: colours.secondary, marginRight: 18 }} />
                        <span style={{ fontWeight: 800, fontSize: 30, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#e8eef6' }}>{frame.subtitle}</span>
                    </>}
                </div>
                <div style={{ display: 'block', marginTop: 10, marginLeft: -4, fontStyle: 'italic', fontWeight: 900, fontSize: nameSize(frame.name),
                    lineHeight: 0.98, letterSpacing: '-0.04em', textTransform: 'uppercase', lineClamp: 2,
                    textShadow: '0 6px 24px rgba(5,12,24,.7)' }}>{frame.name}</div>
                {(frame.chips.length > 0 || frame.detail) && <div style={{ display: 'flex', alignItems: 'center', marginTop: 22 }}>
                    {frame.chips.map(chip => <span key={chip} style={{ display: 'flex', padding: '5px 13px', marginRight: 12, borderRadius: 7, background: '#fff',
                        color: '#101a30', fontWeight: 800, fontSize: 26, letterSpacing: '0.06em' }}>{chip}</span>)}
                    {frame.detail && <span style={{ marginLeft: 6, fontWeight: 800, fontSize: 26, color: '#c3d0e0' }}>{frame.detail}</span>}
                </div>}
            </div>

            <div style={{ position: 'absolute', left: PAD, bottom: 52, display: 'flex' }}>
                {frame.stats.map((stat, index) => <div key={stat.label} style={{ display: 'flex', flexDirection: 'column',
                    paddingLeft: index ? 34 : 0, marginLeft: index ? 34 : 0, borderLeft: index ? '2px solid rgba(255,255,255,.14)' : 'none' }}>
                    <span style={{ fontWeight: 800, fontSize: 66, lineHeight: 1, letterSpacing: '-0.03em' }}>{stat.value}</span>
                    <span style={{ marginTop: 10, fontWeight: 800, fontSize: 22, letterSpacing: '0.14em', textTransform: 'uppercase', color: ICE }}>{stat.label}</span>
                </div>)}
            </div>

            <span style={{ position: 'absolute', right: PAD, bottom: 52, fontWeight: 800, fontSize: 26, letterSpacing: '0.04em', color: '#e8eef6' }}>{SHARE_SITE}</span>
        </div>
    );
}

/** a 1200×630 PNG link preview of a player, team or season share card, lit in the team's colours */
export async function renderLinkPreview(card: PlayerShareCard | TeamShareCard | SeasonShareCard, colours: TeamColours): Promise<ImageResponse> {
    const [frame, fonts] = await Promise.all([frameFor(card), loadPreviewFonts()]);
    return new ImageResponse(<Frame frame={frame} colours={colours} />,
        // The og:image URL doesn't change when the page's data does, so nothing between here and an unfurler may keep
        // this as immutable (next/og's default). The route's tag-cached lookups still serve it until a sync expires them.
        { width: W, height: H, fonts, headers: { 'cache-control': 'public, max-age=0, must-revalidate' } });
}
