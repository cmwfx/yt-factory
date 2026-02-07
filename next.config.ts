import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Suppress verbose API route logs in development
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
  // Reduce development server noise
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },
};

export default nextConfig;
