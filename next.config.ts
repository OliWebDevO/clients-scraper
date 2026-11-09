import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the project root: without it Turbopack resolves `tailwindcss` from the parent folder and CSS fails to compile
  turbopack: { root: __dirname },
  // The first-contact email is generated in the browser: expose the phone used in its signature
  env: { SENDER_PHONE: process.env.SENDER_PHONE ?? "" },
  serverExternalPackages: ["puppeteer-core", "puppeteer", "pdf-parse", "mammoth", "adm-zip"],
};

export default nextConfig;
