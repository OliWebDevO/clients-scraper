"use client";

import { useEffect, useState, useRef } from "react";
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
import type { EmailTemplate, SentEmail, UserDocument, JobDraft } from "@/lib/types";
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
  Upload,
  File,
  X,
  Download,
  Building2,
  Briefcase,
} from "lucide-react";

export default function EmailsPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([]);
  const [documents, setDocuments] = useState<(UserDocument & { url?: string | null })[]>([]);
  const [drafts, setDrafts] = useState<(JobDraft & { job_title?: string; job_company?: string; download_url?: string | null; cv_url?: string | null; cv_filename?: string | null; cv_file_size?: number | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<Partial<EmailTemplate> | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [uploadingType, setUploadingType] = useState<string | null>(null);

  const cvInputRef = useRef<HTMLInputElement>(null);
  const coverLetterInputRef = useRef<HTMLInputElement>(null);
  const proposalInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();

  const fetchDocuments = async () => {
    try {
      const res = await fetch("/api/documents");
      const result = await res.json();
      if (result.data) setDocuments(result.data);
    } catch {
      // Documents table may not exist yet
    }
  };

  const fetchDrafts = async () => {
    try {
      const { data: draftsData } = await supabase
        .from("job_drafts")
        .select("*")
        .eq("status", "completed")
        .order("created_at", { ascending: false });

      if (!draftsData || draftsData.length === 0) {
        setDrafts([]);
        return;
      }

      // Get job details for each draft
      const jobIds = draftsData.map((d: JobDraft) => d.job_id);
      const { data: jobsData } = await supabase
        .from("jobs")
        .select("id, title, company")
        .in("id", jobIds);

      const jobMap = new Map<string, { title: string; company: string | null }>();
      jobsData?.forEach((j: { id: string; title: string; company: string | null }) => {
        jobMap.set(j.id, { title: j.title, company: j.company });
      });

      // Get the user's CV for display alongside drafts
      const { data: cvDocData } = await supabase
        .from("user_documents")
        .select("*")
        .eq("type", "cv")
        .single();

      let cvUrl: string | null = null;
      let cvFilename: string | null = null;
      let cvFileSize: number | null = null;
      if (cvDocData?.storage_path) {
        const { data: cvSignedData } = await supabase.storage
          .from("documents")
          .createSignedUrl(cvDocData.storage_path, 3600);
        cvUrl = cvSignedData?.signedUrl || null;
        cvFilename = cvDocData.filename;
        cvFileSize = cvDocData.file_size;
      }

      // Get download URLs for each draft
      const enrichedDrafts = await Promise.all(
        draftsData.map(async (draft: JobDraft) => {
          const job = jobMap.get(draft.job_id);
          let downloadUrl: string | null = null;
          if (draft.storage_path) {
            const { data: signedData } = await supabase.storage
              .from("documents")
              .createSignedUrl(draft.storage_path, 3600);
            downloadUrl = signedData?.signedUrl || null;
          }
          return {
            ...draft,
            job_title: job?.title || "Unknown",
            job_company: job?.company || "Unknown",
            download_url: downloadUrl,
            cv_url: cvUrl,
            cv_filename: cvFilename,
            cv_file_size: cvFileSize,
          };
        })
      );

      setDrafts(enrichedDrafts);
    } catch {
      // job_drafts table may not exist yet
    }
  };

  const fetchData = async () => {
    setLoading(true);
    const [templatesRes, emailsRes] = await Promise.all([
      supabase.from("email_templates").select("*").order("is_default", { ascending: false }),
      supabase.from("sent_emails").select("*").order("sent_at", { ascending: false }).limit(20),
    ]);

    setTemplates(templatesRes.data || []);
    setSentEmails(emailsRes.data || []);
    await Promise.all([fetchDocuments(), fetchDrafts()]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpload = async (file: File, type: "cv" | "cover_letter" | "proposal_template") => {
    setUploadingType(type);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);

      const res = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) throw new Error(result.error || "Upload failed");

      toast({
        title: "Document uploaded",
        description: `${file.name} uploaded successfully`,
        variant: "success",
      });
      await fetchDocuments();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Upload failed",
        variant: "destructive",
      });
    } finally {
      setUploadingType(null);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    try {
      const res = await fetch("/api/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) throw new Error("Delete failed");

      toast({ title: "Document deleted" });
      await fetchDocuments();
    } catch {
      toast({ title: "Error", description: "Failed to delete document", variant: "destructive" });
    }
  };

  const cvDoc = documents.find((d) => d.type === "cv");
  const coverLetterDoc = documents.find((d) => d.type === "cover_letter");
  const proposalDoc = documents.find((d) => d.type === "proposal_template");

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

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

      {/* My Documents */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <File className="h-5 w-5" />
            My Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* CV Upload */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">CV / Resume</h3>
                <Badge variant="outline" className="text-xs">PDF</Badge>
              </div>

              {cvDoc ? (
                <div className="flex items-center gap-3 rounded-md bg-muted/50 p-3">
                  <FileText className="h-8 w-8 text-red-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cvDoc.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(cvDoc.file_size)} &middot; {formatRelativeTime(cvDoc.updated_at)}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {cvDoc.url && (
                      <a href={cvDoc.url} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon" title="View">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteDocument(cvDoc.id)}
                      title="Delete"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-6 text-center">
                  <FileText className="mb-2 h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No CV uploaded</p>
                </div>
              )}

              <input
                ref={cvInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file, "cv");
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full cursor-pointer"
                onClick={() => cvInputRef.current?.click()}
                disabled={uploadingType === "cv"}
              >
                <Upload className="mr-2 h-4 w-4" />
                {uploadingType === "cv" ? "Uploading..." : cvDoc ? "Replace CV" : "Upload CV"}
              </Button>
            </div>

            {/* Cover Letter Upload */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Cover Letter</h3>
                <Badge variant="outline" className="text-xs">PDF, DOCX, ODT</Badge>
              </div>

              {coverLetterDoc ? (
                <div className="flex items-center gap-3 rounded-md bg-muted/50 p-3">
                  <FileText className="h-8 w-8 text-blue-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{coverLetterDoc.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(coverLetterDoc.file_size)} &middot; {formatRelativeTime(coverLetterDoc.updated_at)}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {coverLetterDoc.url && (
                      <a href={coverLetterDoc.url} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon" title="View">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteDocument(coverLetterDoc.id)}
                      title="Delete"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-6 text-center">
                  <FileText className="mb-2 h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No cover letter uploaded</p>
                </div>
              )}

              <input
                ref={coverLetterInputRef}
                type="file"
                accept=".pdf,.docx,.odt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file, "cover_letter");
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full cursor-pointer"
                onClick={() => coverLetterInputRef.current?.click()}
                disabled={uploadingType === "cover_letter"}
              >
                <Upload className="mr-2 h-4 w-4" />
                {uploadingType === "cover_letter" ? "Uploading..." : coverLetterDoc ? "Replace Cover Letter" : "Upload Cover Letter"}
              </Button>
            </div>

            {/* Proposal Template Upload */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Client Proposal</h3>
                <Badge variant="outline" className="text-xs">PDF, DOCX, TXT</Badge>
              </div>

              {proposalDoc ? (
                <div className="flex items-center gap-3 rounded-md bg-muted/50 p-3">
                  <Mail className="h-8 w-8 text-green-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{proposalDoc.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(proposalDoc.file_size)} &middot; {formatRelativeTime(proposalDoc.updated_at)}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {proposalDoc.url && (
                      <a href={proposalDoc.url} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="icon" title="View">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteDocument(proposalDoc.id)}
                      title="Delete"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-6 text-center">
                  <Mail className="mb-2 h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No proposal uploaded</p>
                </div>
              )}

              <input
                ref={proposalInputRef}
                type="file"
                accept=".pdf,.docx,.odt,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,text/plain"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file, "proposal_template");
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full cursor-pointer"
                onClick={() => proposalInputRef.current?.click()}
                disabled={uploadingType === "proposal_template"}
              >
                <Upload className="mr-2 h-4 w-4" />
                {uploadingType === "proposal_template" ? "Uploading..." : proposalDoc ? "Replace Proposal" : "Upload Proposal"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Drafted Jobs */}
      {drafts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Drafted Jobs
              <Badge variant="secondary" className="ml-2">{drafts.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  className="rounded-lg border border-border p-4 space-y-3"
                >
                  {/* Job info */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium truncate">{draft.job_title}</h3>
                      <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{draft.job_company}</span>
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-xs text-green-500 border-green-500/30">
                      Generated
                    </Badge>
                  </div>

                  {/* Documents grid: CV + Cover Letter */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {/* CV */}
                    <div className="flex items-center gap-3 rounded-md bg-muted/50 p-3">
                      <FileText className="h-7 w-7 text-red-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-muted-foreground">CV</p>
                        <p className="text-sm font-medium truncate">{draft.cv_filename || "CV.pdf"}</p>
                        {draft.cv_file_size && (
                          <p className="text-xs text-muted-foreground">
                            {(draft.cv_file_size / 1024).toFixed(1)} KB
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {draft.cv_url && (
                          <>
                            <a href={draft.cv_url} target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="icon" title="View CV">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </a>
                            <a href={draft.cv_url} download={draft.cv_filename || "CV.pdf"}>
                              <Button variant="ghost" size="icon" title="Download CV">
                                <Download className="h-4 w-4" />
                              </Button>
                            </a>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Cover Letter */}
                    <div className="flex items-center gap-3 rounded-md bg-muted/50 p-3">
                      <FileText className="h-7 w-7 text-blue-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-muted-foreground">Lettre de motivation</p>
                        <p className="text-sm font-medium truncate">{draft.filename}</p>
                        {draft.file_size && (
                          <p className="text-xs text-muted-foreground">
                            {(draft.file_size / 1024).toFixed(1)} KB
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {draft.download_url && (
                          <a href={draft.download_url} download={draft.filename}>
                            <Button variant="ghost" size="icon" title="Download Cover Letter">
                              <Download className="h-4 w-4" />
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Re-generate hint */}
                  <p className="text-xs text-muted-foreground">
                    Pour re-generer, cliquez sur le bouton Draft du job dans l&apos;onglet <a href="/jobs" className="underline hover:text-foreground transition-colors">Jobs</a>.
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
