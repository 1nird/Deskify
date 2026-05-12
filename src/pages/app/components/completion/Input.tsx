import { useMemo, useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  Input as InputComponent,
} from "@/components";
import { UseCompletionReturn } from "@/types";
import { MessageHistory } from "./MessageHistory";
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
  startNewConversation,
  messageHistoryOpen,
  setMessageHistoryOpen,
  inputRef,
  isHidden,
  isChatPanelExpanded,
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
            hasThread ? "pr-[4.75rem]" : "pr-9"
          )}
        />

        {hasThread && !isLoading && (
          <div className="absolute inset-y-0 right-1 flex items-center">
            <MessageHistory
              conversationHistory={conversationHistory}
              currentConversationId={currentConversationId}
              onStartNewConversation={startNewConversation}
              messageHistoryOpen={messageHistoryOpen}
              setMessageHistoryOpen={setMessageHistoryOpen}
              isChatPanelExpanded={isChatPanelExpanded}
            />
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-y-0 right-2 flex items-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
};
