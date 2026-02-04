"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import type { EmailTemplate, SentEmail } from "@/lib/types";
import { EMAIL_VARIABLES } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";
import {
  Mail,
  Plus,
  Edit2,
  Trash2,
  Star,
  Clock,
  Send,
  Eye,
  FileText,
} from "lucide-react";

export default function EmailsPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<Partial<EmailTemplate> | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    const [templatesRes, emailsRes] = await Promise.all([
      supabase.from("email_templates").select("*").order("is_default", { ascending: false }),
      supabase.from("sent_emails").select("*").order("sent_at", { ascending: false }).limit(20),
    ]);

    setTemplates(templatesRes.data || []);
    setSentEmails(emailsRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreate = () => {
    setCurrentTemplate({
      name: "",
      subject: "",
      body: "",
      is_default: false,
    });
    setEditModalOpen(true);
  };

  const handleEdit = (template: EmailTemplate) => {
    setCurrentTemplate(template);
    setEditModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("email_templates").delete().eq("id", id);

    if (error) {
      toast({ title: "Error", description: "Failed to delete template", variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: "Template deleted successfully" });
      fetchData();
    }
  };

  const handleSave = async () => {
    if (!currentTemplate?.name || !currentTemplate?.subject || !currentTemplate?.body) {
      toast({ title: "Error", description: "Please fill all fields", variant: "destructive" });
      return;
    }

    const isEdit = "id" in currentTemplate && currentTemplate.id;

    if (isEdit) {
      const { error } = await supabase
        .from("email_templates")
        .update({
          name: currentTemplate.name,
          subject: currentTemplate.subject,
          body: currentTemplate.body,
          is_default: currentTemplate.is_default,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentTemplate.id);

      if (error) {
        toast({ title: "Error", description: "Failed to update template", variant: "destructive" });
        return;
      }
    } else {
      // If setting as default, unset others first
      if (currentTemplate.is_default) {
        await supabase.from("email_templates").update({ is_default: false }).eq("is_default", true);
      }

      const { error } = await supabase.from("email_templates").insert({
        name: currentTemplate.name,
        subject: currentTemplate.subject,
        body: currentTemplate.body,
        is_default: currentTemplate.is_default,
      });

      if (error) {
        toast({ title: "Error", description: "Failed to create template", variant: "destructive" });
        return;
      }
    }

    toast({ title: "Saved", description: "Template saved successfully" });
    setEditModalOpen(false);
    fetchData();
  };

  const sampleData = {
    business_name: "Sample Business",
    owner_name: "John Doe",
    city: "Brussels",
    address: "123 Main Street, Brussels",
    phone: "+32 123 456 789",
    category: "Restaurant",
    rating: "4.5",
    review_count: "150",
  };

  const getPreviewContent = (content: string) => {
    let result = content;
    for (const [key, value] of Object.entries(sampleData)) {
      result = result.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), value);
    }
    return result;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Email Templates</h1>
          <p className="mt-1 text-muted-foreground">
            Create and manage email templates for outreach
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New Template
        </Button>
      </div>

      {/* Templates Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : templates.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="mb-4 h-12 w-12 text-muted-foreground/30" />
              <p className="text-lg font-medium text-muted-foreground">No templates yet</p>
              <p className="text-sm text-muted-foreground/70">
                Create your first email template to get started
              </p>
              <Button className="mt-4" onClick={handleCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Create Template
              </Button>
            </CardContent>
          </Card>
        ) : (
          templates.map((template) => (
            <Card key={template.id} className="group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {template.name}
                      {template.is_default && (
                        <Badge variant="secondary" className="gap-1">
                          <Star className="h-3 w-3" />
                          Default
                        </Badge>
                      )}
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Subject: {template.subject}
                    </p>
                  </div>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(template)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(template.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  {template.body}
                </p>
                <p className="mt-3 text-xs text-muted-foreground/70">
                  Updated {formatRelativeTime(template.updated_at)}
                </p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Recent Sent Emails */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Recent Sent Emails
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sentEmails.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No emails sent yet
            </p>
          ) : (
            <div className="space-y-3">
              {sentEmails.map((email) => (
                <div
                  key={email.id}
                  className="flex items-center justify-between rounded-md border border-border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{email.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        To: {email.recipient_email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        email.status === "sent"
                          ? "secondary"
                          : email.status === "delivered"
                          ? "success"
                          : "destructive"
                      }
                    >
                      {email.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(email.sent_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit/Create Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {currentTemplate && "id" in currentTemplate ? "Edit Template" : "Create Template"}
            </DialogTitle>
            <DialogDescription>
              Create reusable email templates with variable placeholders
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Template Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Initial Outreach"
                  value={currentTemplate?.name || ""}
                  onChange={(e) =>
                    setCurrentTemplate((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <Label htmlFor="default">Set as default</Label>
                <Switch
                  id="default"
                  checked={currentTemplate?.is_default || false}
                  onCheckedChange={(checked) =>
                    setCurrentTemplate((prev) => ({ ...prev, is_default: checked }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject">Subject Line</Label>
              <Input
                id="subject"
                placeholder="e.g., Website development for {{business_name}}"
                value={currentTemplate?.subject || ""}
                onChange={(e) =>
                  setCurrentTemplate((prev) => ({ ...prev, subject: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="body">Email Body</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPreview(!showPreview)}
                >
                  <Eye className="mr-1 h-3 w-3" />
                  {showPreview ? "Edit" : "Preview"}
                </Button>
              </div>

              {showPreview ? (
                <div className="min-h-[200px] rounded-md border border-border bg-muted/30 p-4">
                  <p className="mb-2 text-sm font-medium">
                    Subject: {getPreviewContent(currentTemplate?.subject || "")}
                  </p>
                  <div className="whitespace-pre-wrap text-sm">
                    {getPreviewContent(currentTemplate?.body || "")}
                  </div>
                </div>
              ) : (
                <Textarea
                  id="body"
                  placeholder="Write your email template..."
                  value={currentTemplate?.body || ""}
                  onChange={(e) =>
                    setCurrentTemplate((prev) => ({ ...prev, body: e.target.value }))
                  }
                  className="min-h-[200px]"
                />
              )}

              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-muted-foreground">Variables:</span>
                {EMAIL_VARIABLES.map((v) => (
                  <Badge
                    key={v.key}
                    variant="outline"
                    className="cursor-pointer text-xs"
                    onClick={() => {
                      const variable = `{{${v.key}}}`;
                      setCurrentTemplate((prev) => ({
                        ...prev,
                        body: (prev?.body || "") + variable,
                      }));
                    }}
                  >
                    {`{{${v.key}}}`}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
