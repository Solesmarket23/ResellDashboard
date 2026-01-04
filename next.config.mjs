/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE: `next build` writes into `distDir`. If you run `next build` while `next dev` is running,
  // it can corrupt the dev server's on-demand assets (leading to an unstyled page because
  // /_next/static/* returns 404/500). For local-only isolated builds, set NEXT_DIST_DIR
  // (see package.json script `build:isolated`).
  // To make localhost resilient, use a separate distDir in development so `next build`
  // (or `next start`) can't clobber the dev server's assets.
  distDir:
    process.env.NEXT_DIST_DIR ||
    (process.env.NODE_ENV === 'development' ? '.next-dev' : '.next'),
  // Allow building despite ESLint errors for mobile app
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Allow building despite TypeScript errors for mobile app
  typescript: {
    ignoreBuildErrors: true,
  },
  // Disable static optimization for Firebase compatibility
  experimental: {
    forceSwcTransforms: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "replicate.com",
      },
      {
        protocol: "https",
        hostname: "replicate.delivery",
      },
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
    ],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  // Mobile app configuration
  // Output directory for Capacitor (disabled for Vercel deployment)
  // distDir: 'out',
  
  // Add script to handle mobile app environment
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          // Allow Capacitor WebView to load the app
          {
            key: 'Access-Control-Allow-Origin',
            value: 'capacitor://localhost',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
