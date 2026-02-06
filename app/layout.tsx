import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Sidebar } from "@/components/Sidebar";

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
        <div className="flex min-h-screen overflow-x-hidden">
          <Sidebar />
          <main className="flex-1 pt-14 lg:pt-0 lg:ml-64 min-w-0">
            <div className="p-3 sm:p-6 lg:p-8 w-full max-w-full">{children}</div>
          </main>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
