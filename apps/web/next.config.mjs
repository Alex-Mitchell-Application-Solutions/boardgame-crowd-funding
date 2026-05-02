/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // typedRoutes graduated out of `experimental` in Next 15.5+.
  typedRoutes: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.r2.dev',
      },
      {
        protocol: 'https',
        hostname: '*.cloudflarestorage.com',
      },
    ],
  },
  transpilePackages: ['@bgcf/ui', '@bgcf/db', '@bgcf/email'],
};

export default nextConfig;
