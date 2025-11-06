import React from "react";
import {
  File,
  X,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Play,
  Trash2,
  Sparkles,
} from "lucide-react";
import { Button } from "./ui/button";

const DocumentList = ({
  documents,
  onRemove,
  onProcess,
  loading = false,
  processingIds = [],
  showOnlyProcessed = false, // New prop to filter to only processed documents
}) => {
  // Remove duplicates by fileId (keep the most recent one)
  const uniqueDocuments = React.useMemo(() => {
    const seen = new Map();
    const reversed = [...documents].reverse(); // Process from newest to oldest
    reversed.forEach((doc) => {
      if (!seen.has(doc.fileId)) {
        seen.set(doc.fileId, doc);
      }
    });
    return Array.from(seen.values()).reverse(); // Reverse back to original order
  }, [documents]);

  // Filter to show only processed documents if requested
  const filteredDocuments = React.useMemo(() => {
    if (showOnlyProcessed) {
      return uniqueDocuments.filter((doc) => doc.status === "processed");
    }
    return uniqueDocuments;
  }, [uniqueDocuments, showOnlyProcessed]);

  if (filteredDocuments.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <File className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>
          {showOnlyProcessed
            ? "No processed documents yet"
            : "No documents uploaded yet"}
        </p>
      </div>
    );
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const formatTime = (seconds) => {
    if (!seconds || seconds <= 0) return "";
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getStatusBadge = (doc) => {
    const isProcessing =
      processingIds.includes(doc.fileId) || doc.status === "processing";

    // If currently processing, show processing badge with progress
    if (isProcessing) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Processing {doc.progress > 0 && `(${doc.progress}%)`}
        </span>
      );
    }

    switch (doc.status) {
      case "processed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Processed
          </span>
        );
      case "processing":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Processing
          </span>
        );
      case "error":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800">
            <AlertCircle className="w-3.5 h-3.5" />
            Error
          </span>
        );
      case "uploaded":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400 border border-gray-200 dark:border-gray-800">
            <File className="w-3.5 h-3.5" />
            Uploaded
          </span>
        );
    }
  };

  return (
    <div className="space-y-2">
      {filteredDocuments.map((doc) => {
        const isProcessing =
          processingIds.includes(doc.fileId) || doc.status === "processing";
        // Show process button if document is uploaded and has s3Key OR s3Key path
        const hasS3Key =
          doc.s3Key || doc.s3_key || (doc.s3Bucket && doc.fileId);
        const canProcess =
          doc.status === "uploaded" && !isProcessing && onProcess && hasS3Key;

        return (
          <div
            key={doc.fileId}
            className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <File className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium truncate">
                    {doc.originalFileName || doc.fileName}
                  </p>
                  {getStatusBadge(doc)}
                </div>

                {/* Progress bar for processing documents */}
                {isProcessing && doc.progress !== undefined && (
                  <div className="mb-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span className="font-medium">
                        {doc.message || doc.currentStep}
                      </span>
                      {doc.estimatedTimeRemaining !== undefined && (
                        <span className="text-primary font-medium">
                          ETA: {formatTime(doc.estimatedTimeRemaining)}
                        </span>
                      )}
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-500 ease-out"
                        style={{
                          width: `${Math.min(doc.progress || 0, 100)}%`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                      <span>
                        {doc.chunksProcessed || 0} / {doc.totalChunks || "?"}{" "}
                        chunks
                      </span>
                      {doc.elapsedTime !== undefined && (
                        <span>Elapsed: {formatTime(doc.elapsedTime)}</span>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{formatFileSize(doc.fileSize)}</span>
                  <span>•</span>
                  <span>{formatDate(doc.uploadedAt)}</span>
                  {doc.error && (
                    <>
                      <span>•</span>
                      <span className="text-destructive text-xs">
                        {doc.error}
                      </span>
                    </>
                  )}
                  {doc.status === "processed" && doc.chunksProcessed && <></>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              {canProcess && (
                <Button
                  variant="default"
                  size="default"
                  onClick={() =>
                    onProcess(
                      doc.fileId,
                      doc.s3Key ||
                        doc.s3_key ||
                        doc.s3key ||
                        `${doc.s3Bucket}/documents/${doc.fileId}/${doc.fileName}`
                    )
                  }
                  disabled={isProcessing || loading}
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-md hover:shadow-lg transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Process Document</span>
                </Button>
              )}
              {isProcessing && (
                <div className="flex items-center gap-2 text-sm text-primary">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="hidden sm:inline">Processing...</span>
                </div>
              )}
              {doc.status === "processed" && !isProcessing && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Ready</span>
                </div>
              )}
              {onRemove && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemove(doc.fileId)}
                  disabled={isProcessing}
                  className="h-8 w-8"
                  aria-label={`Delete ${doc.originalFileName || doc.fileName}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DocumentList;
