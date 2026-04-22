// src/features/analytics/components/SetupGuideCard.tsx
// Collapsible card showing setup instructions for a dashboard template

import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, BookOpen } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "@/components/common/theme-provider";
import { cn } from "@/lib/utils";
import type { SetupGuide } from "@/features/analytics/dashboardTemplates/types";

interface SetupGuideCardProps {
  guide: SetupGuide;
  className?: string;
}

function isLightTheme(theme: string): boolean {
  return theme === "light" || theme === "catppuccin-latte" || theme === "rose-pine-dawn";
}

export function SetupGuideCard({ guide, className }: SetupGuideCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { theme } = useTheme();
  const syntaxTheme = isLightTheme(theme) ? oneLight : oneDark;

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-muted/30",
        className
      )}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{guide.title}</span>
        </div>
        <div className="flex items-center gap-2">
          {guide.docsUrl && (
            <a
              href={guide.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              Docs <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border p-4">
          <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-code:text-xs prose-code:before:content-none prose-code:after:content-none prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const codeString = String(children).replace(/\n$/, "");

                  if (match) {
                    return (
                      <SyntaxHighlighter
                        style={syntaxTheme}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                          margin: "0.75rem 0",
                          borderRadius: "0.375rem",
                          fontSize: "0.75rem",
                        }}
                      >
                        {codeString}
                      </SyntaxHighlighter>
                    );
                  }

                  return (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {guide.content}
            </Markdown>
          </div>
        </div>
      )}
    </div>
  );
}

export default SetupGuideCard;
