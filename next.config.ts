import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["puppeteer-core", "puppeteer", "pdf-parse", "mammoth", "adm-zip"],
};

export default nextConfig;
