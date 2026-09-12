import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Subida de manuscritos (.docx) desde el panel por server action.
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
}

export default nextConfig
