"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import type { ScrapeSchedule } from "@/lib/types";
import { JOB_PLATFORMS, DEFAULT_KEYWORDS } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";
import {
  Settings,
  Clock,
  Plus,
  Edit2,
  Trash2,
  Play,
  Pause,
  Calendar,
  Briefcase,
  Users,
} from "lucide-react";

export default function SettingsPage() {
  const [schedules, setSchedules] = useState<ScrapeSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [currentSchedule, setCurrentSchedule] = useState<Partial<ScrapeSchedule> | null>(null);

  const { toast } = useToast();

  const fetchSchedules = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("scrape_schedules")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error", description: "Failed to fetch schedules", variant: "destructive" });
    } else {
      setSchedules(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  const handleCreate = (type: "businesses" | "jobs") => {
    setCurrentSchedule({
      name: "",
      type,
      enabled: true,
      frequency: "daily",
      time_of_day: "09:00",
      day_of_week: null,
      config: type === "jobs" ? { platforms: ["ictjob"], keywords: ["web developer"] } : { location: "" },
    });
    setEditModalOpen(true);
  };

  const handleEdit = (schedule: ScrapeSchedule) => {
    setCurrentSchedule(schedule);
    setEditModalOpen(true);
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    const { error } = await supabase
      .from("scrape_schedules")
      .update({ enabled })
      .eq("id", id);

    if (error) {
      toast({ title: "Error", description: "Failed to update schedule", variant: "destructive" });
    } else {
      fetchSchedules();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("scrape_schedules").delete().eq("id", id);

    if (error) {
      toast({ title: "Error", description: "Failed to delete schedule", variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: "Schedule deleted" });
      fetchSchedules();
    }
  };

  const calculateNextRun = (schedule: Partial<ScrapeSchedule>): string => {
    if (!schedule.time_of_day) return new Date().toISOString();

    const now = new Date();
    const [hours, minutes] = schedule.time_of_day.split(":").map(Number);
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);

    if (next <= now) {
      if (schedule.frequency === "daily") {
        next.setDate(next.getDate() + 1);
      } else if (schedule.frequency === "weekly" && schedule.day_of_week != null) {
        next.setDate(next.getDate() + ((7 + (schedule.day_of_week ?? 0) - now.getDay()) % 7 || 7));
      }
    }

    return next.toISOString();
  };

  const handleSave = async () => {
    if (!currentSchedule?.name || !currentSchedule?.type) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }

    const nextRun = calculateNextRun(currentSchedule);
    const isEdit = "id" in currentSchedule && currentSchedule.id;

    const scheduleData = {
      name: currentSchedule.name,
      type: currentSchedule.type,
      enabled: currentSchedule.enabled ?? true,
      frequency: currentSchedule.frequency || "daily",
      time_of_day: currentSchedule.time_of_day || "09:00",
      day_of_week: currentSchedule.day_of_week ?? null,
      config: currentSchedule.config || {},
      next_run_at: nextRun,
    };

    if (isEdit) {
      const { error } = await supabase
        .from("scrape_schedules")
        .update(scheduleData)
        .eq("id", currentSchedule.id);

      if (error) {
        toast({ title: "Error", description: "Failed to update schedule", variant: "destructive" });
        return;
      }
    } else {
      const { error } = await supabase.from("scrape_schedules").insert(scheduleData);

      if (error) {
        toast({ title: "Error", description: "Failed to create schedule", variant: "destructive" });
        return;
      }
    }

    toast({ title: "Saved", description: "Schedule saved successfully" });
    setEditModalOpen(false);
    fetchSchedules();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="mt-1 text-muted-foreground">
            Manage search schedules and preferences
          </p>
        </div>
      </div>

      {/* Schedule Manager */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Scheduled Searches
              </CardTitle>
              <CardDescription>
                Set up automatic searching at regular intervals
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleCreate("businesses")}>
                <Users className="mr-2 h-4 w-4" />
                Schedule Clients
              </Button>
              <Button onClick={() => handleCreate("jobs")}>
                <Briefcase className="mr-2 h-4 w-4" />
                Schedule Jobs
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : schedules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Calendar className="mb-4 h-12 w-12 text-muted-foreground/30" />
              <p className="text-lg font-medium text-muted-foreground">No schedules yet</p>
              <p className="text-sm text-muted-foreground/70">
                Create a schedule to automate your searching
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="flex items-center justify-between rounded-md border border-border p-4"
                >
                  <div className="flex items-center gap-4">
                    <Switch
                      checked={schedule.enabled}
                      onCheckedChange={(checked) => handleToggle(schedule.id, checked)}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{schedule.name}</p>
                        <Badge variant={schedule.type === "jobs" ? "secondary" : "outline"}>
                          {schedule.type}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {schedule.frequency === "daily"
                          ? `Daily at ${schedule.time_of_day}`
                          : `Weekly on ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][schedule.day_of_week || 0]} at ${schedule.time_of_day}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right text-sm">
                      <p className="text-muted-foreground">
                        Next: {schedule.next_run_at ? formatRelativeTime(schedule.next_run_at) : "N/A"}
                      </p>
                      {schedule.last_run_at && (
                        <p className="text-xs text-muted-foreground/70">
                          Last: {formatRelativeTime(schedule.last_run_at)}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(schedule)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(schedule.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit/Create Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {currentSchedule && "id" in currentSchedule ? "Edit Schedule" : "Create Schedule"}
            </DialogTitle>
            <DialogDescription>
              Configure when and what to search automatically
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Schedule Name</Label>
              <Input
                id="name"
                placeholder="e.g., Daily job search"
                value={currentSchedule?.name || ""}
                onChange={(e) =>
                  setCurrentSchedule((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select
                  value={currentSchedule?.frequency || "daily"}
                  onValueChange={(v) =>
                    setCurrentSchedule((prev) => ({
                      ...prev,
                      frequency: v as "daily" | "weekly",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={currentSchedule?.time_of_day || "09:00"}
                  onChange={(e) =>
                    setCurrentSchedule((prev) => ({ ...prev, time_of_day: e.target.value }))
                  }
                />
              </div>
            </div>

            {currentSchedule?.frequency === "weekly" && (
              <div className="space-y-2">
                <Label>Day of Week</Label>
                <Select
                  value={String(currentSchedule?.day_of_week ?? 1)}
                  onValueChange={(v) =>
                    setCurrentSchedule((prev) => ({ ...prev, day_of_week: parseInt(v) }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(
                      (day, i) => (
                        <SelectItem key={day} value={String(i)}>
                          {day}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Type-specific config */}
            {currentSchedule?.type === "jobs" && (
              <>
                <div className="space-y-2">
                  <Label>Platforms</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {JOB_PLATFORMS.map((platform) => (
                      <div key={platform.id} className="flex items-center gap-2">
                        <Checkbox
                          checked={currentSchedule?.config?.platforms?.includes(platform.id)}
                          onCheckedChange={(checked) => {
                            const platforms = currentSchedule?.config?.platforms || [];
                            setCurrentSchedule((prev) => ({
                              ...prev,
                              config: {
                                ...prev?.config,
                                platforms: checked
                                  ? [...platforms, platform.id]
                                  : platforms.filter((p: string) => p !== platform.id),
                              },
                            }));
                          }}
                        />
                        <span className="text-sm">{platform.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Keywords</Label>
                  <div className="flex flex-wrap gap-2">
                    {DEFAULT_KEYWORDS.slice(0, 6).map((kw) => (
                      <Badge
                        key={kw}
                        variant={
                          currentSchedule?.config?.keywords?.includes(kw)
                            ? "default"
                            : "outline"
                        }
                        className="cursor-pointer"
                        onClick={() => {
                          const keywords = currentSchedule?.config?.keywords || [];
                          setCurrentSchedule((prev) => ({
                            ...prev,
                            config: {
                              ...prev?.config,
                              keywords: keywords.includes(kw)
                                ? keywords.filter((k: string) => k !== kw)
                                : [...keywords, kw],
                            },
                          }));
                        }}
                      >
                        {kw}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {currentSchedule?.type === "businesses" && (
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  placeholder="e.g., Brussels, Belgium"
                  value={currentSchedule?.config?.location || ""}
                  onChange={(e) =>
                    setCurrentSchedule((prev) => ({
                      ...prev,
                      config: { ...prev?.config, location: e.target.value },
                    }))
                  }
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
