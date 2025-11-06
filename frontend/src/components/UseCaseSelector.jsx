import React from "react";
import { ClipboardCheck, FileText, AlertCircle } from "lucide-react";
import { USE_CASES } from "../utils/constants.js";

const UseCaseSelector = ({
  selectedUseCase,
  onSelect,
  disabled = false,
  hasProcessedDocuments = false,
}) => {
  const useCases = [
    {
      value: USE_CASES.CHECKSHEET,
      label: "Checksheet",
      description:
        "Generate a structured checksheet with verification points and validation criteria from your uploaded documents.",
      icon: ClipboardCheck,
      longDescription:
        "Create a comprehensive checksheet that includes verification points, validation criteria, and step-by-step check items extracted from your documents.",
    },
    {
      value: USE_CASES.WORK_INSTRUCTIONS,
      label: "Work Instructions",
      description:
        "Generate detailed work instructions with procedures, steps, and guidelines from your uploaded documents.",
      icon: FileText,
      longDescription:
        "Generate detailed work instructions that include procedures, step-by-step instructions, safety guidelines, and operational requirements from your documents.",
    },
  ];

  const isDisabled = disabled || !hasProcessedDocuments;

  const handleSelect = (value) => {
    if (!isDisabled && onSelect) {
      onSelect(value);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Select Use Case</label>
        {!hasProcessedDocuments && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Process documents first</span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {useCases.map((useCase) => {
          const Icon = useCase.icon;
          const isSelected = selectedUseCase === useCase.value;
          const isActive = isSelected && !isDisabled;

          return (
            <button
              key={useCase.value}
              type="button"
              onClick={() => handleSelect(useCase.value)}
              disabled={isDisabled}
              className={`
                relative p-5 border-2 rounded-lg text-left transition-all duration-200
                ${
                  isActive
                    ? "border-primary bg-primary/10 ring-2 ring-primary/20 shadow-sm"
                    : isDisabled
                    ? "border-border/50 bg-muted/30"
                    : "border-border hover:border-primary/50 hover:bg-accent/50 hover:shadow-sm"
                }
                ${
                  isDisabled
                    ? "opacity-60 cursor-not-allowed"
                    : "cursor-pointer"
                }
                focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2
              `}
              aria-label={`Select ${useCase.label} use case`}
              aria-pressed={isSelected}
              aria-disabled={isDisabled}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`
                  flex-shrink-0 p-2 rounded-lg transition-colors
                  ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : isDisabled
                      ? "bg-muted text-muted-foreground"
                      : "bg-secondary text-secondary-foreground"
                  }
                `}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <h3
                      className={`
                      font-semibold text-base
                      ${isActive ? "text-primary" : "text-foreground"}
                    `}
                    >
                      {useCase.label}
                    </h3>
                    {isSelected && !isDisabled && (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                        ✓
                      </span>
                    )}
                  </div>
                  <p
                    className={`
                    text-sm leading-relaxed
                    ${
                      isDisabled
                        ? "text-muted-foreground/70"
                        : "text-muted-foreground"
                    }
                  `}
                  >
                    {useCase.description}
                  </p>
                </div>
              </div>
              {isSelected && !isDisabled && (
                <div className="absolute top-2 right-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default UseCaseSelector;
