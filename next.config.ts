import type { NextConfig } from 'next';
const config: NextConfig = {
  distDir:process.env.CODEDESK_E2E==='1'?'.next-e2e':'.next',
  turbopack:{root:process.cwd()},
  serverExternalPackages: ['exceljs'],
  experimental: { serverActions: { bodySizeLimit: '8mb' } },
};
export default config;
