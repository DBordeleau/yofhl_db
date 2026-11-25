import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import Header, { type NavLeader } from "@/components/header";
import TeamBrandingProvider from "@/components/team-branding/branding-provider";
import { getTeamBranding } from "@/lib/data/team-branding";
import { getAllTimeLeaderboard, getFranchiseCards, getSeasonArchive, getSingleSeasonLeaderboard, type LeaderRow } from "@/lib/data/league";
import { listed } from "@/lib/data/award-archive";
import { awardSummary } from "@/lib/awards";
import { seasonLabel } from "@/lib/league";
import { getPublishedEpisodes } from "@/lib/data/coachs-corner";
import { episodeSeenKey } from "@/lib/coachs-corner/seen";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site-metadata";
import "./globals.css";

// variable width axis drives the expanded headings and condensed rank numbers
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

// What a page that sets no metadata of its own says. Every public page should go through pageMetadata (lib/site-metadata.ts)
// instead; this is the floor under them, and the metadataBase every preview URL is built from.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  openGraph: { type: "website", siteName: SITE_NAME, title: SITE_NAME, description: SITE_DESCRIPTION },
  twitter: { card: "summary_large_image", title: SITE_NAME, description: SITE_DESCRIPTION },
};

const positions = (row: LeaderRow) => row.Position.split(', ').join(' · ');
const navLeaders = (rows: LeaderRow[], meta: (row: LeaderRow) => string): NavLeader[] =>
  rows.slice(0, 5).map(row => ({ id: row.ID, name: row.Player, meta: meta(row), points: row.FPts }));

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [listedAwards, palettes, seasonArchive, franchises, allTime, singleSeason, episodes] = await Promise.all([
    listed(), getTeamBranding(), getSeasonArchive(), getFranchiseCards(),
    getAllTimeLeaderboard('all', 1, ''), getSingleSeasonLeaderboard('all', 1, ''),
    getPublishedEpisodes(),
  ]);
  return (
    <html lang="en">
      <body className={`${archivo.variable} min-h-screen overflow-x-hidden bg-ice font-sans text-ink antialiased`}>
        <Header
          listedAwards={listedAwards.map(awardSummary)}
          latestCoachsCornerEpisode={episodes[0] ? episodeSeenKey(episodes[0]) : null}
          seasonArchive={seasonArchive}
          franchises={franchises.filter(team => !team.defunct).map(team => ({ id: team.ID, name: team.Team, abbreviation: team.Abbreviation, owner: team.Owner, logo: team.LogoUrl }))}
          allTime={navLeaders(allTime.rows, positions)}
          singleSeason={navLeaders(singleSeason.rows, row => [row.Year ? seasonLabel(row.Year) : null, positions(row)].filter(Boolean).join(' · '))}
        />
        <TeamBrandingProvider palettes={palettes}>{children}</TeamBrandingProvider>
        <Analytics />
      </body>
    </html>
  );
}
