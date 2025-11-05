import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload,
  File,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Button } from "./ui/button";
import { MAX_FILE_SIZE } from "../utils/constants.js";
import { useDocumentStore } from "../stores/useDocumentStore";
import DocumentList from "./DocumentList.jsx";

const FileUpload = ({ disabled = false }) => {
  // Use Zustand store instead of hook
  const documents = useDocumentStore((state) => state.documents);
  const uploading = useDocumentStore((state) => state.uploading);
  const ingesting = useDocumentStore((state) => state.ingesting);
  const error = useDocumentStore((state) => state.error);
  const uploadFile = useDocumentStore((state) => state.uploadFile);
  const ingestFile = useDocumentStore((state) => state.ingestFile);
  const removeDocument = useDocumentStore((state) => state.removeDocument);
  const clearError = useDocumentStore((state) => state.clearError);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);

  const handleFileUpload = useCallback(
    async (file) => {
      try {
        setUploadError(null);
        setUploadProgress(0);

        // Upload file
        const uploadedDoc = await uploadFile(file);
        setUploadProgress(100);

        // Note: Auto-ingest is now optional
        // User can manually process documents using the "Process" button
        // This gives better control and visibility

        // Clear progress after a delay
        setTimeout(() => setUploadProgress(0), 1000);
      } catch (err) {
        setUploadError(err.message || "Failed to upload file");
        setUploadProgress(0);
        console.error("Upload error:", err);
      }
    },
    [uploadFile]
  );

  const onDrop = useCallback(
    (acceptedFiles, rejectedFiles) => {
      // Handle rejected files
      if (rejectedFiles.length > 0) {
        const rejection = rejectedFiles[0];
        if (rejection.errors.some((e) => e.code === "file-invalid-type")) {
          setUploadError("Only PDF files are allowed");
        } else if (rejection.errors.some((e) => e.code === "file-too-large")) {
          setUploadError(
            `File size must be less than ${MAX_FILE_SIZE / (1024 * 1024)}MB`
          );
        } else {
          setUploadError("File rejected. Please check file type and size.");
        }
        return;
      }

      // Handle accepted files
      if (acceptedFiles.length > 0) {
        handleFileUpload(acceptedFiles[0]);
      }
    },
    [handleFileUpload]
  );

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject,
    fileRejections,
  } = useDropzone({
    onDrop,
    disabled: disabled || uploading || ingesting,
    accept: {
      "application/pdf": [".pdf"],
    },
    maxSize: MAX_FILE_SIZE,
    multiple: false,
  });

  const handleRemove = useCallback(
    (fileId) => {
      removeDocument(fileId);
      setUploadError(null);
    },
    [removeDocument]
  );

  const handleProcess = useCallback(
    async (fileId, s3Key) => {
      try {
        setUploadError(null);
        await ingestFile(fileId, s3Key);
      } catch (err) {
        setUploadError(err.message || "Failed to process document");
        console.error("Process error:", err);
      }
    },
    [ingestFile]
  );

  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-colors duration-200
          ${isDragActive && !isDragReject ? "border-primary bg-primary/5" : ""}
          ${
            isDragReject
              ? "border-destructive bg-destructive/5"
              : "border-border"
          }
          ${
            disabled || uploading || ingesting
              ? "opacity-50 cursor-not-allowed"
              : "hover:border-primary/50"
          }
        `}
        role="button"
        tabIndex={0}
        aria-label="File upload drop zone"
      >
        <input {...getInputProps()} aria-label="File input" />
        <div className="flex flex-col items-center gap-4">
          {uploading || ingesting ? (
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
          ) : isDragActive ? (
            <Upload className="w-12 h-12 text-primary" />
          ) : (
            <File className="w-12 h-12 text-muted-foreground" />
          )}
          <div>
            {uploading || ingesting ? (
              <div className="space-y-2">
                <p className="text-primary font-medium">
                  {uploading ? "Uploading..." : "Processing document..."}
                </p>
                {uploadProgress > 0 && (
                  <div className="w-64 mx-auto">
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {uploadProgress}%
                    </p>
                  </div>
                )}
              </div>
            ) : isDragActive ? (
              <p className="text-primary font-medium">
                Drop the PDF file here...
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-2">
                  Drag and drop a PDF file here, or click to select
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || uploading || ingesting}
                >
                  Select PDF File
                </Button>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            PDF files only (Max {MAX_FILE_SIZE / (1024 * 1024)}MB)
          </p>
          {(isDragReject || fileRejections.length > 0) && (
            <p className="text-sm text-destructive mt-2 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              Only PDF files are allowed
            </p>
          )}
        </div>
      </div>

      {/* Error Messages */}
      {(error || uploadError) && (
        <div className="p-4 border border-destructive/50 bg-destructive/10 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">Upload Error</p>
            <p className="text-sm text-destructive/80 mt-1">
              {error || uploadError}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              clearError();
              setUploadError(null);
            }}
            className="h-6 w-6"
            aria-label="Clear error"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Uploaded Files List */}
      {documents.length > 0 && (
        <div className="space-y-2">
          <DocumentList
            documents={documents}
            onRemove={handleRemove}
            onProcess={handleProcess}
            loading={ingesting}
            processingIds={documents
              .filter((d) => d.status === "processing")
              .map((d) => d.fileId)}
          />
        </div>
      )}

      {/* Success Message */}
      {documents.length > 0 &&
        !uploading &&
        !ingesting &&
        !error &&
        !uploadError && (
          <div className="p-3 border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            <p className="text-sm text-green-700 dark:text-green-300">
              {documents.length} document(s) uploaded successfully
            </p>
          </div>
        )}
    </div>
  );
};

export default FileUpload;
