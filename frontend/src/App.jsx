import React, { useMemo } from "react";
import { useDocumentStore } from "./stores/useDocumentStore";
import { useGenerationStore } from "./stores/useGenerationStore";
import { useAppStore } from "./stores/useAppStore";
import FileUpload from "./components/FileUpload";
import DocumentList from "./components/DocumentList";
import UseCaseSelector from "./components/UseCaseSelector";
import PromptSelector from "./components/PromptSelector";
import GenerateButton from "./components/GenerateButton";
import DownloadSection from "./components/DownloadSection";
import ErrorBoundary from "./components/ErrorBoundary";
import PromptBook from "./components/PromptBook";
import DocumentCountInfo from "./components/DocumentCountInfo";
import ActivePromptInfo from "./components/ActivePromptInfo";
import { Button } from "./components/ui/button";
import { AlertCircle, BookOpen } from "lucide-react";

const App = () => {
  // Document store - using Zustand selectors for optimal re-renders
  const documents = useDocumentStore((state) => state.documents);
  const uploading = useDocumentStore((state) => state.uploading);
  const ingesting = useDocumentStore((state) => state.ingesting);
  const documentsError = useDocumentStore((state) => state.error);
  const uploadFile = useDocumentStore((state) => state.uploadFile);
  const ingestFile = useDocumentStore((state) => state.ingestFile);
  const removeDocument = useDocumentStore((state) => state.removeDocument);
  const clearDocumentsError = useDocumentStore((state) => state.clearError);

  // Generation store
  const generating = useGenerationStore((state) => state.generating);
  const generatedFile = useGenerationStore((state) => state.generatedFile);
  const generationError = useGenerationStore((state) => state.error);
  const progress = useGenerationStore((state) => state.progress);
  const generate = useGenerationStore((state) => state.generate);
  const resetGeneration = useGenerationStore((state) => state.reset);
  const clearGenerationError = useGenerationStore((state) => state.clearError);

  // App store
  const selectedUseCase = useAppStore((state) => state.selectedUseCase);
  const selectedPromptId = useAppStore((state) => state.selectedPromptId);
  const selectedLLM = useAppStore((state) => state.selectedLLM); // Always 'gemini' now
  const showPromptBook = useAppStore((state) => state.showPromptBook);
  const setSelectedUseCase = useAppStore((state) => state.setSelectedUseCase);
  const setSelectedPromptId = useAppStore((state) => state.setSelectedPromptId);
  const setShowPromptBook = useAppStore((state) => state.setShowPromptBook);

  // Computed values
  const processedDocuments = useMemo(
    () => documents.filter((doc) => doc.status === "processed"),
    [documents]
  );

  const hasProcessedDocuments = processedDocuments.length > 0;

  // Debug logging
  React.useEffect(() => {
    console.log('App render - documents:', documents);
    console.log('App render - documents.length:', documents.length);
    console.log('App render - processedDocuments:', processedDocuments);
    console.log('App render - hasProcessedDocuments:', hasProcessedDocuments);
  }, [documents, processedDocuments, hasProcessedDocuments]);

  // Handlers
  const handleProcessDocument = async (fileId, s3Key) => {
    try {
      await ingestFile(fileId, s3Key);
    } catch (err) {
      console.error("Error processing document:", err);
    }
  };

  const handleGenerate = async (useCase, documentIds) => {
    try {
      await generate(useCase, documentIds, selectedLLM, selectedPromptId);
    } catch (err) {
      console.error("Error generating document:", err);
    }
  };

  const handleReset = () => {
    resetGeneration();
    useAppStore.getState().reset();
  };

  const handleClearErrors = () => {
    clearDocumentsError();
    clearGenerationError();
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
        <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10 shadow-sm">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
                  <span className="text-primary-foreground font-bold text-lg">
                    AI
                  </span>
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-foreground bg-clip-text">
                    GenAI Document Generator
                  </h1>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPromptBook(true)}
                className="flex items-center gap-2"
              >
                <BookOpen className="w-4 h-4" />
                <span className="hidden sm:inline">Prompt Book</span>
              </Button>
            </div>
            <p className="text-muted-foreground text-sm sm:text-base ml-[52px]">
              Upload documents, process them, and generate new documents using
              AI
            </p>
          </div>
        </header>

        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="max-w-4xl mx-auto space-y-8 sm:space-y-12">
            {/* Error Display */}
            {(documentsError || generationError) && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-destructive mb-1">
                    Error
                  </p>
                  <p className="text-sm text-destructive/80">
                    {documentsError || generationError}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearErrors}
                  className="text-destructive hover:text-destructive"
                >
                  Dismiss
                </Button>
              </div>
            )}

            {/* Step 1: Upload Documents */}
            <section className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
                  <span className="text-primary font-semibold text-sm">1</span>
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-1">
                    Upload Documents
                  </h2>
                  <p className="text-sm sm:text-base text-muted-foreground">
                    Upload PDF files to process and generate documents
                  </p>
                </div>
              </div>
              <div className="ml-11">
                <FileUpload />
              </div>
            </section>

            {/* Step 2: Document List & Processing */}
            {documents && documents.length > 0 && (
              <section className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center">
                    <span className="text-blue-600 dark:text-blue-400 font-semibold text-sm">
                      2
                    </span>
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-1">
                      Process Documents
                    </h2>
                    <p className="text-sm sm:text-base text-muted-foreground">
                      Click "Process" on each document to extract text and
                      prepare for AI generation
                    </p>
                  </div>
                </div>
                <div className="ml-11">
                  <DocumentList
                    documents={documents}
                    onRemove={removeDocument}
                    onProcess={handleProcessDocument}
                    loading={ingesting}
                    processingIds={documents
                      .filter((d) => d.status === "processing")
                      .map((d) => d.fileId)}
                  />
                  {/* Info Box - Before Processing */}
                  {!hasProcessedDocuments &&
                    documents.some((d) => d.status === "uploaded") && (
                      <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <p className="text-sm text-amber-900 dark:text-amber-100">
                          <span className="font-semibold">⚠ Next Step:</span>{" "}
                          Click the{" "}
                          <span className="font-medium bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded">
                            "Process Document"
                          </span>{" "}
                          button above to extract text and prepare documents for
                          AI generation.
                        </p>
                      </div>
                    )}
                  {/* Document Count Info */}
                  <DocumentCountInfo
                    processedCount={processedDocuments.length}
                    totalCount={documents.length}
                  />

                  {/* Info Box - After Processing */}
                  {hasProcessedDocuments && (
                    <div className="mt-4 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <p className="text-sm text-green-900 dark:text-green-100">
                        <span className="font-semibold">
                          ✓ Documents processed successfully!
                        </span>{" "}
                        The "Select Use Case" section should now be visible
                        below. Choose checksheet or work instructions to
                        generate your document.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Step 3: Select Use Case */}
            {hasProcessedDocuments && (
              <section className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200 border-l-4 border-purple-500 pl-4 bg-purple-50/30 dark:bg-purple-950/10 p-4 rounded-r-lg">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 dark:bg-purple-500/30 flex items-center justify-center ring-2 ring-purple-500/30">
                    <span className="text-purple-600 dark:text-purple-400 font-semibold text-sm">
                      3
                    </span>
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-1">
                      Select Use Case
                    </h2>
                    <p className="text-sm sm:text-base text-muted-foreground">
                      Choose the type of document you want to generate:
                      <span className="font-medium">
                        {" "}
                        Checksheet (Excel)
                      </span>{" "}
                      or{" "}
                      <span className="font-medium">
                        Work Instructions (Word)
                      </span>
                    </p>
                  </div>
                </div>
                <div className="ml-11 space-y-4">
                  <UseCaseSelector
                    selectedUseCase={selectedUseCase}
                    onSelect={setSelectedUseCase}
                    hasProcessedDocuments={hasProcessedDocuments}
                  />
                  
                  {/* Prompt Selector - Shows after use case is selected */}
                  {selectedUseCase && (
                    <PromptSelector
                      useCase={selectedUseCase}
                      selectedPromptId={selectedPromptId}
                      onSelectPrompt={setSelectedPromptId}
                    />
                  )}

                  {/* Active Prompt Info */}
                  {selectedUseCase && selectedPromptId && (
                    <ActivePromptInfo useCase={selectedUseCase} />
                  )}
                  
                  {/* Info about what happens next */}
                  {selectedUseCase && selectedPromptId && (
                    <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                      <p className="text-sm text-purple-900 dark:text-purple-100">
                        <span className="font-semibold">
                          Ready to generate:
                        </span>{" "}
                        {selectedUseCase === "checksheet"
                          ? "Checksheet will generate an Excel file with inspection points"
                          : "Work Instructions will generate a Word document with step-by-step procedures"}
                        . Click "Generate Document" below to create your file.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}


            {/* Step 4: Generate Document */}
            {hasProcessedDocuments && selectedUseCase && selectedPromptId && (
              <section className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500/10 dark:bg-green-500/20 flex items-center justify-center">
                    <span className="text-green-600 dark:text-green-400 font-semibold text-sm">
                      4
                    </span>
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-1">
                      Generate Document
                    </h2>
                    <p className="text-sm sm:text-base text-muted-foreground">
                      AI will analyze your processed documents and generate{" "}
                      {selectedUseCase === "checksheet"
                        ? "an Excel checksheet with inspection points"
                        : "a Word document with step-by-step work instructions"}
                      . This may take 30-60 seconds.
                    </p>
                  </div>
                </div>
                <div className="ml-11">
                  <GenerateButton
                    onGenerate={handleGenerate}
                    selectedDocuments={documents}
                    selectedUseCase={selectedUseCase}
                    generating={generating}
                    progress={progress}
                    error={generationError}
                    generatedFile={generatedFile}
                    onClearError={clearGenerationError}
                    onReset={handleReset}
                  />
                  {/* What happens during generation */}
                  {!generating && !generatedFile && (
                    <div className="mt-4 p-4 bg-muted/50 border rounded-lg">
                      <p className="text-xs text-muted-foreground mb-2 font-medium">
                        What happens when you generate:
                      </p>
                      <ol className="text-xs text-muted-foreground space-y-1 ml-4 list-decimal">
                        <li>
                          AI queries your processed documents for relevant
                          content
                        </li>
                        <li>AI extracts and structures the information</li>
                        <li>
                          Document is created (
                          {selectedUseCase === "checksheet" ? "Excel" : "Word"}{" "}
                          format)
                        </li>
                        <li>File is saved and ready for download</li>
                      </ol>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Step 5: Download Generated Document */}
            {generatedFile && (
              <section className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-400">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center">
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
                      5
                    </span>
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-1">
                      Download Generated Document
                    </h2>
                    <p className="text-sm sm:text-base text-muted-foreground">
                      Your document has been generated successfully. Preview or
                      download it below.
                    </p>
                  </div>
                </div>
                <div className="ml-11">
                  <DownloadSection
                    generatedFile={generatedFile}
                    onReset={handleReset}
                  />
                </div>
              </section>
            )}
          </div>
        </main>

        {/* Prompt Book Modal */}
        {showPromptBook && (
          <PromptBook onClose={() => setShowPromptBook(false)} />
        )}
      </div>
    </ErrorBoundary>
  );
};

export default App;
