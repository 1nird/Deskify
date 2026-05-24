import { useMemo, useRef, useState, useEffect } from "react";
import { Loader2, MessageSquareText } from "lucide-react";
import {
  Input as InputComponent,
  Button,
  MicButton,
} from "@/components";
import { UseCompletionReturn } from "@/types";
import {
  formatShortcutKeyForDisplay,
  getShortcutsConfig,
} from "@/lib/storage";
import { cn } from "@/lib/utils";
import { STORAGE_KEYS } from "@/config";

export const Input = ({
  isLoading,
  input,
  setInput,
  handleKeyPress,
  handlePaste,
  currentConversationId,
  conversationHistory,
  messageHistoryOpen,
  setMessageHistoryOpen,
  inputRef,
  submit,
  setMicOpen,
  isHidden,
}: UseCompletionReturn & {
  isHidden: boolean;
  isChatPanelExpanded: boolean;
}) => {
  const [shortcuts, setShortcuts] = useState(() => getShortcutsConfig());

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.SHORTCUTS) {
        setShortcuts(getShortcutsConfig());
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const screenAskHint = useMemo(() => {
    const binding = shortcuts.bindings["focus_input"];
    if (!binding?.enabled) return "Set shortcut in Settings";
    const label = formatShortcutKeyForDisplay(binding.key);
    return `${label} for screen`;
  }, [shortcuts]);

  const hasThread =
    Boolean(currentConversationId) && conversationHistory.length > 0;
  const baseInputRef = useRef("");

  const buildCombinedInput = (speechText: string) => {
    const base = baseInputRef.current.trim();
    return base ? `${base} ${speechText}` : speechText;
  };

  const handleTranscript = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const combined = buildCombinedInput(trimmed);
    setInput(combined);
    baseInputRef.current = combined;
    inputRef.current?.focus();
  };

  const handleLiveTranscript = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const combined = buildCombinedInput(trimmed);
    setInput(combined);
  };

  const handleAutoSend = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const combined = buildCombinedInput(trimmed);
    submit(combined);
  };

  const handleListeningChange = (listening: boolean) => {
    setMicOpen(listening);
    if (listening) {
      baseInputRef.current = input.trimEnd();
    }
  };

  return (
    <div className="relative flex-1">
      <div className="relative">
        <InputComponent
          ref={inputRef}
          placeholder={`Ask anything… (${screenAskHint})`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          onPaste={handlePaste}
          disabled={isLoading || isHidden}
          className={cn(
            "h-8 min-h-8 py-1 text-sm transition-all duration-200 hover:border-emerald-500/40",
            hasThread ? "pr-[8.25rem]" : "pr-[5.5rem]"
          )}
        />

        <div className="absolute inset-y-0 right-1 flex items-center gap-1">
          <MicButton
            onTranscript={handleTranscript}
            onLiveTranscript={handleLiveTranscript}
            onAutoSend={handleAutoSend}
            onListeningChange={handleListeningChange}
            disabled={isLoading || isHidden}
            buttonClassName="h-7 w-7"
            autoSendButtonClassName="h-7 w-7"
            showPreview={false}
          />
          {hasThread && !isLoading && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setMessageHistoryOpen(!messageHistoryOpen)}
              className={cn(
                "relative h-7 min-w-[3.5rem] shrink-0 cursor-pointer gap-1 px-2 flex items-center justify-center rounded-lg text-emerald-400 border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all duration-200",
                messageHistoryOpen && "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
              )}
              title="Toggle chat conversation"
            >
              <span className="text-[11px] font-bold tabular-nums leading-none">
                {conversationHistory.length}
              </span>
              <MessageSquareText className="h-3.5 w-3.5 shrink-0 opacity-90" />
            </Button>
          )}
          {isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>
    </div>
  );
};
