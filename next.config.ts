import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ✅ Fix per Next.js 16: se hai config webpack, devi dichiarare turbopack
  turbopack: {},

  // Se avevi già altre opzioni, puoi rimetterle qui sotto.
  // Lascio volutamente minimal per evitare conflitti in build su Vercel.
};

export default nextConfig;

