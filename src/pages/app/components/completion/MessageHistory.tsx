import { useState } from "react";
import { MessageSquareText, ChevronUp, ChevronDown, Trash2, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  ScrollArea,
  Markdown,
} from "@/components";
import { ChatMessage } from "@/types/completion";

interface MessageHistoryProps {
  conversationHistory: ChatMessage[];
  currentConversationId: string | null;
  onStartNewConversation: () => void;
  onDeleteConversation: () => Promise<void>;
  messageHistoryOpen: boolean;
  setMessageHistoryOpen: (open: boolean) => void;
  /** When false, hide portaled popover (chat shell collapsed) */
  isChatPanelExpanded?: boolean;
}

export const MessageHistory = ({
  conversationHistory,
  onStartNewConversation,
  onDeleteConversation,
  messageHistoryOpen,
  setMessageHistoryOpen,
  isChatPanelExpanded = true,
}: MessageHistoryProps) => {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Popover
      open={messageHistoryOpen && isChatPanelExpanded}
      onOpenChange={setMessageHistoryOpen}
    >
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="outline"
          aria-label="View Current Conversation"
          className="relative h-7 min-w-[4.25rem] shrink-0 cursor-pointer gap-1 px-2 flex items-center justify-center rounded-lg"
        >
          <span className="text-[11px] font-semibold tabular-nums leading-none">
            {conversationHistory.length}
          </span>
          <MessageSquareText className="h-4 w-4 shrink-0 opacity-90" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        className="select-none w-screen p-0 mt-3 border overflow-hidden border-input/50"
      >
        <div className="border-b border-input/50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center flex-col">
              <h2 className="text-lg font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Current Conversation
              </h2>
              <p className="text-xs text-muted-foreground">
                {conversationHistory.length} messages in this conversation
              </p>
            </div>
            <div className="flex items-center gap-2">
              {confirmDelete ? (
                <div className="flex items-center gap-1 animate-in fade-in zoom-in duration-200">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-500/10 gap-1.5"
                    onClick={() => {
                      onDeleteConversation();
                      setConfirmDelete(false);
                      setMessageHistoryOpen(false);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-bold">Delete</span>
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:bg-white/5"
                    onClick={() => setConfirmDelete(false)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                  onClick={() => setConfirmDelete(true)}
                  title="Delete conversation"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <div className="w-px h-4 bg-border/50 mx-1" />
              <Button
                size="sm"
                onClick={() => {
                  onStartNewConversation();
                  setMessageHistoryOpen(false);
                }}
                className="text-xs h-8"
              >
                New Chat
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setMessageHistoryOpen(false)}
                className="h-8 w-8 text-muted-foreground/50 hover:text-foreground"
              >
                {messageHistoryOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <ScrollArea className="h-[calc(100vh-10rem)]">
          <div className="p-4 space-y-4">
            {conversationHistory
              .sort((a, b) => b?.timestamp - a?.timestamp)
              .map((message) => (
                <div
                  key={message.id}
                  className={`p-3 rounded-lg ${
                    message.role === "user"
                      ? "bg-primary/10 border-l-4 border-primary"
                      : "bg-muted/50"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase">
                      {message.role === "user" ? "You" : "AI"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(message.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <Markdown>{message.content}</Markdown>
                </div>
              ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
