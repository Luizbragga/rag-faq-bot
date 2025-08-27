import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Não bloqueia o build na Vercel por causa de regras do ESLint
    ignoreDuringBuilds: true,
  },
  typescript: {
    // (opcional) evita que erros de TS travem o build do demo
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
