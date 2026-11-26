import { notFound } from 'next/navigation';
import { parsePositiveInt4 } from '@/lib/data/bounds';
import { getFranchise } from '@/lib/data/league';
import { getTeamBranding } from '@/lib/data/team-branding';
import { renderLinkPreview } from '@/lib/share/link-preview';
import { teamShareCard } from '@/lib/share/model';
import { PREVIEW_HEIGHT, PREVIEW_WIDTH } from '@/lib/share/preview';

// The franchise's link preview. It reads the franchise and the team colours through the same tag-cached lookups as
// the page, so a sync or a branding change (which expire those tags) refreshes it. X uses this image too, through
// summary_large_image.

export const alt = "A YOFHL franchise's record, win rate, points for and Jagr Cups";
export const size = { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT };
export const contentType = 'image/png';

// Rendered on the first unfurl, then cached until a sync invalidates it, like the page.
export function generateStaticParams() { return []; }

export default async function Image({ params }: { params: Promise<{ ID: string }> }) {
    const id = parsePositiveInt4((await params).ID);
    const franchise = id === null ? null : await getFranchise(id);
    if (!franchise) notFound();
    return renderLinkPreview(teamShareCard(franchise), await getTeamBranding());
}
