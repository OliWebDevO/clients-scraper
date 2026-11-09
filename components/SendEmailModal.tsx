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
import { Loader2, Mail, FileText, Eye, Check, AlertTriangle, XCircle, Sparkles, Ban, Search, Phone, MessageCircleReply } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Business, EmailTemplate } from "@/lib/types";
import { replaceTemplateVariables } from "@/lib/utils";
import { generateFirstContactEmail, getCity, getPlatform } from "@/lib/prospect";
import { checkEmail, htmlToText } from "@/lib/email-checks";
import {
  HTML_TEMPLATE_MARKER,
  buildHtmlEmail,
  generateDefaults,
  isFollowUpMarker,
  getFollowUpVariant,
  generateFollowUpDefaults,
  buildFollowUpHtmlEmail,
  businessToEmailData,
  type HtmlEmailOverrides,
  type FollowUpVariant,
  type FollowUpOverrides,
} from "@/lib/email-html-template";

/** Built-in short first-contact email, generated per business (not stored in email_templates) */
const FIRST_CONTACT_ID = "builtin-first-contact";
const FIRST_CONTACT_TEMPLATE: EmailTemplate = {
  id: FIRST_CONTACT_ID,
  name: "Premier contact (court, personnalisé)",
  subject: "",
  body: "",
  is_default: false,
  created_at: "",
  updated_at: "",
};

interface AiReview {
  verdict: string;
  problems: string[];
  suggestions: string[];
}

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
    useFollowUpTemplate?: boolean;
    followUpVariant?: FollowUpVariant;
    followUpOverrides?: FollowUpOverrides;
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

  // Follow-up template editable fields
  const [followUpSubtitle, setFollowUpSubtitle] = useState("");
  const [followUpBody, setFollowUpBody] = useState("");
  const [showFollowUpPreview, setShowFollowUpPreview] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Opt-out + AI proofreading
  const [doNotContact, setDoNotContact] = useState(false);
  const [replied, setReplied] = useState(false);
  const [aiReview, setAiReview] = useState<AiReview | null>(null);
  const [aiReviewError, setAiReviewError] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);

  // Recipient email: known, looked up on the website, or to be searched manually
  const [emailLookup, setEmailLookup] = useState<"idle" | "searching" | "not_found" | "no_website">("idle");

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const isHtmlTemplate = selectedTemplate?.body === HTML_TEMPLATE_MARKER;
  const isFollowUpTemplate = selectedTemplate?.body ? isFollowUpMarker(selectedTemplate.body) : false;
  const followUpVariant = selectedTemplate?.body ? getFollowUpVariant(selectedTemplate.body) : null;

  useEffect(() => {
    if (open) {
      setSelectedTemplateId("");
      supabase
        .from("email_templates")
        .select("id, name, subject, body, is_default, created_at, updated_at")
        .order("is_default", { ascending: false })
        .then(({ data }) => {
          setTemplates([FIRST_CONTACT_TEMPLATE, ...(data || [])]);
        });
      setShowHtmlPreview(false);
      setShowFollowUpPreview(false);
      setActiveTab("template");
      setRecipientEmail(business?.email || "");
      setDoNotContact(!!business?.do_not_contact);
      setReplied(!!business?.replied);
      setEmailLookup("idle");

      // Unknown email: look for it on the business' own website
      if (business && !business.email) {
        const hasRealSite = !!business.website_url && !getPlatform(business.website_url);
        if (!hasRealSite) {
          setEmailLookup("no_website");
        } else {
          setEmailLookup("searching");
          fetch("/api/businesses/find-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ businessId: business.id }),
          })
            .then((res) => res.json())
            .then((result) => {
              if (result.email) {
                setRecipientEmail((current) => current || result.email);
                setEmailLookup("idle");
              } else {
                setEmailLookup("not_found");
              }
            })
            .catch(() => setEmailLookup("not_found"));
        }
      }
      setAiReview(null);
      setAiReviewError(null);
    }
  }, [open]);

  // Select default template after templates are loaded
  useEffect(() => {
    // Default to the short first-contact email: a light, personal first touch lands
    // in the inbox far more often than the designed HTML (keep that for the follow-up)
    if (templates.length > 0 && !selectedTemplateId) {
      setSelectedTemplateId(FIRST_CONTACT_ID);
    }
  }, [templates, selectedTemplateId]);

  // Populate HTML template fields when business or template changes
  useEffect(() => {
    if (isHtmlTemplate && business) {
      const defaults = generateDefaults(businessToEmailData(business));
      setHtmlHeroHeading(defaults.heroHeading);
      setHtmlHeroSubtitle(defaults.heroSubtitle);
      setHtmlPersonalMessage(defaults.personalMessage);
    }
  }, [isHtmlTemplate, business?.id]);

  // Populate follow-up template fields when business or template changes
  useEffect(() => {
    if (isFollowUpTemplate && followUpVariant && business) {
      const defaults = generateFollowUpDefaults(
        businessToEmailData(business),
        followUpVariant
      );
      setFollowUpSubtitle(defaults.heroSubtitle);
      setFollowUpBody(draftBody || defaults.bodyContent);
    }
  }, [isFollowUpTemplate, followUpVariant, business?.id]);

  useEffect(() => {
    if (activeTab === "template" && selectedTemplateId) {
      if (selectedTemplateId === FIRST_CONTACT_ID) {
        if (business) {
          const generated = generateFirstContactEmail(businessToEmailData(business));
          setSubject(generated.subject);
          setBody(generated.body);
        }
        return;
      }
      const template = templates.find((t) => t.id === selectedTemplateId);
      if (template) {
        setSubject(template.subject);
        setBody(template.body);
      }
    }
  }, [selectedTemplateId, templates, activeTab, business?.id]);

  const getVariables = () => {
    if (!business) return {};
    return {
      business_name: business.name,
      owner_name: "",
      city: getCity(business.address) || "",
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
          businessToEmailData(business),
          currentOverrides
        ).replace(
          "</style>",
          ".service-col { width: 33.33% !important; display: table-cell !important; }\n" +
          ".stat-col { width: 33.33% !important; display: table-cell !important; }\n" +
          ".row-content { width: 100% !important; }\n" +
          "</style>"
        )
      : null;

  const followUpPreview =
    isFollowUpTemplate && followUpVariant && business
      ? buildFollowUpHtmlEmail(
          businessToEmailData(business),
          followUpVariant,
          { heroSubtitle: followUpSubtitle, bodyContent: followUpBody }
        ).replace(
          "</style>",
          ".row-content { width: 100% !important; }\n</style>"
        )
      : null;

  // What will actually be sent, as plain text — fed to the checks and the AI proofreading
  const sendingHtmlNow = isHtmlTemplate && activeTab === "template";
  const sendingFollowUpNow = isFollowUpTemplate && activeTab === "template";
  const outgoingText = sendingHtmlNow
    ? htmlToText(htmlPreview || "")
    : sendingFollowUpNow
      ? htmlToText(followUpPreview || "")
      : getProcessedContent(body);
  const checks = checkEmail({
    subject: getProcessedContent(subject),
    text: outgoingText,
    recipientEmail,
    businessName: business?.name,
  });

  const handleAiReview = async () => {
    setIsReviewing(true);
    setAiReview(null);
    setAiReviewError(null);
    try {
      const res = await fetch("/api/emails/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: getProcessedContent(subject),
          text: outgoingText,
          category: business?.category ?? null,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Relecture impossible");
      setAiReview(result);
    } catch (err) {
      setAiReviewError(err instanceof Error ? err.message : "Relecture impossible");
    } finally {
      setIsReviewing(false);
    }
  };

  const handleToggleDoNotContact = async () => {
    if (!business) return;
    const next = !doNotContact;
    setDoNotContact(next);
    try {
      const res = await fetch("/api/businesses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: business.id, do_not_contact: next }),
      });
      if (!(await res.json()).success) throw new Error();
    } catch {
      setDoNotContact(!next);
    }
  };

  const handleToggleReplied = async () => {
    if (!business) return;
    const next = !replied;
    setReplied(next);
    try {
      const res = await fetch("/api/businesses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: business.id, replied: next }),
      });
      if (!(await res.json()).success) throw new Error();
    } catch {
      setReplied(!next);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sendingHtml = isHtmlTemplate && activeTab === "template";
    const sendingFollowUp = isFollowUpTemplate && followUpVariant && activeTab === "template";

    if (sendingFollowUp) {
      onSend({
        subject: getProcessedContent(subject),
        body: selectedTemplate?.body || "",
        recipientEmail,
        useFollowUpTemplate: true,
        followUpVariant: followUpVariant,
        followUpOverrides: { heroSubtitle: followUpSubtitle, bodyContent: followUpBody },
      });
    } else {
      onSend({
        subject: getProcessedContent(subject),
        body: sendingHtml ? HTML_TEMPLATE_MARKER : getProcessedContent(body),
        recipientEmail,
        useHtmlTemplate: sendingHtml,
        htmlOverrides: sendingHtml ? currentOverrides : undefined,
      });
    }
  };

  const handleDownloadPdf = async () => {
    setIsSharing(true);
    try {
      const res = await fetch("/api/emails/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName: business?.name }),
      });
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${business?.name || "proposition"} - proposition.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      // Copy message to clipboard
      const message =
        "Bonjour,\n\n" +
        "Je suis d\u00E9veloppeur web \u00E0 Bruxelles et je me permets de vous contacter car je pense que votre entreprise pourrait b\u00E9n\u00E9ficier d'une pr\u00E9sence en ligne moderne.\n\n" +
        "Je vous ai pr\u00E9par\u00E9 une courte proposition en pi\u00E8ce jointe.\n\n" +
        "N'h\u00E9sitez pas \u00E0 me contacter si cela vous int\u00E9resse, je serais ravi d'en discuter.\n\n" +
        "Si vous voulez en savoir plus, parcourez mon site : https://olivervdb.com/\n\n" +
        "Bien cordialement,\nOliver Van Droogenbroeck";
      await navigator.clipboard.writeText(message);

      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 3000);
    } catch (err) {
      console.error("PDF error:", err);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[90vw] max-h-[90vh] overflow-y-auto">
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
          {/* When HTML preview is active, show only preview */}
          {showHtmlPreview && isHtmlTemplate ? (
            <div className="space-y-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => setShowHtmlPreview(false)}
              >
                <Eye className="h-4 w-4" />
                Masquer l&apos;aper&ccedil;u
              </Button>
              {htmlPreview && (
                <iframe
                  srcDoc={htmlPreview}
                  className="w-full rounded-md border border-border"
                  style={{ height: "70vh" }}
                  sandbox=""
                  title="Email preview"
                />
              )}
            </div>
          ) : (
            <>
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
            {emailLookup === "searching" && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                Recherche de l&apos;email sur le site&hellip;
              </p>
            )}
            {business && !recipientEmail && (emailLookup === "not_found" || emailLookup === "no_website") && (() => {
              const city = getCity(business.address) || "";
              const query = `${business.name} ${city}`.trim();
              const links = [
                { label: "Google", href: `https://www.google.com/search?q=${encodeURIComponent(`"${business.name}" ${city} email`)}` },
                { label: "Facebook", href: `https://www.facebook.com/search/top?q=${encodeURIComponent(query)}` },
                { label: "Instagram", href: `https://www.google.com/search?q=${encodeURIComponent(`site:instagram.com ${query}`)}` },
                ...(business.website_url ? [{ label: "Son site", href: business.website_url }] : []),
              ];
              return (
                <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground" aria-live="polite">
                  <p>
                    {emailLookup === "no_website"
                      ? "Pas de site web, donc pas d'email trouvable automatiquement. Cherchez-le ici :"
                      : "Aucun email trouvé sur le site. Cherchez-le ici :"}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {links.map((link) => (
                      <a
                        key={link.label}
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-foreground hover:bg-muted"
                      >
                        <Search className="h-3 w-3" aria-hidden="true" />
                        {link.label}
                      </a>
                    ))}
                    {business.phone && (
                      <a
                        href={`tel:${business.phone.replace(/[^\d+]/g, "")}`}
                        className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-foreground hover:bg-muted"
                      >
                        <Phone className="h-3 w-3" aria-hidden="true" />
                        Ou appeler : {business.phone}
                      </a>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="template" className="gap-2">
                <FileText className="h-4 w-4" />
                Template
              </TabsTrigger>
              <TabsTrigger value="custom" className="gap-2">
                <Mail className="h-4 w-4" />
                Custom
              </TabsTrigger>
            </TabsList>

            <TabsContent value="template" className="space-y-4">
              {/* Non-HTML templates: single column */}
              {!isHtmlTemplate && (
                <>
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

                  {isFollowUpTemplate && (
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
                </>
              )}

              {/* HTML Template: two-column layout */}
              {isHtmlTemplate && (
                <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left: select + sujet + titre + sous-titre */}
                  <div className="space-y-3">
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

                    <div className="space-y-2">
                      <Label htmlFor="htmlSubject">Sujet</Label>
                      <Input
                        id="htmlSubject"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        required
                      />
                    </div>

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
                  </div>

                  {/* Right: message personnel */}
                  <div className="space-y-2">
                    <Label htmlFor="htmlPersonalMessage">Message personnel</Label>
                    <Textarea
                      id="htmlPersonalMessage"
                      value={htmlPersonalMessage}
                      onChange={(e) => setHtmlPersonalMessage(e.target.value)}
                      className="min-h-[280px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      S&eacute;parez les paragraphes par une ligne vide. Utilisez **texte** pour mettre en gras.
                    </p>
                  </div>
                </div>

                {/* Preview button */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => setShowHtmlPreview(true)}
                >
                  <Eye className="h-4 w-4" />
                  Voir l&apos;aper&ccedil;u
                </Button>
                </>
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
            </>
          )}

          {/* Follow-up template editor */}
          {isFollowUpTemplate && followUpVariant && activeTab === "template" && (
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="followUpSubtitle">Sous-titre hero</Label>
                  <Input
                    id="followUpSubtitle"
                    value={followUpSubtitle}
                    onChange={(e) => setFollowUpSubtitle(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="followUpBody">Contenu de la proposition</Label>
                  <Textarea
                    id="followUpBody"
                    value={followUpBody}
                    onChange={(e) => setFollowUpBody(e.target.value)}
                    className="min-h-[300px] text-sm font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Utilisez **texte** pour mettre en gras. **TITRE EN MAJUSCULES** seul sur une ligne = titre de section violet. **Autre Titre** seul sur une ligne = sous-titre blanc. Lignes commen&ccedil;ant par &quot;- &quot; = liste &agrave; puces.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => setShowFollowUpPreview(!showFollowUpPreview)}
                >
                  <Eye className="h-4 w-4" />
                  {showFollowUpPreview ? "Masquer l'aper\u00E7u" : "Voir l'aper\u00E7u"}
                </Button>
                {showFollowUpPreview && followUpPreview && (
                  <iframe
                    srcDoc={followUpPreview}
                    className="w-full rounded-md border border-border"
                    style={{ height: "500px" }}
                    sandbox=""
                    title="Follow-up email preview"
                  />
                )}
              </div>
            </div>
          )}

          {/* Standard text editor for other templates / draft / custom */}
          {!isHtmlTemplate && !isFollowUpTemplate && activeTab === "template" && (
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

          {/* Custom tab text editor */}
          {activeTab === "custom" && (
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

          {/* Pre-send checks */}
          {doNotContact && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
              <Ban className="mt-0.5 h-4 w-4 shrink-0" />
              Ce business est marqu&eacute; &laquo; ne plus contacter &raquo;. L&apos;envoi est bloqu&eacute;.
            </div>
          )}
          {(checks.errors.length > 0 || checks.warnings.length > 0) && (
            <ul className="space-y-1 rounded-md border border-border bg-muted/30 p-3 text-sm" aria-label="V&eacute;rifications avant envoi">
              {checks.errors.map((msg) => (
                <li key={msg} className="flex items-start gap-2 text-red-400">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span><span className="sr-only">Erreur : </span>{msg}</span>
                </li>
              ))}
              {checks.warnings.map((msg) => (
                <li key={msg} className="flex items-start gap-2 text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span><span className="sr-only">Attention : </span>{msg}</span>
                </li>
              ))}
            </ul>
          )}
          {(aiReview || aiReviewError) && (
            <div className="space-y-2 rounded-md border border-violet-500/40 bg-violet-500/10 p-3 text-sm" aria-live="polite">
              {aiReviewError ? (
                <p className="text-red-400">{aiReviewError}</p>
              ) : aiReview && (
                <>
                  <p className="font-medium">Relecture IA : {aiReview.verdict}</p>
                  {aiReview.problems.length > 0 && (
                    <ul className="list-disc space-y-1 pl-5">
                      {aiReview.problems.map((p) => <li key={p}>{p}</li>)}
                    </ul>
                  )}
                  {aiReview.suggestions.length > 0 && (
                    <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                      {aiReview.suggestions.map((p) => <li key={p}>{p}</li>)}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            {business && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleToggleReplied}
                className="gap-2"
                aria-pressed={replied}
                title="Un prospect qui a répondu ne reçoit pas de relance automatique"
              >
                <MessageCircleReply className={`h-4 w-4 ${replied ? "text-green-500" : ""}`} />
                {replied ? "A répondu ✓" : "A répondu"}
              </Button>
            )}
            {business && (
              <Button type="button" variant="ghost" onClick={handleToggleDoNotContact} className="gap-2">
                <Ban className="h-4 w-4" />
                {doNotContact ? "Autoriser le contact" : "Ne plus contacter"}
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={handleAiReview}
              disabled={isReviewing || outgoingText.length < 40}
              className="gap-2"
            >
              {isReviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Relire avec l&apos;IA
            </Button>
            {isHtmlTemplate && activeTab === "template" && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleDownloadPdf}
                disabled={isSharing}
                className="gap-2"
              >
                {isSharing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : shareCopied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                {isSharing ? "G\u00E9n\u00E9ration..." : shareCopied ? "PDF + message copi\u00E9 !" : "T\u00E9l\u00E9charger PDF"}
              </Button>
            )}
            <Button
              type="submit"
              disabled={isLoading || doNotContact || checks.errors.length > 0 || !recipientEmail || !subject || (!isHtmlTemplate && !isFollowUpTemplate && !body)}
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
