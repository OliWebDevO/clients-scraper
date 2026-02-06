"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Briefcase,
  Mail,
  Clock,
  ArrowRight,
  Play,
  TrendingUp,
  Activity,
} from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { ScrapeLog } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";

interface DashboardStats {
  totalClients: number;
  totalJobs: number;
  emailsSent: number;
  lastScrape: string | null;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalClients: 0,
    totalJobs: 0,
    emailsSent: 0,
    lastScrape: null,
  });
  const [recentLogs, setRecentLogs] = useState<ScrapeLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [businessesRes, jobsRes, emailsRes, logsRes] = await Promise.all([
          supabase.from("businesses").select("id", { count: "exact", head: true }),
          supabase.from("jobs").select("id", { count: "exact", head: true }),
          supabase.from("sent_emails").select("id", { count: "exact", head: true }),
          supabase
            .from("scrape_logs")
            .select("*")
            .order("started_at", { ascending: false })
            .limit(5),
        ]);

        setStats({
          totalClients: businessesRes.count || 0,
          totalJobs: jobsRes.count || 0,
          emailsSent: emailsRes.count || 0,
          lastScrape: logsRes.data?.[0]?.started_at || null,
        });

        setRecentLogs((logsRes.data as ScrapeLog[]) || []);
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  const statCards = [
    {
      title: "Total Clients",
      value: stats.totalClients,
      icon: Users,
      href: "/clients",
      color: "text-blue-400",
    },
    {
      title: "Total Jobs",
      value: stats.totalJobs,
      icon: Briefcase,
      href: "/jobs",
      color: "text-green-400",
    },
    {
      title: "Emails Sent",
      value: stats.emailsSent,
      icon: Mail,
      href: "/emails",
      color: "text-purple-400",
    },
    {
      title: "Last Scrape",
      value: stats.lastScrape ? formatRelativeTime(stats.lastScrape) : "Never",
      icon: Clock,
      href: "/settings",
      color: "text-yellow-400",
      isText: true,
    },
  ];

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm sm:text-base text-muted-foreground">
            Overview of your scraping activities
          </p>
        </div>
        <div className="flex gap-2 sm:gap-3">
          <Link href="/clients" className="flex-1 sm:flex-none">
            <Button variant="outline" size="sm" className="w-full sm:w-auto gap-2">
              <Play className="h-4 w-4" />
              <span className="hidden xs:inline">Scrape</span> Clients
            </Button>
          </Link>
          <Link href="/jobs" className="flex-1 sm:flex-none">
            <Button size="sm" className="w-full sm:w-auto gap-2">
              <Play className="h-4 w-4" />
              <span className="hidden xs:inline">Scrape</span> Jobs
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Link key={stat.title} href={stat.href}>
            <Card className="group cursor-pointer transition-all duration-200 hover:border-primary/50 hover:bg-card/80">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span
                    className={`text-2xl font-bold ${
                      stat.isText ? "text-lg" : ""
                    }`}
                  >
                    {loading ? "..." : stat.value}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0.5" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Actions & Recent Activity */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/clients" className="block">
              <div className="group flex items-center justify-between rounded-md border border-border p-4 transition-all duration-200 hover:border-primary/50 hover:bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/10">
                    <Users className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium">Find New Clients</p>
                    <p className="text-sm text-muted-foreground">
                      Scrape Google Maps for businesses
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground transition-all duration-200 group-hover:text-foreground group-hover:translate-x-0.5" />
              </div>
            </Link>

            <Link href="/jobs" className="block">
              <div className="group flex items-center justify-between rounded-md border border-border p-4 transition-all duration-200 hover:border-primary/50 hover:bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-green-500/10">
                    <Briefcase className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium">Discover Jobs</p>
                    <p className="text-sm text-muted-foreground">
                      Search Belgian job platforms
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground transition-all duration-200 group-hover:text-foreground group-hover:translate-x-0.5" />
              </div>
            </Link>

            <Link href="/emails" className="block">
              <div className="group flex items-center justify-between rounded-md border border-border p-4 transition-all duration-200 hover:border-primary/50 hover:bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-purple-500/10">
                    <Mail className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="font-medium">Send Outreach</p>
                    <p className="text-sm text-muted-foreground">
                      Create and send email campaigns
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground transition-all duration-200 group-hover:text-foreground group-hover:translate-x-0.5" />
              </div>
            </Link>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                Loading...
              </div>
            ) : recentLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Activity className="mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-muted-foreground">No recent activity</p>
                <p className="text-sm text-muted-foreground/70">
                  Start a scrape to see activity here
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between rounded-md border border-border p-3"
                  >
                    <div className="flex items-center gap-3">
                      {log.type === "businesses" ? (
                        <Users className="h-4 w-4 text-blue-400" />
                      ) : (
                        <Briefcase className="h-4 w-4 text-green-400" />
                      )}
                      <div>
                        <p className="text-sm font-medium capitalize">
                          {log.type} Scrape
                          {log.source && ` (${log.source})`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeTime(log.started_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {log.items_found} found
                      </span>
                      <Badge
                        variant={
                          log.status === "completed"
                            ? "success"
                            : log.status === "failed"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {log.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
