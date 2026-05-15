import { useRef, useEffect } from "react";
import { Loader2, MonitorIcon, XIcon } from "lucide-react";
import { ScrollArea, Button, Markdown, CopyButton } from "@/components";
import { UseCompletionReturn } from "@/types";
import { cn } from "@/lib/utils";

export const ResponsePanel = ({
  isLoading,
  input,
  conversationHistory,
  startNewConversation,
  error,
  response,
  cancel,
  scrollAreaRef,
  screenshotSent,
}: UseCompletionReturn) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationHistory.length, response]);

  const sortedHistory = [...conversationHistory].sort(
    (a, b) => a.timestamp - b.timestamp
  );

  return (
    <div className="w-full border border-emerald-500/20 rounded-2xl bg-black/30 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10 bg-black/40">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white/70 tracking-wide">Conversation</span>
          {screenshotSent && (
            <div className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
              <MonitorIcon className="size-2.5" />
              <span>Screen captured</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <CopyButton content={response} />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => { isLoading ? cancel() : startNewConversation(); }}
            className="cursor-pointer h-6 w-6"
            title={isLoading ? "Cancel" : "New conversation"}
          >
            <XIcon className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Scrollable messages */}
      <ScrollArea ref={scrollAreaRef} className="h-[420px]">
        <div className="p-3 space-y-2.5">
          {error && (
            <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Conversation history */}
          {sortedHistory.map((message) => (
            <div
              key={message.id}
              className={cn(
                "rounded-lg text-sm px-3 py-2",
                message.role === "user"
                  ? "bg-emerald-500/10 border-l-2 border-emerald-500"
                  : "bg-white/5"
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-wider",
                  message.role === "user" ? "text-emerald-400" : "text-white/40"
                )}>
                  {message.role === "user" ? "You" : "AI"}
                </span>
                <span className="text-[10px] text-white/25">
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <Markdown>{message.content}</Markdown>
            </div>
          ))}

          {/* Live: current user question (only while loading) */}
          {isLoading && (
            <div className="bg-emerald-500/10 border-l-2 border-emerald-500 rounded-lg px-3 py-2 text-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">You</span>
                <span className="text-[10px] text-white/25">Now</span>
              </div>
              <p className="text-white/80 text-sm">{input.trim() || "…"}</p>
            </div>
          )}

          {/* Live: AI streaming response */}
          {isLoading && (
            <div className="bg-white/5 rounded-lg px-3 py-2 text-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">AI</span>
                <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />
              </div>
              <Markdown isStreaming={true}>{response || "…"}</Markdown>
            </div>
          )}

          <div ref={bottomRef} className="h-1" />
        </div>
      </ScrollArea>
    </div>
  );
};
