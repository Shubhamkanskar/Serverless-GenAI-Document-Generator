import React from 'react';
import { Info, FileText, CheckCircle2 } from 'lucide-react';

const DocumentCountInfo = ({ processedCount, totalCount }) => {
  const recommendedCount = 2;
  const hasEnough = processedCount >= 1;
  const hasRecommended = processedCount >= recommendedCount;

  return (
    <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
      <div className="flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
            Document Requirements
          </p>
          <div className="space-y-1.5 text-xs text-blue-800 dark:text-blue-200">
            <div className="flex items-center gap-2">
              {hasEnough ? (
                <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              <span>
                <span className="font-medium">Minimum:</span> 1 PDF (works but may have limited content)
              </span>
            </div>
            <div className="flex items-center gap-2">
              {hasRecommended ? (
                <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              <span>
                <span className="font-medium">Recommended:</span> 2-3 PDFs for better AI analysis and more comprehensive output
              </span>
            </div>
          </div>
          <div className="pt-2 border-t border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              <span className="font-medium">Current Status:</span> {processedCount} processed, {totalCount} total uploaded
              {!hasRecommended && processedCount > 0 && (
                <span className="ml-2 text-blue-600 dark:text-blue-400">
                  (You can upload more PDFs for better results)
                </span>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentCountInfo;

