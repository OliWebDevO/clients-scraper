"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Mail, FileText, Eye, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Business, EmailTemplate } from "@/lib/types";
import { replaceTemplateVariables, extractCity } from "@/lib/utils";

interface SendEmailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  business: Business | null;
  onSend: (data: { subject: string; body: string; recipientEmail: string }) => void;
  isLoading: boolean;
  draftBody?: string | null;
  draftSubject?: string | null;
}

export function SendEmailModal({
  open,
  onOpenChange,
  business,
  onSend,
  isLoading,
  draftBody,
  draftSubject,
}: SendEmailModalProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [activeTab, setActiveTab] = useState("template");
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    async function fetchTemplates() {
      const { data } = await supabase
        .from("email_templates")
        .select("id, name, subject, body, is_default, created_at, updated_at")
        .order("is_default", { ascending: false });
      if (data) {
        setTemplates(data);
        const defaultTemplate = data.find((t) => t.is_default);
        if (defaultTemplate) {
          setSelectedTemplateId(defaultTemplate.id);
        }
      }
    }
    if (open) {
      fetchTemplates();
      // Auto-select draft tab if draft content is available
      if (draftBody) {
        setActiveTab("draft");
        setSubject(draftSubject || `Proposition — ${business?.name || ""}`);
        setBody(draftBody);
      } else {
        setActiveTab("template");
      }
    }
  }, [open]);

  useEffect(() => {
    if (activeTab === "template" && selectedTemplateId) {
      const template = templates.find((t) => t.id === selectedTemplateId);
      if (template) {
        setSubject(template.subject);
        setBody(template.body);
      }
    } else if (activeTab === "draft" && draftBody) {
      setSubject(draftSubject || `Proposition — ${business?.name || ""}`);
      setBody(draftBody);
    }
  }, [selectedTemplateId, templates, activeTab]);

  const getVariables = () => {
    if (!business) return {};
    return {
      business_name: business.name,
      owner_name: "",
      city: extractCity(business.address) || "",
      address: business.address || "",
      phone: business.phone || "",
      category: business.category || "",
      rating: business.rating?.toString() || "",
      review_count: business.review_count?.toString() || "",
    };
  };

  const getProcessedContent = (content: string) => {
    return replaceTemplateVariables(content, getVariables());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSend({
      subject: getProcessedContent(subject),
      body: getProcessedContent(body),
      recipientEmail,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Send Email
          </DialogTitle>
          <DialogDescription>
            {business
              ? `Send an email to ${business.name}`
              : "Configure your email"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recipientEmail">Recipient Email</Label>
            <Input
              id="recipientEmail"
              type="email"
              placeholder="email@example.com"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              required
            />
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className={`grid w-full ${draftBody ? "grid-cols-3" : "grid-cols-2"}`}>
              {draftBody && (
                <TabsTrigger value="draft" className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  Brouillon
                </TabsTrigger>
              )}
              <TabsTrigger value="template" className="gap-2">
                <FileText className="h-4 w-4" />
                Template
              </TabsTrigger>
              <TabsTrigger value="custom" className="gap-2">
                <Mail className="h-4 w-4" />
                Custom
              </TabsTrigger>
            </TabsList>

            {draftBody && (
              <TabsContent value="draft" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="draftSubject">Sujet</Label>
                  <Input
                    id="draftSubject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                  />
                </div>
              </TabsContent>
            )}

            <TabsContent value="template" className="space-y-4">
              <div className="space-y-2">
                <Label>Select Template</Label>
                <Select
                  value={selectedTemplateId}
                  onValueChange={setSelectedTemplateId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                        {template.is_default && " (Default)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="custom" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  placeholder="Email subject..."
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="body">Message</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 text-xs"
                onClick={() => setShowPreview(!showPreview)}
              >
                <Eye className="h-3 w-3" />
                {showPreview ? "Edit" : "Preview"}
              </Button>
            </div>
            {showPreview ? (
              <div className="min-h-[200px] rounded-md border border-border bg-muted/30 p-4">
                <p className="mb-2 font-medium">
                  Subject: {getProcessedContent(subject)}
                </p>
                <div className="whitespace-pre-wrap text-sm">
                  {getProcessedContent(body)}
                </div>
              </div>
            ) : (
              <Textarea
                id="body"
                placeholder="Write your message... Use {{business_name}}, {{city}}, etc. for variables"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-[200px]"
                required
              />
            )}
            <p className="text-xs text-muted-foreground">
              Available variables: {"{{business_name}}"}, {"{{city}}"},{" "}
              {"{{address}}"}, {"{{phone}}"}, {"{{category}}"}, {"{{rating}}"}
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !recipientEmail || !subject || !body}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Email"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
