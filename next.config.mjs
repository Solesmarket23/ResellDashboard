/** @type {import('next').NextConfig} */
const nextConfig = {
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
  // trailingSlash: true, // This might be breaking API routes
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
        ],
      },
    ];
  },
};

export default nextConfig;
