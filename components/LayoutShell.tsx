"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Button } from "@/components/ui/button";
import { PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  return (
    <div className="flex min-h-screen overflow-x-hidden">
      <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />
      <main
        className={cn(
          "flex-1 pt-14 lg:pt-0 min-w-0 transition-[margin] duration-300 ease-in-out",
          collapsed ? "lg:ml-0" : "lg:ml-64"
        )}
      >
        <div className="p-3 sm:p-6 lg:p-8 w-full max-w-full">
          {collapsed && (
            <div className="hidden lg:flex mb-4">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => setCollapsed(false)}
                title="Afficher le menu"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
