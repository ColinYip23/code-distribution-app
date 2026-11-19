import type { NextConfig } from 'next';
const config: NextConfig = {
  turbopack:{root:process.cwd()},
  serverExternalPackages: ['exceljs'],
  experimental: { serverActions: { bodySizeLimit: '8mb' } },
};
export default config;
