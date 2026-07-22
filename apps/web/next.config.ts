import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@dsa-tracker/shared', '@dsa-tracker/plan-data'],
};

export default nextConfig;
