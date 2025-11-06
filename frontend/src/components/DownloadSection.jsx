import React from "react";
import {
  Download,
  CheckCircle2,
  ExternalLink,
  File,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import { Button } from "./ui/button";

const DownloadSection = ({
  generatedFile,
  onReset,
  onDownload,
  error = null,
}) => {
  if (error) {
    return (
      <div className="p-6 border rounded-lg bg-destructive/10 border-destructive/50">
        <div className="flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-destructive mb-1">
              Generation Failed
            </h3>
            <p className="text-sm text-destructive/80 mb-4">{error}</p>
            {onReset && (
              <Button
                variant="outline"
                onClick={onReset}
                className="border-destructive/50 text-destructive hover:bg-destructive/10"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!generatedFile || !generatedFile.downloadUrl) {
    return null;
  }

  const { downloadUrl, fileName, fileSize, fileType, fileId } = generatedFile;

  const formatFileSize = (bytes) => {
    if (!bytes) return "Unknown size";
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const getFileTypeLabel = (type) => {
    if (!type) return "Unknown";
    const typeMap = {
      "application/pdf": "PDF",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        "DOCX",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        "XLSX",
      "application/msword": "DOC",
      "text/plain": "TXT",
    };
    return typeMap[type] || type.split("/").pop().toUpperCase();
  };

  const handleDownload = () => {
    if (onDownload) {
      onDownload();
    } else {
      // Fallback: trigger download
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = fileName || "generated-document";
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handlePreview = () => {
    // For Excel and DOCX files, use Office Online Viewer
    // For PDF files, open directly
    const fileExtension = fileName?.split(".").pop()?.toLowerCase();

    if (fileExtension === "xlsx" || fileExtension === "xls") {
      // Excel preview using Office Online Viewer
      const officeViewerUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(
        downloadUrl
      )}`;
      window.open(officeViewerUrl, "_blank", "noopener,noreferrer");
    } else if (fileExtension === "docx" || fileExtension === "doc") {
      // Word preview using Office Online Viewer
      const officeViewerUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(
        downloadUrl
      )}`;
      window.open(officeViewerUrl, "_blank", "noopener,noreferrer");
    } else if (fileExtension === "pdf") {
      // PDF can open directly
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    } else {
      // Fallback: try to open directly
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="p-6 border rounded-lg bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          {/* Success Message */}
          <h3 className="font-semibold text-lg text-green-900 dark:text-green-100 mb-3">
            Document Generated Successfully!
          </h3>

          {/* File Information */}
          <div className="bg-white dark:bg-gray-900/50 rounded-lg p-4 mb-4 border border-green-200 dark:border-green-800">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 p-2 bg-primary/10 rounded-lg">
                <File className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="space-y-2">
                  {/* File Name */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">
                      File Name
                    </p>
                    <p className="text-sm font-semibold text-foreground truncate">
                      {fileName || "Generated Document"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={handleDownload}
              className="bg-green-600 hover:bg-green-700 text-white flex-1 sm:flex-none"
              size="lg"
            >
              <Download className="w-4 h-4 mr-2" />
              Download File
            </Button>
            <Button
              variant="outline"
              onClick={handlePreview}
              className="border-green-300 text-green-700 hover:bg-green-100 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-900 flex-1 sm:flex-none"
              size="lg"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Preview
            </Button>
            {onReset && (
              <Button
                variant="outline"
                onClick={onReset}
                className="border-border text-foreground hover:bg-accent flex-1 sm:flex-none"
                size="lg"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Generate Another
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DownloadSection;
