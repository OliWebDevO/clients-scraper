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
import {
  HTML_TEMPLATE_MARKER,
  buildHtmlEmail,
  generateDefaults,
  type HtmlEmailOverrides,
} from "@/lib/email-html-template";

interface SendEmailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  business: Business | null;
  onSend: (data: {
    subject: string;
    body: string;
    recipientEmail: string;
    useHtmlTemplate?: boolean;
    htmlOverrides?: HtmlEmailOverrides;
  }) => void;
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

  // HTML template editable fields
  const [htmlHeroHeading, setHtmlHeroHeading] = useState("");
  const [htmlHeroSubtitle, setHtmlHeroSubtitle] = useState("");
  const [htmlPersonalMessage, setHtmlPersonalMessage] = useState("");
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const isHtmlTemplate = selectedTemplate?.body === HTML_TEMPLATE_MARKER;

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
      setShowHtmlPreview(false);
      if (draftBody) {
        setActiveTab("draft");
        setSubject(draftSubject || `Proposition — ${business?.name || ""}`);
        setBody(draftBody);
      } else {
        setActiveTab("template");
      }
    }
  }, [open]);

  // Populate HTML template fields when business or template changes
  useEffect(() => {
    if (isHtmlTemplate && business) {
      const defaults = generateDefaults({
        businessName: business.name,
        rating: business.rating,
        reviewCount: business.review_count,
        category: business.category,
        address: business.address,
        hasWebsite: business.has_website,
      });
      setHtmlHeroHeading(defaults.heroHeading);
      setHtmlHeroSubtitle(defaults.heroSubtitle);
      setHtmlPersonalMessage(defaults.personalMessage);
    }
  }, [isHtmlTemplate, business?.id]);

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

  const currentOverrides: HtmlEmailOverrides = {
    heroHeading: htmlHeroHeading,
    heroSubtitle: htmlHeroSubtitle,
    personalMessage: htmlPersonalMessage,
  };

  const htmlPreview =
    isHtmlTemplate && business
      ? buildHtmlEmail(
          {
            businessName: business.name,
            rating: business.rating,
            reviewCount: business.review_count,
            category: business.category,
            address: business.address,
            hasWebsite: business.has_website,
          },
          currentOverrides
        ).replace(
          "</style>",
          ".service-col { width: 33.33% !important; display: table-cell !important; }\n" +
          ".stat-col { width: 33.33% !important; display: table-cell !important; }\n" +
          ".row-content { width: 100% !important; }\n" +
          "</style>"
        )
      : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sendingHtml = isHtmlTemplate && activeTab === "template";
    onSend({
      subject: sendingHtml ? getProcessedContent(subject) : getProcessedContent(subject),
      body: sendingHtml ? HTML_TEMPLATE_MARKER : getProcessedContent(body),
      recipientEmail,
      useHtmlTemplate: sendingHtml,
      htmlOverrides: sendingHtml ? currentOverrides : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
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

              {isHtmlTemplate && (
                <div className="space-y-2">
                  <Label htmlFor="htmlSubject">Sujet</Label>
                  <Input
                    id="htmlSubject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                  />
                </div>
              )}
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

          {/* HTML Template: editable fields + preview */}
          {isHtmlTemplate && activeTab === "template" ? (
            <div className="space-y-4">
              {/* Editable fields */}
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="htmlHeroHeading">Titre principal</Label>
                  <Input
                    id="htmlHeroHeading"
                    value={htmlHeroHeading}
                    onChange={(e) => setHtmlHeroHeading(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="htmlHeroSubtitle">Sous-titre (intro)</Label>
                  <Textarea
                    id="htmlHeroSubtitle"
                    value={htmlHeroSubtitle}
                    onChange={(e) => setHtmlHeroSubtitle(e.target.value)}
                    className="min-h-[60px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Utilisez **texte** pour mettre en gras
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="htmlPersonalMessage">Message personnel</Label>
                  <Textarea
                    id="htmlPersonalMessage"
                    value={htmlPersonalMessage}
                    onChange={(e) => setHtmlPersonalMessage(e.target.value)}
                    className="min-h-[160px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    S&eacute;parez les paragraphes par une ligne vide. Utilisez **texte** pour mettre en gras.
                  </p>
                </div>
              </div>

              {/* Preview toggle */}
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => setShowHtmlPreview(!showHtmlPreview)}
                >
                  <Eye className="h-4 w-4" />
                  {showHtmlPreview ? "Masquer l'aper\u00E7u" : "Voir l'aper\u00E7u"}
                </Button>
                {showHtmlPreview && htmlPreview && (
                  <iframe
                    srcDoc={htmlPreview}
                    className="w-full rounded-md border border-border"
                    style={{ height: "500px" }}
                    sandbox=""
                    title="Email preview"
                  />
                )}
              </div>
            </div>
          ) : (
            /* Standard text editor for other templates / draft / custom */
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
          )}

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
              disabled={isLoading || !recipientEmail || !subject || (!isHtmlTemplate && !body)}
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
