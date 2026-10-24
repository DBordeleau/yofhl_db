import { formatFpts, positionNames, seasonLabel } from '../league';
import { fallbackColours, suggestedPalettes, type TeamColours } from '../team-branding';
import { artworkBounds } from '../team-logo';
import { artUrl } from '../coachs-corner/media';
import { CARD_HEIGHT, CARD_WIDTH } from './dimensions';
import { SHARE_SITE, type ComparisonShareCard, type PlayerShareCard, type SeasonShareCard, type ShareCard, type ShareTeam,
    type StealShareCard, type TeamShareCard, type VersusShareCard, type AwardShareCard, type EpisodeShareCard } from './model';

const W = CARD_WIDTH, H = CARD_HEIGHT, PAD = 56, RIGHT = W - PAD, INNER = W - PAD * 2;
const NAVY = '#0b1426', ICE = '#b6dcf5', MUTED = '#9fb3cb', GOLD = '#f3d995', RED = '#c8102e';

type Palettes = Record<number, TeamColours>;
interface Kit { ctx: CanvasRenderingContext2D; family: string; palettes: Palettes; brand: HTMLImageElement | null; cup: HTMLImageElement | null }
interface TextStyle { size: number; weight?: number; italic?: boolean; stretch?: number; spacing?: number; colour?: string | CanvasGradient; align?: CanvasTextAlign; max?: number; min?: number; upper?: boolean }

async function loadImage(src: string | null): Promise<HTMLImageElement | null> {
    if (!src) return null;
    let url: URL;
    try { url = new URL(src, window.location.origin); } catch { return null; }
    if (url.protocol !== 'data:' && url.origin !== window.location.origin && !(url.protocol === 'https:' && url.hostname.endsWith('.public.blob.vercel-storage.com'))) return null;
    return new Promise(resolve => {
        const image = new Image();
        const timeout = setTimeout(() => { image.src = ''; resolve(null); }, 2500);
        if (url.protocol !== 'data:') image.crossOrigin = 'anonymous';
        image.onload = () => { clearTimeout(timeout); resolve(image); };
        image.onerror = () => { clearTimeout(timeout); resolve(null); };
        image.src = url.href;
    });
}

// ---------- colour ----------
const rgbOf = (hex: string) => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
const rgba = (hex: string, alpha: number) => `rgba(${rgbOf(hex).join(',')},${alpha})`;
const mix = (hex: string, target: string, amount: number) => {
    const [a, b] = [rgbOf(hex), rgbOf(target)];
    return `#${a.map((value, i) => Math.round(value + (b[i] - value) * amount).toString(16).padStart(2, '0')).join('')}`;
};
const distance = (x: string, y: string) => Math.hypot(...rgbOf(x).map((value, i) => value - rgbOf(y)[i]));
const teamColours = (kit: Kit, team: ShareTeam | null) => (team?.id ? kit.palettes[team.id] ?? suggestedPalettes[team.id] : null) ?? fallbackColours;

// ---------- type ----------
function setFont(kit: Kit, { size, weight = 800, italic = false, stretch = 100, spacing = 0 }: TextStyle) {
    const { ctx } = kit;
    const keyword = stretch >= 120 ? 'expanded' : stretch >= 106 ? 'semi-expanded' : stretch <= 80 ? 'condensed' : stretch <= 92 ? 'semi-condensed' : 'normal';
    const base = `${italic ? 'italic ' : ''}${weight} ${size}px ${kit.family}`;
    ctx.font = base;
    // Browsers that cannot parse a width keyword keep the base font instead of dropping it.
    ctx.font = `${italic ? 'italic ' : ''}${weight} ${keyword} ${size}px ${kit.family}`;
    if ('fontStretch' in ctx) (ctx as CanvasRenderingContext2D & { fontStretch: string }).fontStretch = keyword;
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spacing * size}px`;
}
function measure(kit: Kit, value: string, style: TextStyle) {
    setFont(kit, style);
    return kit.ctx.measureText(style.upper ? value.toUpperCase() : value).width;
}
/** Shrinks to fit `max`, draws, and returns the size and width used. */
function text(kit: Kit, value: string, x: number, y: number, style: TextStyle) {
    const { ctx } = kit;
    const content = style.upper ? value.toUpperCase() : value;
    let size = style.size;
    let width = measure(kit, content, style);
    if (style.max && width > style.max) {
        size = Math.max(style.min ?? 12, Math.floor(size * style.max / width));
        width = measure(kit, content, { ...style, size });
    }
    ctx.fillStyle = style.colour ?? '#fff';
    ctx.textAlign = style.align ?? 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(content, x, y);
    return { size, width };
}
/** Greedy word wrap at one size, shrinking until the lines fit. */
function wrap(kit: Kit, value: string, style: TextStyle, width: number, maxLines: number) {
    let size = style.size;
    for (;;) {
        const words = value.toUpperCase().split(/\s+/);
        const lines: string[] = [];
        for (const word of words) {
            const next = lines.length ? `${lines.at(-1)} ${word}` : word;
            if (lines.length && measure(kit, next, { ...style, size }) <= width) lines[lines.length - 1] = next;
            else lines.push(word);
        }
        // Two lines read best when they are close in length: "Jagrtown / Ice Fellas" over "Jagrtown Ice / Fellas".
        if (lines.length === 2) {
            const split = words.map((_, index) => index).slice(1).map(index => [words.slice(0, index).join(' '), words.slice(index).join(' ')])
                .sort((a, b) => Math.max(...a.map(line => measure(kit, line, { ...style, size }))) - Math.max(...b.map(line => measure(kit, line, { ...style, size }))))[0];
            if (split) lines.splice(0, 2, ...split);
        }
        if ((lines.length <= maxLines && lines.every(line => measure(kit, line, { ...style, size }) <= width)) || size <= (style.min ?? 24)) return { lines, size };
        size -= 4;
    }
}
const splitName = (name: string) => name.includes(' ') ? [name.slice(0, name.indexOf(' ')), name.slice(name.indexOf(' ') + 1)] : ['', name];

// ---------- shapes ----------
function slab(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cut: number, left = false) {
    ctx.beginPath();
    ctx.moveTo(x + (left ? cut : 0), y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x, y + h);
    ctx.closePath();
}
function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function vertical(ctx: CanvasRenderingContext2D, y0: number, y1: number, stops: [number, string][]) {
    const gradient = ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach(([offset, colour]) => gradient.addColorStop(offset, colour));
    return gradient;
}
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, colour: string) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(1, ry / rx);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    gradient.addColorStop(0, colour); gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient; ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
}
function contain(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number) {
    const scale = Math.min(w / image.width, h / image.height);
    ctx.drawImage(image, x + (w - image.width * scale) / 2, y + (h - image.height * scale) / 2, image.width * scale, image.height * scale);
}
function shadowed(ctx: CanvasRenderingContext2D, blur: number, offset: number, colour: string, draw: () => void) {
    ctx.save(); ctx.shadowBlur = blur; ctx.shadowOffsetY = offset; ctx.shadowColor = colour; draw(); ctx.restore();
}
/** The team mark as the app shows it: bare artwork cropped to its visible bounds, with depth from a shadow.
 *  Square photo logos (JPEGs without transparency) get rounded corners so they read as a tile. */
async function teamMark(kit: Kit, team: ShareTeam, cx: number, cy: number, maxWidth: number, maxHeight: number, blur = 22) {
    const { ctx } = kit;
    const logo = await loadImage(team.logo);
    if (!logo) {
        text(kit, team.abbreviation, cx, cy + maxHeight * .1, { size: maxHeight * .28, weight: 900, italic: true, stretch: 110, align: 'center', max: maxWidth });
        return;
    }
    const bounds = team.logo ? artworkBounds[team.logo] : undefined;
    const [sx, sy, sw, sh] = bounds ? [bounds[2] / bounds[0] * logo.width, bounds[3] / bounds[1] * logo.height, bounds[4] / bounds[0] * logo.width, bounds[5] / bounds[1] * logo.height]
        : [0, 0, logo.width, logo.height];
    const scale = Math.min(maxWidth / sw, maxHeight / sh);
    const [w, h] = [sw * scale, sh * scale], [x, y] = [cx - w / 2, cy - h / 2];
    const tile = /\.jpe?g$/i.test(team.logo ?? '');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    shadowed(ctx, blur, blur * .45, 'rgba(5,12,24,.55)', () => {
        if (!tile) { ctx.drawImage(logo, sx, sy, sw, sh, x, y, w, h); return; }
        ctx.fillStyle = '#fff'; rounded(ctx, x, y, w, h, Math.min(w, h) * .1); ctx.fill();
    });
    if (tile) { ctx.save(); rounded(ctx, x, y, w, h, Math.min(w, h) * .1); ctx.clip(); ctx.drawImage(logo, sx, sy, sw, sh, x, y, w, h); ctx.restore(); }
}
const crest = (kit: Kit, team: ShareTeam, cx: number, cy: number, r: number) => teamMark(kit, team, cx, cy, r * 2, r * 2);

function brandBar(kit: Kit, parts: (string | { text: string; colour: string } | null)[]) {
    const { ctx } = kit;
    const red = { size: 30, weight: 900, italic: true, stretch: 125, spacing: -.04 };
    const redWidth = measure(kit, 'YOFHL', red) + 62;
    slab(ctx, PAD, PAD, redWidth, 58, 18);
    ctx.fillStyle = vertical(ctx, PAD, PAD + 58, [[0, '#df1a3c'], [1, '#b00d28']]); ctx.fill();
    text(kit, 'YOFHL', PAD + 24, PAD + 40, red);
    const items = parts.flatMap(part => part ? [typeof part === 'string' ? { text: part, colour: '#fff' } : part] : []);
    const label = { size: 21, weight: 850, stretch: 90, spacing: .1, upper: true };
    const widths = items.map(item => measure(kit, item.text, label));
    const darkWidth = widths.reduce((sum, value) => sum + value, 0) + (items.length - 1) * 34 + 80;
    const left = PAD + redWidth - 18;
    slab(ctx, left, PAD, darkWidth, 58, 18, true);
    ctx.fillStyle = '#050c18'; ctx.fill();
    let x = left + 38;
    items.forEach((item, index) => {
        if (index) { ctx.beginPath(); ctx.arc(x + 11, PAD + 29, 3, 0, Math.PI * 2); ctx.fillStyle = '#e8213f'; ctx.fill(); x += 34; }
        text(kit, item.text, x, PAD + 37, { ...label, colour: item.colour });
        x += widths[index];
    });
}

/** `site` defaults to the bare domain; episode cards print the episode's own address so it can be typed from the image. */
function footer(kit: Kit, site = SHARE_SITE) {
    const { ctx } = kit;
    ctx.fillStyle = RED; ctx.fillRect(0, H - 17, W, 6);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, H - 11, W, 5);
    ctx.fillStyle = '#3d8bda'; ctx.fillRect(0, H - 6, W, 6);
    if (kit.brand) contain(ctx, kit.brand, PAD, H - 97, 54, 54);
    text(kit, 'YOFHL', PAD + 68, H - 60, { size: 26, weight: 900, italic: true, stretch: 125, spacing: -.04 });
    text(kit, site, RIGHT, H - 62, { size: 20, weight: 700, colour: MUTED, align: 'right', max: INNER - 270, min: 14 });
}

const label = (kit: Kit, value: string, x: number, y: number, colour = MUTED, align: CanvasTextAlign = 'left') =>
    text(kit, value, x, y, { size: 17, weight: 800, spacing: .16, upper: true, colour, align });
const goldFill = (ctx: CanvasRenderingContext2D, y0: number, y1: number) => vertical(ctx, y0, y1, [[0, '#fff3cf'], [.55, '#e2bd6a'], [1, '#a8782c']]);
const navyBackground = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = vertical(ctx, 0, H, [[0, '#111e36'], [.62, NAVY], [1, '#08101f']]);
    ctx.fillRect(0, 0, W, H);
};

// ---------- player ----------
async function drawPlayer(kit: Kit, card: PlayerShareCard) {
    const { ctx } = kit;
    const colours = teamColours(kit, card.team);
    navyBackground(ctx);
    glow(ctx, 950, 300, 760, 470, rgba(colours.primary, .8));
    // The player's team logo sits above the surname, lit by the club's second colour.
    if (card.team) {
        glow(ctx, 820, 300, 300, 230, rgba(mix(colours.secondary, '#ffffff', .3), .28));
        await teamMark(kit, card.team, 820, 300, 420, 330, 40);
    }
    ctx.fillStyle = vertical(ctx, 430, 650, [[0, 'rgba(13,24,48,0)'], [.85, '#0d1830'], [1, 'rgba(13,24,48,0)']]);
    ctx.fillRect(0, 430, W, 220);
    brandBar(kit, ['Player', card.rank ? { text: `All-time #${card.rank}`, colour: GOLD } : null]);

    if (card.team) {
        const { lines, size } = wrap(kit, card.team.name, { size: 24, weight: 850, stretch: 125, spacing: .06, min: 16 }, 500, 2);
        const top = lines.length === 1 ? 252 : 236;
        ctx.fillStyle = colours.secondary; rounded(ctx, PAD, top - 23, 6, (lines.length - 1) * size * 1.2 + 28, 2); ctx.fill();
        lines.forEach((line, index) => text(kit, line, PAD + 20, top + index * size * 1.2, { size, weight: 850, stretch: 125, spacing: .06 }));
    }
    const [first, last] = splitName(card.name);
    if (first) {
        setFont(kit, { size: 96, weight: 900, italic: true, spacing: -.035 });
        ctx.strokeStyle = ICE; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.textAlign = 'left';
        ctx.strokeText(first.toUpperCase(), PAD, 462, INNER);
    }
    shadowed(ctx, 36, 8, 'rgba(5,12,24,.65)', () => text(kit, last, PAD - 6, 610, { size: 178, weight: 900, italic: true, stretch: 112, spacing: -.05, upper: true, max: INNER, min: 80 }));

    let x = PAD;
    for (const position of card.positions) {
        const width = measure(kit, position, { size: 19, weight: 850, spacing: .06 }) + 22;
        ctx.fillStyle = '#fff'; rounded(ctx, x, 655, width, 34, 6); ctx.fill();
        text(kit, position, x + 11, 680, { size: 19, weight: 850, spacing: .06, colour: '#101a30' });
        x += width + 10;
    }
    const detail = [card.positions.map(position => positionNames[position] ?? position).join(' / '), `${card.seasons} season${card.seasons === 1 ? '' : 's'}`].filter(Boolean).join('  ·  ');
    text(kit, detail, x + 6, 681, { size: 22, weight: 650, colour: '#c3d0e0' });

    ctx.fillStyle = 'rgba(255,255,255,.11)'; ctx.fillRect(PAD, 742, INNER, 2);
    const columns = [PAD, PAD + 415, PAD + 692];
    const big = { size: 98, weight: 800, stretch: 96, spacing: -.035 };
    text(kit, formatFpts(card.totalFPts), columns[0], 852, { ...big, max: 390 });
    label(kit, 'Career FPts', columns[0], 896);
    ctx.fillStyle = 'rgba(255,255,255,.11)'; ctx.fillRect(columns[1] - 1, 772, 2, 130); ctx.fillRect(columns[2] - 1, 772, 2, 130);
    text(kit, card.fpg.toFixed(2), columns[1] + 34, 852, { ...big, max: 240 });
    label(kit, 'FP/G', columns[1] + 34, 896);
    if (kit.cup) shadowed(ctx, 14, 6, 'rgba(0,0,0,.6)', () => contain(ctx, kit.cup!, columns[2] + 18, 752, 92, 108));
    text(kit, String(card.cups), columns[2] + 116, 852, { ...big, colour: card.cups ? goldFill(ctx, 775, 852) : '#4c5f7a' });
    label(kit, card.cups === 1 ? 'Jagr Cup' : 'Jagr Cups', columns[2] + 34, 896, card.cups ? GOLD : MUTED);

    const trophies = card.trophies.slice(0, 4);
    const chartWidth = trophies.length ? INNER - 360 : INNER;
    const seasons = card.seasonPoints.slice(-16);
    if (seasons.length) {
        label(kit, 'FPts by season', PAD, 976);
        const gap = seasons.length > 12 ? 6 : 10;
        const barWidth = (chartWidth - gap * (seasons.length - 1)) / seasons.length;
        const peak = Math.max(1, ...seasons.map(row => row.value));
        const peakIndex = seasons.findIndex(row => row.value === peak);
        seasons.forEach((row, index) => {
            const h = Math.max(4, row.value / peak * 176);
            const left = PAD + index * (barWidth + gap);
            ctx.fillStyle = row.champion ? vertical(ctx, 1180 - h, 1180, [[0, '#fbe7b0'], [1, '#c99a3e']])
                : index === peakIndex ? vertical(ctx, 1180 - h, 1180, [[0, '#ffffff'], [1, '#8cc4f7']]) : vertical(ctx, 1180 - h, 1180, [[0, '#6fb1f2'], [1, '#2f6fae']]);
            rounded(ctx, left, 1180 - h, barWidth, h, Math.min(3, barWidth / 2)); ctx.fill();
            let top = 1180 - h;
            if (index === peakIndex) { text(kit, formatFpts(row.value), left + barWidth / 2, top - 10, { size: 19, weight: 800, align: 'center' }); top -= 32; }
            if (row.champion && kit.cup) contain(ctx, kit.cup, left + barWidth / 2 - 20, top - 46, 40, 40);
            if (seasons.length <= 12 || index % 2 === seasons.length % 2 - 1 || index === seasons.length - 1)
                text(kit, `'${String(row.year).slice(2)}`, left + barWidth / 2, 1206, { size: 16, weight: 700, colour: row.champion ? GOLD : '#8295ad', align: 'center' });
        });
        ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(PAD, 1180, chartWidth, 2);
    }
    if (trophies.length) {
        const left = RIGHT - 330;
        label(kit, 'Trophy case', left, 1032);
        const slot = 330 / trophies.length;
        const images = await Promise.all(trophies.map(trophy => loadImage(trophy.image)));
        trophies.forEach((trophy, index) => {
            const cx = left + slot * index + slot / 2;
            const image = images[index];
            if (image) shadowed(ctx, 14, 8, 'rgba(0,0,0,.7)', () => contain(ctx, image, cx - Math.min(104, slot - 6) / 2, 1048, Math.min(104, slot - 6), 128));
            text(kit, `×${trophy.count}`, cx, 1206, { size: 26, weight: 850, align: 'center' });
        });
    }
}

// ---------- franchise ----------
async function drawTeam(kit: Kit, card: TeamShareCard) {
    const { ctx } = kit;
    const colours = teamColours(kit, card.team);
    const dark = mix(colours.primary, '#000000', .45);
    ctx.fillStyle = NAVY; ctx.fillRect(0, 0, W, H);
    const surface = ctx.createLinearGradient(0, 0, W, 390);
    surface.addColorStop(.1, dark); surface.addColorStop(1, colours.primary);
    ctx.fillStyle = surface; ctx.fillRect(0, 0, W, 780);
    const scrim = ctx.createLinearGradient(0, 0, W, 0);
    scrim.addColorStop(0, rgba(dark, .85)); scrim.addColorStop(.55, rgba(dark, .3)); scrim.addColorStop(.8, rgba(dark, 0));
    ctx.fillStyle = scrim; ctx.fillRect(0, 0, W, 780);
    ctx.fillStyle = colours.secondary; ctx.fillRect(0, 774, W, 6);
    brandBar(kit, [card.defunct ? 'Defunct franchise' : 'Franchise', `${card.seasons.length} season${card.seasons.length === 1 ? '' : 's'}`]);

    // The real logo is the hero; a soft light in the club's second colour lifts it off the surface.
    glow(ctx, 850, 450, 380, 340, rgba(mix(colours.secondary, '#ffffff', .3), .32));
    await teamMark(kit, card.team, 850, 450, 420, 560, 44);

    const nameStyle = { size: 122, weight: 900, italic: true, stretch: 112, spacing: -.05, min: 60 };
    const { lines, size } = wrap(kit, card.team.name, nameStyle, 560, 3);
    const lineHeight = size * .84, block = (lines.length - 1) * lineHeight + size * .72 + 64;
    let baseline = 455 - block / 2 + size * .72;
    shadowed(ctx, 36, 8, 'rgba(10,4,24,.6)', () => lines.forEach((line, index) => text(kit, line, PAD, baseline + index * lineHeight, { ...nameStyle, size })));
    baseline += (lines.length - 1) * lineHeight + 64;
    ctx.fillStyle = colours.secondary; rounded(ctx, PAD, baseline - 21, 6, 26, 2); ctx.fill();
    text(kit, [card.owner, card.span].filter(Boolean).join('  ·  '), PAD + 20, baseline, { size: 24, weight: 650, colour: '#e4ddf2', max: 560 });

    const stat = { size: 70, weight: 800, stretch: 88, spacing: -.035 };
    const columns = [PAD, PAD + 368, PAD + 627];
    text(kit, card.record, columns[0], 886, { ...stat, max: 340 });
    label(kit, 'Record · W–L–T', columns[0], 924);
    ctx.fillStyle = 'rgba(255,255,255,.11)'; ctx.fillRect(columns[1], 830, 2, 100); ctx.fillRect(columns[2], 830, 2, 100);
    text(kit, `${card.winRate.toFixed(1)}%`, columns[1] + 30, 886, { ...stat, max: 228 });
    label(kit, 'Win rate', columns[1] + 30, 924);
    text(kit, formatFpts(card.fptsFor), columns[2] + 30, 886, { ...stat, max: 310 });
    label(kit, 'Points for', columns[2] + 30, 924);

    const seasons = card.seasons.slice(-12);
    if (!seasons.length) return;
    label(kit, 'Season by season', PAD, 992);
    const honours = [card.cups ? `${card.cups} Jagr Cup${card.cups === 1 ? '' : 's'}` : '', card.finals ? `${card.finals} Final${card.finals === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
    if (honours) {
        const width = text(kit, honours, RIGHT, 994, { size: 24, weight: 850, colour: GOLD, align: 'right' }).width;
        if (card.cups && kit.cup) contain(ctx, kit.cup, RIGHT - width - 46, 964, 36, 36);
    }
    // Tiles fill the space down to the footer so a phone screen can read every season.
    const gap = 10, tile = (INNER - gap * (seasons.length - 1)) / seasons.length, height = 204;
    seasons.forEach((season, index) => {
        const x = PAD + index * (tile + gap), cx = x + tile / 2, y = 1012;
        const cup = season.result === 'cup', final = season.result === 'final', round = typeof season.result === 'number';
        ctx.fillStyle = cup ? vertical(ctx, y, y + height, [[0, 'rgba(243,217,149,.24)'], [1, 'rgba(201,154,62,.14)']]) : 'rgba(255,255,255,.06)';
        rounded(ctx, x, y, tile, height, 8); ctx.fill();
        ctx.strokeStyle = cup ? 'rgba(243,217,149,.65)' : 'rgba(255,255,255,.1)'; ctx.lineWidth = 2; ctx.stroke();
        text(kit, `'${String(season.year).slice(2)}`, cx, y + 50, { size: 26, weight: 800, colour: cup ? GOLD : '#b9c8da', align: 'center' });
        text(kit, season.record, cx, y + 108, { size: 32, weight: 800, stretch: 86, spacing: -.02, colour: '#fff', align: 'center', max: tile - 12, min: 16 });
        const tag = cup ? 'Cup' : final ? 'Final' : season.result === 'out' ? 'Out' : season.result === 'cancelled' ? '—' : `R${season.result}`;
        const tagStyle = { size: 19, weight: 850, spacing: .08, upper: true };
        const tagWidth = Math.min(tile - 14, Math.max(70, measure(kit, tag, tagStyle) + 22));
        ctx.fillStyle = cup ? vertical(ctx, y + 138, y + 176, [[0, '#f3d995'], [1, '#c99a3e']]) : final ? RED : round ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.07)';
        rounded(ctx, cx - tagWidth / 2, y + 138, tagWidth, 38, 5); ctx.fill();
        text(kit, tag, cx, y + 164, { ...tagStyle, align: 'center', max: tagWidth - 10, min: 11,
            colour: cup ? '#2a1c05' : final ? '#fff' : round ? '#e3ebf5' : '#9fb3cb' });
    });
}

// ---------- season ----------
const DUST: [number, number, number, number][] = [[.14, .22, 2, 1], [.22, .41, 1.5, .8], [.09, .58, 2.5, .6], [.31, .17, 1.5, 1], [.8, .19, 2, 1], [.88, .37, 1.5, 1], [.73, .52, 2.5, .6],
    [.92, .61, 1.5, .8], [.18, .7, 1, .9], [.84, .72, 1, .9], [.39, .3, 1.5, .5], [.64, .27, 1.5, 1], [.05, .34, 1, .9], [.96, .46, 2, 1], [.27, .54, 3, .4], [.69, .64, 1, .9]];
/** A soft overhead light and gold dust behind a trophy. Diffuse pools only: hard-edged beams look rough in a PNG. */
function stageLights(ctx: CanvasRenderingContext2D) {
    glow(ctx, 540, 40, 460, 640, 'rgba(214,232,255,.09)');
    glow(ctx, 540, 300, 300, 260, 'rgba(243,217,149,.07)');
    for (const [x, y, r, alpha] of DUST) { ctx.beginPath(); ctx.arc(x * W, y * (H - 300), r, 0, Math.PI * 2); ctx.fillStyle = `rgba(246,220,154,${alpha})`; ctx.fill(); }
}
async function drawSeason(kit: Kit, card: SeasonShareCard) {
    const { ctx } = kit;
    const colours = teamColours(kit, card.team);
    ctx.fillStyle = vertical(ctx, 0, H, [[0, '#0a1324'], [.55, NAVY], [1, '#0a1222']]); ctx.fillRect(0, 0, W, H);
    glow(ctx, 540, 513, 650, 540, '#2b3d63');
    if (!card.cancelled) glow(ctx, 540, 1350, 860, 400, rgba(colours.primary, .55));
    stageLights(ctx);
    brandBar(kit, ['Season', card.cancelled ? 'Playoffs cancelled' : 'Champions']);

    shadowed(ctx, 24, 8, 'rgba(0,0,0,.65)', () => text(kit, seasonLabel(card.year), W / 2, 302, {
        size: 200, weight: 900, italic: true, stretch: 106, spacing: -.05, align: 'center', max: INNER, colour: card.cancelled ? '#4c5f7a' : goldFill(ctx, 160, 305) }));
    glow(ctx, 540, 440, 300, 80, card.cancelled ? 'rgba(182,220,245,.06)' : 'rgba(243,217,149,.25)');
    if (kit.cup) {
        ctx.save(); ctx.globalAlpha = card.cancelled ? .16 : 1;
        shadowed(ctx, 40, 30, 'rgba(0,0,0,.8)', () => contain(ctx, kit.cup!, 350, 318, 380, 380));
        ctx.restore();
    }
    glow(ctx, 540, 690, 220, 20, 'rgba(0,0,0,.65)');
    const slabText = card.cancelled ? 'Playoffs cancelled' : 'Jagr Cup champions';
    const slabStyle = { size: 30, weight: 900, italic: true, stretch: 125, spacing: .02, upper: true };
    const slabWidth = measure(kit, slabText, slabStyle) + 104;
    slab(ctx, (W - slabWidth) / 2, 700, slabWidth, 56, 16, true);
    ctx.fillStyle = card.cancelled ? '#c3d0e0' : vertical(ctx, 700, 756, [[0, '#f6dc9a'], [1, '#c99a3e']]); ctx.fill();
    text(kit, slabText, W / 2, 739, { ...slabStyle, colour: card.cancelled ? '#101a30' : '#2a1c05', align: 'center' });
    if (!card.team) return;

    const nameStyle = { size: 76, weight: 900, italic: true, stretch: 112, spacing: -.05, min: 44 };
    const { lines, size } = wrap(kit, card.team.name, nameStyle, 640, 2);
    const nameWidth = Math.max(...lines.map(line => measure(kit, line, { ...nameStyle, size })));
    const left = (W - (146 + nameWidth)) / 2;
    await crest(kit, card.team, left + 60, 855, 60);
    const first = lines.length === 1 ? 880 : 850;
    shadowed(ctx, 30, 6, 'rgba(5,12,24,.9)', () => lines.forEach((line, index) => text(kit, line, left + 146, first + index * size * .86, { ...nameStyle, size })));
    if (card.owner) text(kit, card.owner, W / 2, 964, { size: 24, weight: 650, colour: '#c3d0e0', align: 'center' });

    if (!card.scorers.length) return;
    label(kit, 'Top scorers', PAD, 1056);
    const gap = 12, box = (INNER - gap * 2) / 3;
    card.scorers.forEach((scorer, index) => {
        const x = PAD + index * (box + gap);
        ctx.fillStyle = vertical(ctx, 1072, 1192, [[0, 'rgba(255,255,255,.07)'], [1, 'rgba(255,255,255,.025)']]);
        rounded(ctx, x, 1072, box, 120, 6); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 1.5; ctx.stroke();
        text(kit, scorer.name, x + 24, 1116, { size: 25, weight: 800, spacing: -.01, max: box - 48, min: 16 });
        const width = text(kit, formatFpts(scorer.points), x + 24, 1170, { size: 40, weight: 800, stretch: 92, spacing: -.035 }).width;
        text(kit, `FPTS${scorer.position ? ` · ${scorer.position}` : ''}`, x + 34 + width, 1168, { size: 15, weight: 800, spacing: .14, colour: MUTED });
    });
}

// ---------- player comparison ----------
const BRIGHT: Record<string, string> = { '#1F6FC2': '#4aa3ff', '#C8102E': '#ff3b55', '#B8860B': '#f3c35a', '#2E9E6B': '#3fd18f', '#7A4FD0': '#a77ef5' };
function niceStep(range: number) {
    const raw = range / 4, power = 10 ** Math.floor(Math.log10(raw));
    return ([1, 2, 2.5, 5, 10].find(step => step * power >= raw) ?? 10) * power;
}
function drawComparison(kit: Kit, card: ComparisonShareCard) {
    const { ctx } = kit;
    const { chart } = card;
    const series = chart.series.map(row => ({ ...row, colour: BRIGHT[row.colour] ?? row.colour }));
    navyBackground(ctx);
    if (series[0]) glow(ctx, 162, 108, 650, 470, rgba(series[0].colour, .22));
    if (series[1]) glow(ctx, 1026, 540, 540, 400, rgba(series[1].colour, .16));
    brandBar(kit, ['Player comparison']);

    const fpts = chart.metric === 'fpts';
    text(kit, fpts ? 'Fantasy points' : 'Fantasy points per game', PAD, 176, { size: 17, weight: 800, spacing: .16, upper: true });
    label(kit, card.span, RIGHT, 176, MUTED, 'right');
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(PAD, 190, INNER, 2);
    const scored = series.map(row => {
        const values = row.values.filter((value): value is number => value !== null);
        return { ...row, score: fpts ? values.reduce((sum, value) => sum + value, 0) : Math.max(0, ...values) };
    }).sort((a, b) => b.score - a.score);
    const n = scored.length, rowHeight = n <= 3 ? 137 : n === 4 ? 108 : 88;
    const lastSize = n <= 3 ? 74 : n === 4 ? 58 : 48, valueSize = n <= 3 ? 62 : n === 4 ? 52 : 44;
    scored.forEach((row, index) => {
        const top = 192 + index * rowHeight, mid = top + rowHeight / 2;
        text(kit, String(index + 1), 78, mid + 14, { size: 40, weight: 900, stretch: 78, colour: index ? '#8295ad' : '#fff', align: 'center' });
        shadowed(ctx, 18, 0, rgba(row.colour, .55), () => { ctx.fillStyle = row.colour; rounded(ctx, 112, mid - rowHeight * .27, 10, rowHeight * .54, 3); ctx.fill(); });
        const [first, last] = splitName(row.name);
        const valueText = fpts ? formatFpts(row.score) : row.score.toFixed(2);
        const valueWidth = measure(kit, valueText, { size: valueSize, weight: 800, stretch: 92, spacing: -.035 });
        if (first) text(kit, first, 146, mid - lastSize * .42, { size: 20, weight: 700, colour: '#c3d0e0' });
        text(kit, last, 146, mid + lastSize * .5, { size: lastSize, weight: 900, italic: true, stretch: 110, spacing: -.045, upper: true, max: RIGHT - valueWidth - 190, min: 28 });
        text(kit, valueText, RIGHT, mid + valueSize * .36, { size: valueSize, weight: 800, stretch: 92, spacing: -.035, colour: index ? '#dfe7f1' : '#fff', align: 'right' });
        if (!fpts) label(kit, 'Peak', RIGHT - valueWidth - 14, mid + valueSize * .36, MUTED, 'right');
        ctx.fillStyle = 'rgba(255,255,255,.09)'; ctx.fillRect(PAD, top + rowHeight - 1, INNER, 1);
    });

    const values = series.flatMap(row => row.values.filter((value): value is number => value !== null));
    if (!chart.years.length || !values.length) return;
    const chartTop = 192 + n * rowHeight + 64;
    label(kit, fpts ? 'FPts by season' : 'FP/G by season', PAD, chartTop);
    const step = niceStep(Math.max(1e-6, Math.max(...values) - Math.min(...values)) * 1.15);
    const low = Math.floor(Math.min(...values) / step) * step, high = Math.ceil(Math.max(...values) / step) * step;
    const top = chartTop + 70, bottom = 1150, left = PAD + 52, right = RIGHT - 14;
    const x = (index: number) => chart.years.length === 1 ? (left + right) / 2 : left + index / (chart.years.length - 1) * (right - left);
    const y = (value: number) => bottom - (value - low) / Math.max(step, high - low) * (bottom - top);
    for (let tick = low + step; tick <= high + 1e-9; tick += step) {
        ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(PAD + 40, y(tick), INNER - 40, 2);
        text(kit, fpts ? String(Math.round(tick)) : tick.toFixed(1), PAD + 30, y(tick) + 6, { size: 17, weight: 700, colour: '#8295ad', align: 'right' });
    }
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(PAD + 40, bottom, INNER - 40, 2);
    const every = Math.ceil(chart.years.length / 12);
    chart.years.forEach((year, index) => {
        if (index % every === 0 || index === chart.years.length - 1) text(kit, `'${String(year).slice(2)}`, x(index), bottom + 34, { size: 18, weight: 700, colour: '#8295ad', align: 'center' });
    });
    [...series].reverse().forEach(row => {
        for (const pass of [{ width: 12, blur: 14, alpha: .45 }, { width: 5, blur: 0, alpha: 1 }]) {
            ctx.save();
            ctx.globalAlpha = pass.alpha; ctx.strokeStyle = row.colour; ctx.lineWidth = pass.width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
            if (pass.blur) { ctx.shadowBlur = pass.blur; ctx.shadowColor = row.colour; }
            ctx.beginPath();
            let connected = false;
            row.values.forEach((value, index) => {
                if (value === null) { connected = false; return; }
                if (connected) ctx.lineTo(x(index), y(value)); else ctx.moveTo(x(index), y(value));
                connected = true;
            });
            ctx.stroke(); ctx.restore();
        }
        const last = row.values.findLastIndex(value => value !== null);
        if (last >= 0) dot(ctx, x(last), y(row.values[last]!), 8, row.colour);
    });
    const peak = Math.max(...values);
    const owner = series.find(row => row.values.includes(peak))!;
    const index = owner.values.indexOf(peak);
    dot(ctx, x(index), y(peak), 11, owner.colour);
    const chip = fpts ? formatFpts(peak) : peak.toFixed(2);
    const chipWidth = measure(kit, chip, { size: 20, weight: 800 }) + 28;
    const chipX = Math.min(RIGHT - chipWidth, Math.max(PAD, x(index) - chipWidth / 2));
    ctx.fillStyle = owner.colour; rounded(ctx, chipX, y(peak) - 58, chipWidth, 34, 4); ctx.fill();
    text(kit, chip, chipX + chipWidth / 2, y(peak) - 34, { size: 20, weight: 800, colour: '#06101e', align: 'center' });
}
function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = colour; ctx.fill();
    ctx.strokeStyle = NAVY; ctx.lineWidth = 3; ctx.stroke();
}

// ---------- head to head ----------
async function drawVersus(kit: Kit, card: VersusShareCard) {
    const { ctx } = kit;
    const palette = card.teams.map(team => teamColours(kit, team));
    ctx.fillStyle = NAVY; ctx.fillRect(0, 0, W, H);
    const side = (colours: TeamColours, angle: number) => {
        const gradient = ctx.createLinearGradient(W * (angle > 0 ? 0 : 1), 0, W * (angle > 0 ? 1 : 0), 760);
        gradient.addColorStop(0, mix(colours.primary, '#ffffff', .18)); gradient.addColorStop(.45, colours.primary); gradient.addColorStop(1, mix(colours.primary, '#000000', .4));
        return gradient;
    };
    ctx.fillStyle = side(palette[1], -1); ctx.fillRect(0, 0, W, 760);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(605, 0); ctx.lineTo(475, 760); ctx.lineTo(0, 760); ctx.closePath(); ctx.clip();
    ctx.fillStyle = side(palette[0], 1); ctx.fillRect(0, 0, W, 760);
    ctx.restore();
    ctx.lineCap = 'butt';
    shadowed(ctx, 30, 0, 'rgba(5,12,24,.9)', () => { ctx.beginPath(); ctx.moveTo(608, -10); ctx.lineTo(476, 770); ctx.strokeStyle = '#fff'; ctx.lineWidth = 10; ctx.stroke(); });
    ctx.beginPath(); ctx.moveTo(612, -10); ctx.lineTo(480, 770); ctx.strokeStyle = RED; ctx.lineWidth = 6; ctx.stroke();
    ctx.fillStyle = vertical(ctx, 680, 760, [[0, 'rgba(11,20,38,0)'], [1, 'rgba(11,20,38,.6)']]); ctx.fillRect(0, 680, W, 80);
    ctx.fillStyle = vertical(ctx, 760, H, [[0, NAVY], [1, '#08101f']]); ctx.fillRect(0, 760, W, H - 760);
    brandBar(kit, ['Head to head', card.stage === 'playoff' ? 'Playoffs' : 'Regular season']);

    for (const [index, cx] of [[0, 260], [1, 820]] as const) {
        const team = card.teams[index];
        glow(ctx, cx, 250, 230, 150, rgba(mix(palette[index].secondary, '#ffffff', .3), .3));
        await teamMark(kit, team, cx, 250, 330, 214, 36);
        const nameStyle = { size: 46, weight: 900, italic: true, stretch: 110, spacing: -.045, min: 28 };
        const { lines, size } = wrap(kit, team.name, nameStyle, 420, 2);
        shadowed(ctx, 20, 4, 'rgba(5,12,24,.55)', () => lines.forEach((line, row) => text(kit, line, cx, (lines.length === 1 ? 428 : 408) + row * size * .88, { ...nameStyle, size, align: 'center' })));
        shadowed(ctx, 40, 10, 'rgba(5,12,24,.65)', () => text(kit, String(card.wins[index]), cx, 685, { size: 250, weight: 900, italic: true, spacing: -.05, align: 'center', max: 440, colour: index ? 'rgba(255,255,255,.88)' : '#fff' }));
    }
    const pill = [`Wins · ${card.meetings.length} meeting${card.meetings.length === 1 ? '' : 's'}`, card.span, card.ties ? `${card.ties} tied` : ''].filter(Boolean).join(' · ');
    const pillStyle = { size: 18, weight: 850, spacing: .14, upper: true, max: 900, min: 12 };
    const pillWidth = Math.min(960, measure(kit, pill, pillStyle) + 56);
    slab(ctx, (W - pillWidth) / 2, 720, pillWidth, 40, 12, true); ctx.fillStyle = '#050c18'; ctx.fill();
    text(kit, pill, W / 2, 747, { ...pillStyle, align: 'center' });

    const tints = palette.map(colours => mix(colours.primary, '#ffffff', .45));
    if (distance(tints[0], tints[1]) < 90) tints[1] = mix(palette[1].secondary, '#ffffff', .2);
    const numbers = { size: 44, weight: 800, stretch: 92, spacing: -.035 };
    text(kit, formatFpts(card.points[0]), PAD, 864, numbers);
    label(kit, 'FPts', W / 2, 860, MUTED, 'center');
    text(kit, formatFpts(card.points[1]), RIGHT, 864, { ...numbers, colour: '#dfe7f1', align: 'right' });
    const total = card.points[0] + card.points[1], split = total ? (INNER - 4) * card.points[0] / total : (INNER - 4) / 2;
    ctx.fillStyle = tints[0]; rounded(ctx, PAD, 882, split, 16, 3); ctx.fill();
    ctx.fillStyle = tints[1]; rounded(ctx, PAD + split + 4, 882, INNER - 4 - split, 16, 3); ctx.fill();

    label(kit, 'Every meeting', PAD, 958);
    let legend = RIGHT;
    [...card.teams].reverse().forEach((team, reversed) => {
        const width = text(kit, `${team.abbreviation} win`, legend, 958, { size: 16, weight: 750, colour: '#c3d0e0', align: 'right' }).width;
        ctx.fillStyle = tints[1 - reversed]; rounded(ctx, legend - width - 22, 944, 14, 14, 3); ctx.fill();
        legend -= width + 46;
    });
    if (!card.meetings.length) return;
    const groups = card.meetings.reduce<{ year: number; games: VersusShareCard['meetings'] }[]>((list, game) => {
        if (list.at(-1)?.year === game.year) list.at(-1)!.games.push(game); else list.push({ year: game.year, games: [game] });
        return list;
    }, []);
    const groupGap = groups.length > 12 ? 8 : 14, barGap = card.meetings.length > 40 ? 2 : 5;
    const bar = (INNER - groupGap * (groups.length - 1) - barGap * (card.meetings.length - groups.length)) / card.meetings.length;
    const largest = Math.max(1, ...card.meetings.map(game => Math.abs(game.margin ?? 0)));
    const axis = 1076;
    let x = PAD;
    groups.forEach((group, groupIndex) => {
        const start = x;
        group.games.forEach(game => {
            const h = game.margin === null ? 14 : Math.max(4, Math.abs(game.margin) / largest * 104);
            const up = game.winner === 0 || (game.winner === null && (game.margin ?? 0) > 0);
            if (game.winner !== null || game.margin) {
                ctx.fillStyle = up ? tints[0] : tints[1];
                rounded(ctx, x, up ? axis - h : axis + 2, bar, h, Math.min(3, bar / 2)); ctx.fill();
            }
            x += bar + barGap;
        });
        x += groupGap - barGap;
        if (groups.length <= 12 || groupIndex % 2 === 0 || groupIndex === groups.length - 1)
            text(kit, `'${String(group.year).slice(2)}`, (start + x - groupGap) / 2, 1210, { size: 16, weight: 700, colour: '#8295ad', align: 'center' });
    });
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(PAD, axis - 1, INNER, 3);
}

// ---------- draft steal ----------
async function drawSteal(kit: Kit, card: StealShareCard) {
    const { ctx } = kit;
    const colours = teamColours(kit, card.team);
    navyBackground(ctx);
    glow(ctx, 994, 243, 650, 540, rgba(colours.primary, .8));
    ctx.fillStyle = rgba(colours.secondary, .05);
    for (let y = 88; y < 640; y += 128) ctx.fillRect(0, y, W, 40);
    brandBar(kit, [`${seasonLabel(card.year)} draft`, { text: 'Steals', colour: GOLD }]);

    for (const [offset, fill] of [[44, '#3d8bda'], [26, '#ffffff'], [0, null]] as const) {
        ctx.beginPath(); ctx.moveTo(-40 + offset, 150); ctx.lineTo(480 + offset, 150); ctx.lineTo(376 + offset, 620); ctx.lineTo(-40 + offset, 620); ctx.closePath();
        ctx.fillStyle = fill ?? vertical(ctx, 150, 620, [[0, '#df1a3c'], [1, '#a80b25']]); ctx.fill();
    }
    const digits = String(card.number);
    shadowed(ctx, 40, 14, 'rgba(90,0,16,.6)', () => text(kit, digits, 205, digits.length > 1 ? 515 : 540, { size: digits.length > 1 ? 300 : 460, weight: 900, italic: true, spacing: -.06, align: 'center', max: 380 }));

    const column = 556;
    text(kit, `Top ${card.count} steals`, column, 188, { size: 20, weight: 850, spacing: .18, upper: true, colour: GOLD });
    if (card.team) {
        await crest(kit, card.team, column + 46, 258, 46);
        const { lines, size } = wrap(kit, card.team.name, { size: 22, weight: 850, stretch: 125, spacing: .05, min: 14 }, RIGHT - column - 112, 2);
        lines.forEach((line, index) => text(kit, line, column + 112, (lines.length === 1 ? 266 : 254) + index * size * 1.15, { size, weight: 850, stretch: 125, spacing: .05 }));
    } else text(kit, 'No team recorded', column, 266, { size: 22, weight: 700, colour: '#c3d0e0' });
    text(kit, [card.positions.join(' · '), `Round ${card.round}, pick ${card.pick}`].filter(Boolean).join(' · '), column, 342, { size: 22, weight: 650, colour: '#c3d0e0', max: RIGHT - column });
    const stats: [string, string, string?][] = [[formatFpts(card.fpts), 'FPTS'], [card.fpg === null ? '—' : card.fpg.toFixed(2), 'FP/G'], [`#${card.finish}`, 'FPTS FINISH', GOLD]];
    stats.forEach(([value, name, colour], index) => {
        const y = 444 + index * 81;
        const width = text(kit, value, column, y, { size: 68, weight: 800, stretch: 94, spacing: -.035, colour: colour ?? '#fff' }).width;
        text(kit, name, column + width + 16, y, { size: 17, weight: 800, spacing: .16, colour: MUTED });
    });

    const [first, last] = splitName(card.name);
    if (first) text(kit, first, PAD, 712, { size: 60, weight: 700, colour: ICE });
    shadowed(ctx, 36, 8, 'rgba(5,12,24,.65)', () => text(kit, last, PAD - 4, 838, { size: 150, weight: 900, italic: true, spacing: -.05, upper: true, max: INNER, min: 70 }));

    const span = Math.max(1, card.totalPicks - 1);
    const at = (slot: number) => PAD + (Math.min(card.totalPicks, Math.max(1, slot)) - 1) / span * INNER;
    const finishX = Math.max(PAD + 15, at(card.finish)), draftX = Math.max(finishX + 28, at(card.overall));
    const rounds = Math.max(1, card.rounds);
    for (let round = 0; round < rounds; round++) {
        ctx.fillStyle = round % 2 ? '#15223a' : '#1b2a45';
        ctx.fillRect(PAD + round / rounds * INNER, 1000, INNER / rounds, 28);
        if (rounds <= 12 || round % 2 === 0) text(kit, `R${round + 1}`, PAD + round / rounds * INNER, 990, { size: 16, weight: 800, colour: '#6f819b' });
    }
    ctx.fillStyle = ctx.createLinearGradient(finishX, 0, draftX, 0);
    (ctx.fillStyle as CanvasGradient).addColorStop(0, '#f6dc9a'); (ctx.fillStyle as CanvasGradient).addColorStop(1, '#e2b04d');
    rounded(ctx, finishX - 15, 1000, draftX - finishX + 15, 28, 14); ctx.fill();
    shadowed(ctx, 24, 0, 'rgba(243,217,149,.6)', () => { ctx.beginPath(); ctx.arc(finishX, 1014, 21, 0, Math.PI * 2); ctx.fillStyle = '#f6dc9a'; ctx.fill(); });
    ctx.beginPath(); ctx.arc(finishX, 1014, 23.5, 0, Math.PI * 2); ctx.strokeStyle = NAVY; ctx.lineWidth = 5; ctx.stroke();
    ctx.beginPath(); ctx.arc(draftX, 1014, 21, 0, Math.PI * 2); ctx.fillStyle = NAVY; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.stroke();

    const chipStyle = { size: 48, weight: 900, italic: true, stretch: 110, spacing: -.03 };
    const chipText = `+${card.climb}`;
    const chipWidth = measure(kit, chipText, chipStyle) + measure(kit, 'SPOTS', { size: 17, weight: 850, spacing: .14 }) + 62;
    const chipX = Math.min(RIGHT - chipWidth, Math.max(PAD, (finishX + draftX) / 2 - chipWidth / 2));
    slab(ctx, chipX, 892, chipWidth, 66, 14, true);
    ctx.fillStyle = vertical(ctx, 892, 958, [[0, '#df1a3c'], [1, '#b00d28']]); ctx.fill();
    const chipNumber = text(kit, chipText, chipX + 26, 942, chipStyle).width;
    text(kit, 'SPOTS', chipX + 36 + chipNumber, 940, { size: 17, weight: 850, spacing: .14 });

    const value = { size: 62, weight: 850, spacing: -.035 };
    const finishLeft = Math.max(PAD, finishX - 20);
    label(kit, 'Finished', finishLeft, 1086, GOLD);
    const finishWidth = Math.max(measure(kit, `#${card.finish}`, value), measure(kit, 'FINISHED', { size: 17, weight: 800, spacing: .16 }));
    text(kit, `#${card.finish}`, finishLeft, 1150, { ...value, colour: GOLD });
    const draftWidth = Math.max(measure(kit, `#${card.overall}`, value), measure(kit, 'DRAFTED', { size: 17, weight: 800, spacing: .16 }));
    const draftCentre = Math.min(RIGHT - draftWidth / 2, Math.max(finishLeft + finishWidth + 40 + draftWidth / 2, draftX));
    label(kit, 'Drafted', draftCentre, 1086, '#fff', 'center');
    text(kit, `#${card.overall}`, draftCentre, 1150, { ...value, align: 'center' });
}

// ---------- Coach's Corner episode ----------
async function drawEpisode(kit: Kit, card: EpisodeShareCard) {
    const { ctx } = kit;
    ctx.fillStyle = vertical(ctx, 0, H, [[0, '#0a1324'], [.6, NAVY], [1, '#07101e']]); ctx.fillRect(0, 0, W, H);
    glow(ctx, 540, 0, 620, 420, 'rgba(214,232,255,.07)');
    glow(ctx, 170, 1040, 540, 420, 'rgba(200,16,46,.3)');
    glow(ctx, 920, 1040, 540, 420, 'rgba(61,139,218,.24)');
    brandBar(kit, ['Intermission', card.label ? { text: card.label, colour: GOLD } : null]);

    const mark = { size: 150, weight: 900, italic: true, stretch: 112, spacing: -.05, upper: true, max: INNER, min: 90 };
    shadowed(ctx, 30, 8, 'rgba(5,12,24,.7)', () => text(kit, 'Coach’s', PAD - 6, 296, mark));
    setFont(kit, measure(kit, 'CORNER', mark) > INNER ? { ...mark, size: Math.floor(mark.size * INNER / measure(kit, 'CORNER', mark)) } : mark);
    ctx.strokeStyle = ICE; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.textAlign = 'left';
    ctx.strokeText('CORNER', PAD - 6, 428);

    const { lines, size } = wrap(kit, card.episode, { size: 40, weight: 800, min: 28 }, INNER, 2);
    // wrap() upper-cases for headline type; the episode title keeps its own case.
    const words = card.episode.split(/\s+/);
    let cursor = 0;
    const titleLines = lines.map(line => { const count = line.split(' ').length; const value = words.slice(cursor, cursor + count).join(' '); cursor += count; return value; });
    titleLines.forEach((line, index) => text(kit, line, PAD, 500 + index * size * 1.2, { size, weight: 800, colour: '#e8eef6' }));
    let y = 500 + (titleLines.length - 1) * size * 1.2;
    const aired = card.aired ? new Date(card.aired).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null;
    const seconds = Math.round(card.runtimeMs / 1000);
    text(kit, [aired, `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`].filter(Boolean).join('  ·  '), PAD, y + 44, { size: 21, weight: 650, colour: '#8796b5' });
    y += 84;

    const speaker = card.quote?.who ?? 'don';
    if (card.quote) {
        const quoteStyle = { size: 58, weight: 900, italic: true, stretch: 104, spacing: -.02, min: 34 };
        const quote = wrap(kit, `“${card.quote.text}”`, quoteStyle, INNER - 96, 3);
        const height = quote.lines.length * quote.size * 1.12 + 108;
        const tail = speaker === 'don' ? 300 : 790;
        shadowed(ctx, 30, 12, 'rgba(0,0,0,.45)', () => {
            ctx.fillStyle = '#f4f8fb'; rounded(ctx, PAD, y, INNER, height, 18); ctx.fill();
            ctx.beginPath(); ctx.moveTo(tail - 26, y + height - 1); ctx.lineTo(tail + 26, y + height - 1); ctx.lineTo(tail + (speaker === 'don' ? -10 : 10), y + height + 40); ctx.closePath(); ctx.fill();
        });
        quote.lines.forEach((line, index) => text(kit, line, PAD + 48, y + 30 + quote.size + index * quote.size * 1.12, { ...quoteStyle, size: quote.size, colour: '#101a30' }));
        text(kit, `— ${speaker === 'don' ? 'Don' : 'Ron'}`, PAD + 48, y + height - 30, { size: 18, weight: 850, spacing: .16, upper: true, colour: '#b00d28' });
    }

    // The speaker yells; the other host takes it in.
    const [don, ron] = await Promise.all([
        loadImage(artUrl(speaker === 'don' ? 'don-angry-talk' : 'don-stare')),
        loadImage(artUrl(speaker === 'ron' ? 'ron-talk' : 'ron-skeptical-talk')),
    ]);
    const hostTop = Math.max(800, y + 250);
    if (ron) shadowed(ctx, 30, 10, 'rgba(0,0,0,.5)', () => ctx.drawImage(ron, 500, hostTop + 10, 600, 600));
    if (don) shadowed(ctx, 30, 10, 'rgba(0,0,0,.5)', () => ctx.drawImage(don, -30, hostTop, 600, 600));
    const desk = Math.min(1190, hostTop + 380);
    ctx.fillStyle = vertical(ctx, desk, H, [[0, '#16233b'], [1, '#08101f']]); ctx.fillRect(0, desk, W, H - desk);
    ctx.fillStyle = RED; ctx.fillRect(0, desk, W, 5);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, desk + 5, W, 4);
    ctx.fillStyle = '#3d8bda'; ctx.fillRect(0, desk + 9, W, 5);
}

// ---------- award winner ----------
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
async function drawAward(kit: Kit, card: AwardShareCard) {
    const { ctx } = kit;
    const colours = teamColours(kit, card.team);
    ctx.fillStyle = vertical(ctx, 0, H, [[0, '#0a1324'], [.55, NAVY], [1, '#0a1222']]); ctx.fillRect(0, 0, W, H);
    glow(ctx, 540, 378, 650, 510, '#2b3d63');
    glow(ctx, 540, 1350, 860, 380, rgba(colours.primary, .47));
    stageLights(ctx);
    brandBar(kit, ['Awards', { text: seasonLabel(card.year), colour: GOLD }]);

    const trophy = (card.image ? await loadImage(card.image) : null) ?? kit.cup;
    glow(ctx, 540, 350, 280, 150, 'rgba(243,217,149,.27)');
    if (trophy) shadowed(ctx, 40, 30, 'rgba(0,0,0,.8)', () => contain(ctx, trophy, 330, 138, 420, 440));
    glow(ctx, 540, 580, 190, 18, 'rgba(0,0,0,.65)');
    const slabStyle = { size: 32, weight: 900, italic: true, stretch: 125, spacing: .02, upper: true, max: INNER - 104, min: 20 };
    const slabWidth = Math.min(INNER, measure(kit, card.award, slabStyle) + 104);
    slab(ctx, (W - slabWidth) / 2, 604, slabWidth, 58, 16, true);
    ctx.fillStyle = vertical(ctx, 604, 662, [[0, '#f6dc9a'], [1, '#c99a3e']]); ctx.fill();
    text(kit, card.award, W / 2, 645, { ...slabStyle, colour: '#2a1c05', align: 'center' });
    text(kit, card.honor, W / 2, 704, { size: 18, weight: 850, spacing: .18, upper: true, colour: GOLD, align: 'center', max: INNER });

    if (card.recipient === 'player') {
        const [first, last] = splitName(card.winner);
        if (first) {
            setFont(kit, { size: 76, weight: 900, italic: true, spacing: -.035 });
            ctx.strokeStyle = ICE; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.textAlign = 'center';
            ctx.strokeText(first.toUpperCase(), W / 2, 790, INNER);
        }
        shadowed(ctx, 36, 8, 'rgba(5,12,24,.65)', () => text(kit, last, W / 2, 915, { size: 156, weight: 900, italic: true, stretch: 112, spacing: -.05, upper: true, align: 'center', max: INNER, min: 70 }));
    } else {
        const nameStyle = { size: 104, weight: 900, italic: true, stretch: 112, spacing: -.05, min: 56 };
        const { lines, size } = wrap(kit, card.winner, nameStyle, INNER, 2);
        shadowed(ctx, 36, 8, 'rgba(5,12,24,.65)', () => lines.forEach((line, index) =>
            text(kit, line, W / 2, (lines.length === 1 ? 900 : 830) + index * size * .86, { ...nameStyle, size, align: 'center' })));
    }
    // Player awards name the team; team awards name the owner, beside the club's logo.
    const caption = card.recipient === 'player' ? card.team?.name : card.owner ?? card.team?.name;
    if (caption) {
        const captionStyle = card.recipient === 'player' ? { size: 22, weight: 850, stretch: 125, spacing: .06, upper: true } : { size: 26, weight: 700, colour: '#c3d0e0' };
        const markWidth = card.team?.logo ? 82 : 0;
        const width = Math.min(INNER - markWidth, measure(kit, caption, captionStyle));
        const left = W / 2 - (markWidth + width) / 2;
        if (card.team?.logo) await teamMark(kit, card.team, left + 33, 978, 66, 60, 10);
        text(kit, caption, left + markWidth, 987, { ...captionStyle, max: INNER - markWidth, min: 14 });
    }

    ctx.fillStyle = 'rgba(255,255,255,.11)'; ctx.fillRect(PAD, 1064, INNER, 2);
    const stats: [string, string, boolean?][] = card.recipient === 'player'
        ? [[card.fpts === null ? '—' : formatFpts(card.fpts), 'FPts'], [card.fpg === null ? '—' : card.fpg.toFixed(2), 'FP/G']]
        : [[card.record ?? '—', 'Record'], [card.fpts === null ? '—' : formatFpts(card.fpts), 'Points for']];
    stats.push([ordinal(card.count), `${card.short} win`, true]);
    const column = INNER / 3;
    stats.forEach(([value, name, gold], index) => {
        const cx = PAD + column * index + column / 2;
        if (index) { ctx.fillStyle = 'rgba(255,255,255,.11)'; ctx.fillRect(PAD + column * index - 1, 1096, 2, 92); }
        text(kit, value, cx, 1158, { size: 68, weight: 800, stretch: 94, spacing: -.035, align: 'center', max: column - 30, min: 30, colour: gold ? goldFill(ctx, 1100, 1160) : '#fff' });
        label(kit, name, cx, 1188, gold ? GOLD : MUTED, 'center');
    });
}

// Loaded only after Share opens. The PNG never leaves this browser unless the visitor shares it.
export async function renderShareCard(card: ShareCard, palettes: Palettes = {}): Promise<Blob> {
    const family = getComputedStyle(document.body).fontFamily;
    let fontTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
        await Promise.race([
            // Fonts are optional: a failed download must still allow canvas to use the fallback family.
            Promise.allSettled(['italic 900 40px', '900 40px', '800 40px', '700 40px'].map(async font => document.fonts.load(`${font} ${family}`))),
            new Promise(resolve => { fontTimeout = setTimeout(resolve, 2000); }),
        ]);
    } finally { clearTimeout(fontTimeout); }
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image rendering is unavailable in this browser.');
    const [brand, cup] = await Promise.all([loadImage('/yofhldblogo.png'), loadImage('/trophies/jagr-cup.webp')]);
    const kit: Kit = { ctx, family, palettes, brand, cup };
    switch (card.kind) {
        case 'player': await drawPlayer(kit, card); break;
        case 'team': await drawTeam(kit, card); break;
        case 'season': await drawSeason(kit, card); break;
        case 'comparison': drawComparison(kit, card); break;
        case 'versus': await drawVersus(kit, card); break;
        case 'steal': await drawSteal(kit, card); break;
        case 'award': await drawAward(kit, card); break;
        case 'episode': await drawEpisode(kit, card); break;
    }
    footer(kit, card.kind === 'episode' ? `${SHARE_SITE}${card.href}` : SHARE_SITE);
    return new Promise((resolve, reject) => {
        try { canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the image.')), 'image/png'); }
        catch (cause) { reject(new Error('Artwork could not be exported. Copy the page link instead.', { cause })); }
    });
}
