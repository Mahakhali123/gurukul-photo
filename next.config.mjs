/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server holds no ML models (API-only: browser vectors + NVIDIA verify),
  // so no native bindings need externalizing.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'drive.google.com',
      },
      {
        protocol: 'https',
        hostname: 'drive.usercontent.google.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: '**.googleusercontent.com',
      }
    ],
  },
  async rewrites() {
    return [
      // The Gurukul theme serves the brand faces without CORS headers, and fonts
      // are always fetched in CORS mode — so proxy them onto our own origin.
      {
        source: '/brand-fonts/:file*',
        destination: 'https://gurukul.org/wp-content/themes/gurukularts/fonts/:file*',
      },
    ];
  },
};

export default nextConfig;
