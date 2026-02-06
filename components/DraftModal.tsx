"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle, Download, FileText } from "lucide-react";
import type { DraftProgressUpdate } from "@/lib/types";

interface DraftModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isGenerating: boolean;
  progress: DraftProgressUpdate | null;
  error: string | null;
  downloadUrl: string | null;
  downloadFilename: string | null;
}

export function DraftModal({
  open,
  onOpenChange,
  isGenerating,
  progress,
  error,
  downloadUrl,
  downloadFilename,
}: DraftModalProps) {
  const isDone = !isGenerating && !error && downloadUrl;
  const isError = !isGenerating && error;

  return (
    <Dialog open={open} onOpenChange={isGenerating ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Draft Cover Letter
          </DialogTitle>
        </DialogHeader>

        {/* Generating state */}
        {isGenerating && progress && (
          <div className="py-6 space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{progress.message}</span>
                <span className="font-medium">{Math.round(progress.progress)}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
            </div>
            <div className="text-center space-y-2">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-xs text-muted-foreground">
                Ne fermez pas cette fenêtre.
              </p>
            </div>
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="py-6 space-y-4">
            <div className="flex flex-col items-center text-center space-y-3">
              <AlertCircle className="h-12 w-12 text-red-500" />
              <div>
                <p className="font-medium text-red-500">Erreur</p>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
              </div>
            </div>
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fermer
              </Button>
            </div>
          </div>
        )}

        {/* Success state */}
        {isDone && (
          <div className="py-6 space-y-4">
            <div className="flex flex-col items-center text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <div>
                <p className="font-medium text-green-500">Lettre générée !</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {downloadFilename}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Retrouvez vos documents dans l&apos;onglet Email.
                </p>
              </div>
            </div>
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fermer
              </Button>
              <a href={downloadUrl} download={downloadFilename}>
                <Button>
                  <Download className="mr-2 h-4 w-4" />
                  Télécharger (.docx)
                </Button>
              </a>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
