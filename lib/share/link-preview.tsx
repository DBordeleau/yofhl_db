import React from 'react';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { formatFpts, positionNames, seasonLabel } from '../league';
import type { TeamColours } from '../team-branding';
import { BRAND_SLAB, GOLD, Glow, ICE, loadPreviewFonts, pngDataUrl, PREVIEW_BACKGROUND, PREVIEW_HEIGHT, PREVIEW_WIDTH,
    publicArt, Slab } from './preview';
import { SHARE_SITE, type PlayerShareCard, type SeasonShareCard, type ShareTeam, type TeamShareCard } from './model';

// The link preview of a player, team or season page: the page's share card data in the landscape every preview shares
// (./preview.tsx). Each kind fills one frame: a name, a line under it, a few stats and a picture, lit in the team's
// colours. Chat apps show it as a thumbnail, so nothing on it is smaller than a phone can read at a third of its size.

const W = PREVIEW_WIDTH, H = PREVIEW_HEIGHT, PAD = 60;
// the picture ends above the stats row's top (about y 480), so a wide row can pass under it
const COLUMN = 720, ART = 350, ART_LEFT = 790, ART_TOP = 110;

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
    /** the picture drawn faint, for a Jagr Cup nobody won */
    faded?: boolean;
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

// The season share card's facts: the season and its Jagr Cup champion, the champion's owner and logo, and the top
// scorers on its roster along the bottom. A season whose playoffs were cancelled has no champion, so it leads with the
// season itself over a faint Jagr Cup.
async function seasonFrame(card: SeasonShareCard): Promise<PreviewFrame> {
    const label = seasonLabel(card.year);
    return {
        label: 'Season',
        tag: label,
        name: card.team?.name ?? label,
        subtitle: card.cancelled ? 'Playoffs cancelled' : 'Jagr Cup champions',
        chips: [],
        detail: card.owner,
        stats: card.scorers.map(scorer => ({ value: formatFpts(scorer.points),
            label: [scorer.name.split(' ').at(-1), scorer.position].filter(Boolean).join(' · ') })),
        ...(card.team ? await teamPicture(card.team) : { picture: await logoPicture(JAGR_CUP), abbreviation: null, faded: true }),
    };
}

const JAGR_CUP = '/trophies/jagr-cup.webp';

function frameFor(card: PlayerShareCard | TeamShareCard | SeasonShareCard): Promise<PreviewFrame> {
    switch (card.kind) {
        case 'player': return playerFrame(card);
        case 'team': return teamFrame(card);
        case 'season': return seasonFrame(card);
    }
}

const rgba = (hex: string, alpha: number) => `rgba(${[1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)).join(',')},${alpha})`;
// Satori can't shrink text to fit, so the name steps down with length; lineClamp (block boxes only) catches the rest.
const nameSize = (name: string) => name.length <= 10 ? 100 : name.length <= 17 ? 88 : name.length <= 24 ? 76 : 62;

// Satori can't shrink text to fit either, so the stat values step down until the row's estimated width clears yofhl.com:
// a figure is about 0.6em wide at that weight, a spaced uppercase label about 17px a letter. The row still clips
// rather than overlap if the estimate falls short.
const STAT_GAP = 34, STAT_ROOM = W - PAD * 2 - 180;
function statSize(stats: PreviewFrame['stats']) {
    const width = (size: number) => stats.reduce((sum, stat, index) =>
        sum + (index ? STAT_GAP * 2 : 0) + Math.max(stat.value.length * size * 0.6, stat.label.length * 17), 0);
    return [66, 58, 50, 44].find(size => width(size) <= STAT_ROOM) ?? 44;
}

function Frame({ frame, colours }: { frame: PreviewFrame; colours: TeamColours }) {
    const size = statSize(frame.stats);
    const slabText = { fontWeight: 800, fontSize: 22, letterSpacing: '0.1em', textTransform: 'uppercase' } as const;
    return (
        <div style={{ display: 'flex', position: 'relative', width: W, height: H, fontFamily: 'Archivo', color: '#fff', backgroundImage: PREVIEW_BACKGROUND }}>
            <Glow cx={ART_LEFT + ART / 2} cy={ART_TOP + ART / 2} rx={560} ry={420} colour={rgba(colours.primary, 0.85)} />
            <Glow cx={ART_LEFT + ART / 2} cy={ART_TOP + ART / 2} rx={260} ry={220} colour={rgba(colours.secondary, 0.22)} />
            <Glow cx={300} cy={0} rx={520} ry={300} colour="rgba(214,232,255,.06)" />

            <div style={{ position: 'absolute', left: ART_LEFT, top: ART_TOP, width: ART, height: ART, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {frame.picture
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={frame.picture} alt="" width={ART} height={ART} style={{ objectFit: 'contain', opacity: frame.faded ? 0.18 : 1 }} />
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

            {/* one row, so the stats can't run into yofhl.com: they step down in size to fit, and yofhl.com never shrinks */}
            <div style={{ position: 'absolute', left: PAD, right: PAD, bottom: 52, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexShrink: 1, minWidth: 0, overflow: 'hidden' }}>
                    {frame.stats.map((stat, index) => <div key={stat.label} style={{ display: 'flex', flexDirection: 'column', flexShrink: 0,
                        paddingLeft: index ? STAT_GAP : 0, marginLeft: index ? STAT_GAP : 0, borderLeft: index ? '2px solid rgba(255,255,255,.14)' : 'none' }}>
                        <span style={{ fontWeight: 800, fontSize: size, lineHeight: 1, letterSpacing: '-0.03em', whiteSpace: 'nowrap' }}>{stat.value}</span>
                        <span style={{ marginTop: 10, fontWeight: 800, fontSize: 22, letterSpacing: '0.14em', textTransform: 'uppercase', color: ICE, whiteSpace: 'nowrap' }}>{stat.label}</span>
                    </div>)}
                </div>
                <span style={{ flexShrink: 0, marginLeft: 40, fontWeight: 800, fontSize: 26, letterSpacing: '0.04em', color: '#e8eef6' }}>{SHARE_SITE}</span>
            </div>
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
