import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import Header, { type NavLeader } from "@/components/header";
import TeamBrandingProvider from "@/components/team-branding/branding-provider";
import { getTeamBranding } from "@/lib/data/team-branding";
import { getAllTimeLeaderboard, getAwardTypes, getBannerSeasons, getFranchiseCards, getSingleSeasonLeaderboard, type LeaderRow } from "@/lib/data/league";
import { seasonLabel } from "@/lib/league";
import { getPublishedEpisodes } from "@/lib/data/coachs-corner";
import { episodeSeenKey } from "@/lib/coachs-corner/seen";
import "./globals.css";

// variable width axis drives the expanded headings and condensed rank numbers
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "YOFHL DB",
  description: "An interactive database for YOFHL stats.",
};

const positions = (row: LeaderRow) => row.Position.split(', ').join(' · ');
const navLeaders = (rows: LeaderRow[], meta: (row: LeaderRow) => string): NavLeader[] =>
  rows.slice(0, 5).map(row => ({ id: row.ID, name: row.Player, meta: meta(row), points: row.FPts }));

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [awards, palettes, seasons, franchises, allTime, singleSeason, episodes] = await Promise.all([
    getAwardTypes(), getTeamBranding(), getBannerSeasons(), getFranchiseCards(),
    getAllTimeLeaderboard('all', 1, ''), getSingleSeasonLeaderboard('all', 1, ''),
    getPublishedEpisodes(),
  ]);
  return (
    <html lang="en">
      <body className={`${archivo.variable} min-h-screen overflow-x-hidden bg-ice font-sans text-ink antialiased`}>
        <Header
          awards={awards}
          latestCoachsCornerEpisode={episodes[0] ? episodeSeenKey(episodes[0]) : null}
          seasons={seasons}
          franchises={franchises.filter(team => !team.defunct).map(team => ({ id: team.ID, name: team.Team, abbreviation: team.Abbreviation, owner: team.Owner, logo: team.LogoUrl }))}
          allTime={navLeaders(allTime.rows, positions)}
          singleSeason={navLeaders(singleSeason.rows, row => [row.Year ? seasonLabel(row.Year) : null, positions(row)].filter(Boolean).join(' · '))}
        />
        <TeamBrandingProvider palettes={palettes}>{children}</TeamBrandingProvider>
      </body>
    </html>
  );
}
