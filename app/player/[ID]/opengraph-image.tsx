import { notFound } from 'next/navigation';
import { playerHonors } from '@/lib/data/award-archive';
import { safeDecodeParam } from '@/lib/data/bounds';
import { getPlayer } from '@/lib/data/league';
import { getTeamBranding } from '@/lib/data/team-branding';
import { renderLinkPreview } from '@/lib/share/link-preview';
import { playerShareCard } from '@/lib/share/model';
import { PREVIEW_HEIGHT, PREVIEW_WIDTH } from '@/lib/share/preview';
import { paletteFor } from '@/lib/team-branding';

// The player's link preview. It reads the player, their honours and the team colours through the same tag-cached
// lookups as the page, so a sync or a branding change (which expire those tags) refreshes it. X uses this image too,
// through summary_large_image.

export const alt = "A YOFHL player's career fantasy points, points per game and Jagr Cups";
export const size = { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT };
export const contentType = 'image/png';

// Rendered on the first unfurl, then cached until a sync invalidates it, like the page.
export function generateStaticParams() { return []; }

export default async function Image({ params }: { params: Promise<{ ID: string }> }) {
    const playerId = safeDecodeParam((await params).ID);
    const player = playerId ? await getPlayer(playerId) : null;
    if (!player) notFound();
    const [honors, branding] = await Promise.all([playerHonors(player.id), getTeamBranding()]);
    const card = playerShareCard(player, honors);
    return renderLinkPreview(card, paletteFor(branding, card.team));
}
