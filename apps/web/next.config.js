/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@p2p/shared'],
  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    
    // Polyfills for Web3 libraries
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: false,
      '@react-native-async-storage/async-storage': false,
    };
    
    return config;
  },
  // Suppress hydration warnings for RainbowKit
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
};

module.exports = nextConfig;
