"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Mail,
  Settings,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Clients", href: "/clients", icon: Users },
  { name: "Jobs", href: "/jobs", icon: Briefcase },
  { name: "Emails", href: "/emails", icon: Mail },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-background">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center border-b border-border px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Briefcase className="h-4 w-4" />
            </div>
            <span className="text-lg font-semibold tracking-tight">
              Scraper
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "group flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </div>
                <ArrowRight
                  className={cn(
                    "h-4 w-4 opacity-0 transition-all duration-200",
                    isActive
                      ? "opacity-100"
                      : "group-hover:opacity-100 group-hover:translate-x-0.5"
                  )}
                />
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-4">
          <div className="rounded-md bg-muted p-3">
            <p className="text-xs text-muted-foreground">
              Find clients & jobs faster with automated scraping.
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
