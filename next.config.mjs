/** @type {import('next').NextConfig} */
const nextConfig = {
  // The agent + fixture libs read PNG fixtures from disk at request time on the server.
  // Keep them out of the client bundle.
  serverExternalPackages: ["pngjs"],
};

export default nextConfig;
