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
  experimental: { serverActions: { bodySizeLimit: '3mb' } },
  images: { remotePatterns: [{ protocol: 'https', hostname: '*.public.blob.vercel-storage.com', pathname: '/team-logos/**' }] },
};

export default nextConfig;
