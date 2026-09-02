const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  swcMinify: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      'recharts',
      '@tanstack/react-query',
    ],
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  /**
   * Fix: webpack PackFileCacheStrategy warning on Windows.
   *
   * On Windows, the OS can return drive letters in either case (c:\ vs C:\).
   * This causes webpack's file-system cache to see two different canonical paths
   * for the same file and log a warning. Pinning typescript to its real, resolved
   * path forces webpack to use a single canonical form and silences the warning.
   */
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      typescript: path.resolve(__dirname, 'node_modules/typescript'),
    };
    return config;
  },
};

module.exports = nextConfig;

