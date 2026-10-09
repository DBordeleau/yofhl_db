import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/champions', destination: '/season', permanent: true },
      { source: '/champions/:year', destination: '/season/:year', permanent: true },
    ];
  },
  experimental: { serverActions: { bodySizeLimit: '3mb' } },
  images: { remotePatterns: [{ protocol: 'https', hostname: '*.public.blob.vercel-storage.com', pathname: '/team-logos/**' }] },
};

export default nextConfig;
