import { notFound } from 'next/navigation';
import { getChampionRoster, getSeasonArchive } from '@/lib/data/league';
import { getTeamBranding } from '@/lib/data/team-branding';
import { renderLinkPreview } from '@/lib/share/link-preview';
import { seasonShareCard } from '@/lib/share/model';
import { PREVIEW_HEIGHT, PREVIEW_WIDTH } from '@/lib/share/preview';
import { paletteFor } from '@/lib/team-branding';

// The season's link preview. It reads the season, its champion's roster and the team colours through the same
// tag-cached lookups as the page, so a sync or a branding change (which expire those tags) refreshes it. The ballots
// page under it keeps the site-wide preview: its own metadata names that image, which replaces this one.

export const alt = "A YOFHL season's Jagr Cup champion and its top scorers";
export const size = { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT };
export const contentType = 'image/png';

// Rendered on the first unfurl, then cached until a sync invalidates it, like the page.
export function generateStaticParams() { return []; }

export default async function Image({ params }: { params: Promise<{ year: string }> }) {
    const { year } = await params;
    if (!/^\d{4}$/.test(year)) notFound();
    const season = (await getSeasonArchive()).published.find(published => published.year === Number(year));
    // the season being played has no page yet, so it has no preview either
    if (!season) notFound();
    const cancelled = season.playoffStatus === 'cancelled';
    const champ = cancelled ? null : await getChampionRoster(season.year);
    if (!cancelled && !champ) notFound();
    const card = seasonShareCard(season, champ?.rows);
    return renderLinkPreview(card, paletteFor(await getTeamBranding(), card.team));
}
