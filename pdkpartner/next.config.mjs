/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { allowedOrigins: ["localhost:3002"] } },
};
export default nextConfig;
