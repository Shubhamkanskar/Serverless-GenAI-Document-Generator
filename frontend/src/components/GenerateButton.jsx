import React from "react";
import { Button } from "./ui/button";
import { Loader2, Sparkles, CheckCircle2, AlertCircle, X } from "lucide-react";

const GenerateButton = ({
  onGenerate,
  disabled = false,
  selectedDocuments = [],
  selectedUseCase = null,
  generating = false,
  progress = 0,
  error = null,
  generatedFile = null,
  onClearError = null,
  onReset = null,
}) => {
  const hasProcessedDocuments = selectedDocuments.some(
    (doc) => doc.status === "processed"
  );
  const documentIds = selectedDocuments
    .filter((doc) => doc.status === "processed")
    .map((doc) => doc.fileId);

  const canGenerate =
    !disabled &&
    !generating &&
    hasProcessedDocuments &&
    selectedUseCase &&
    documentIds.length > 0;

  const handleClick = () => {
    if (canGenerate && onGenerate) {
      onGenerate(selectedUseCase, documentIds);
    }
  };

  return (
    <div className="space-y-3">
      {/* Main Generate Button */}
      <Button
        onClick={handleClick}
        disabled={!canGenerate}
        size="lg"
        className="w-full h-12 text-base font-semibold shadow-lg hover:shadow-xl transition-all"
      >
        {generating ? (
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Generating Document...</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            <span>Generate Document</span>
          </div>
        )}
      </Button>

      {/* Progress Indicator */}
      {generating && progress > 0 && (
        <div className="space-y-2">
          <div className="w-full bg-secondary rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-primary h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium text-primary">{progress}%</span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 border border-destructive/50 bg-destructive/10 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive">
              Generation Failed
            </p>
            <p className="text-sm text-destructive/80 mt-1">{error}</p>
          </div>
          {onClearError && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClearError}
              className="h-6 w-6 flex-shrink-0"
              aria-label="Clear error"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}

      {/* Help Text */}
      {!canGenerate && !generating && (
        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            {!selectedUseCase && "Please select a use case"}
            {selectedUseCase &&
              !hasProcessedDocuments &&
              "Please process at least one document"}
            {selectedUseCase &&
              hasProcessedDocuments &&
              documentIds.length === 0 &&
              "No processed documents available"}
          </p>
        </div>
      )}
    </div>
  );
};

export default GenerateButton;
