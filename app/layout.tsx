import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { LayoutShell } from "@/components/LayoutShell";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Clients & Jobs Finder",
  description: "Find potential clients and job offers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <LayoutShell>{children}</LayoutShell>
        <Toaster />
      </body>
    </html>
  );
}
