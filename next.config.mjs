/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };
    config.externals = [...(config.externals ?? []), "pino-pretty"];
    return config;
  },
};

export default nextConfig;
