import React from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import "katex/dist/katex.min.css";
import { openUrl } from "@tauri-apps/plugin-opener";

interface MarkdownRendererProps {
  children: string;
  isStreaming?: boolean;
}

export function Markdown({ children }: MarkdownRendererProps) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, trust: true }]]}
        components={{
          a: ({ children, href, ...props }: any) => {
            const handleClick = async (e: React.MouseEvent) => {
              e.preventDefault();
              if (href) {
                try {
                  await openUrl(href);
                } catch (error) {
                  console.error("Failed to open URL:", error);
                }
              }
            };
            return (
              <a
                href={href}
                className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300 cursor-pointer"
                onClick={handleClick}
                {...props}
              >
                {children}
              </a>
            );
          },
          p: ({ children, ...props }: any) => (
            <p className="mb-3 last:mb-0 leading-relaxed" {...props}>{children}</p>
          ),
          ul: ({ children, ...props }: any) => (
            <ul className="list-disc pl-5 mb-3 space-y-1.5" {...props}>{children}</ul>
          ),
          ol: ({ children, ...props }: any) => (
            <ol className="list-decimal pl-5 mb-3 space-y-1.5" {...props}>{children}</ol>
          ),
          li: ({ children, ...props }: any) => (
            <li className="leading-relaxed" {...props}>{children}</li>
          ),
          strong: ({ children, ...props }: any) => (
            <strong className="font-bold text-emerald-300 bg-emerald-500/15 px-1.5 py-0.5 rounded-md inline-block shadow-[0_0_10px_rgba(16,185,129,0.1)] border border-emerald-500/20" {...props}>{children}</strong>
          ),
          code: ({ children, className, ...props }: any) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code
                  className="bg-white/10 rounded px-1 py-0.5 text-xs font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <pre className="bg-black/40 rounded-lg p-3 overflow-x-auto mb-3">
                <code className="text-xs font-mono" {...props}>{children}</code>
              </pre>
            );
          },
          h1: ({ children, ...props }: any) => (
            <h1 className="text-base font-bold mb-2 mt-3" {...props}>{children}</h1>
          ),
          h2: ({ children, ...props }: any) => (
            <h2 className="text-sm font-bold mb-2 mt-2" {...props}>{children}</h2>
          ),
          h3: ({ children, ...props }: any) => (
            <h3 className="text-sm font-semibold mb-1 mt-2" {...props}>{children}</h3>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
      <style>{`
        .markdown-body .katex-display {
          margin: 0.6em 0 !important;
          overflow-x: auto;
          overflow-y: hidden;
        }
        .markdown-body .katex-display > .katex {
          white-space: normal;
        }
        .markdown-body .katex {
          font-size: 1.05em;
        }
      `}</style>
    </div>
  );
}
