import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ✅ Next 16: dichiara turbopack (anche vuoto) per evitare l’errore “webpack config + no turbopack config”
  turbopack: {},

  // ✅ Importantissimo: stub dei moduli Node nel bundle client
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        http: false,
        https: false,
        zlib: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

export default nextConfig;

