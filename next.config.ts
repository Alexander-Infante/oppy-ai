import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
  
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  
  // ✅ Configure webpack to exclude Genkit from build-time processing
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push({
          'genkit': 'commonjs genkit',
          '@genkit-ai/googleai': 'commonjs @genkit-ai/googleai',
          '@genkit-ai/core': 'commonjs @genkit-ai/core',
          '@genkit-ai/next': 'commonjs @genkit-ai/next',
        });
      }
    }
    return config;
  },
  
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;