/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Persist Turbopack artifacts between local `next build` runs (Next 16+).
    // Speeds up warm rebuilds; safe no-op if unsupported on a given runner.
    turbopackFileSystemCacheForBuild: true,
  },
};

module.exports = nextConfig;
