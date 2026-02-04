import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Sidebar } from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Clients & Jobs Scraper",
  description: "Scrape potential clients and job offers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 ml-64">
            <div className="p-8">{children}</div>
          </main>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
