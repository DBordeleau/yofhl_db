import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/coachs-corner/media/:path*', headers: [
      { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
    ] }];
  },
  async redirects() {
    return [
      { source: '/player/\\*:id\\*', destination: '/player/:id', permanent: true },
      { source: '/player/%2A:id%2A', destination: '/player/:id', permanent: true },
      { source: '/compare', destination: '/compare/players', permanent: true },
      { source: '/demo/rivalries', destination: '/compare/teams', permanent: true },
      { source: '/champions', destination: '/season', permanent: true },
      { source: '/champions/:year', destination: '/season/:year', permanent: true },
    ];
  },
  // Link previews read their fonts and art from disk (lib/share/episode-preview.tsx, lib/share/link-preview.tsx);
  // public/ is served from the CDN, not bundled, so each function needs both traced in. A player's preview reads their
  // team's logo when it is a public path rather than an owner's upload; a cancelled season's preview reads the Jagr Cup.
  outputFileTracingIncludes: {
    '/coachs-corner/*/opengraph-image': ['./assets/fonts/archivo/*.ttf', './public/coachs-corner/media/{don,ron}-*-640.*.avif'],
    '/player/*/opengraph-image': ['./assets/fonts/archivo/*.ttf', './public/*logo*.png', './public/logos/*'],
    '/teams/*/opengraph-image': ['./assets/fonts/archivo/*.ttf', './public/*logo*.png', './public/logos/*'],
    '/season/*/opengraph-image': ['./assets/fonts/archivo/*.ttf', './public/*logo*.png', './public/logos/*', './public/trophies/jagr-cup.webp'],
  },
  experimental: { serverActions: { bodySizeLimit: '3mb' } },
  images: { remotePatterns: [{ protocol: 'https', hostname: '*.public.blob.vercel-storage.com', pathname: '/team-logos/**' }] },
};

export default nextConfig;
