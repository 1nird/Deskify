import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Zap } from "lucide-react";
import { Button } from "@/components/ui";
import { useLiveTranscription } from "@/hooks";
import { cn } from "@/lib/utils";

type MicButtonProps = {
  onTranscript: (text: string) => void;
  onLiveTranscript?: (text: string) => void;
  onAutoSend?: (text: string) => void;
  onListeningChange?: (isListening: boolean) => void;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  autoSendButtonClassName?: string;
  showPreview?: boolean;
  previewPosition?: "top" | "bottom";
};

export const MicButton = ({
  onTranscript,
  onLiveTranscript,
  onAutoSend,
  onListeningChange,
  disabled = false,
  className,
  buttonClassName,
  autoSendButtonClassName,
  showPreview = true,
  previewPosition = "bottom",
}: MicButtonProps) => {
  const {
    isListening,
    transcript,
    start,
    stop,
    error,
    reset,
    isSupported,
  } = useLiveTranscription();

  const wasListeningRef = useRef(false);
  const [autoSend, setAutoSend] = useState(false);

  useEffect(() => {
    const wasListening = wasListeningRef.current;
    if (wasListening && !isListening) {
      const finalText = transcript.trim();
      if (!error && finalText && autoSend && onAutoSend) {
        onAutoSend(finalText);
      } else if (!error && finalText) {
        onTranscript(finalText);
      }
      reset();
    }
    wasListeningRef.current = isListening;
  }, [autoSend, error, isListening, onAutoSend, onTranscript, reset, transcript]);

  useEffect(() => {
    onListeningChange?.(isListening);
  }, [isListening, onListeningChange]);

  useEffect(() => {
    if (!isListening) return;
    if (transcript.trim()) {
      onLiveTranscript?.(transcript);
    }
  }, [isListening, onLiveTranscript, transcript]);

  const statusText = useMemo(() => {
    if (error) return error;
    if (isListening) return transcript || "Listening…";
    return "";
  }, [error, isListening, transcript]);

  const handleToggle = () => {
    if (disabled) return;
    if (isListening) {
      stop();
    } else {
      start();
    }
  };

  const micTitle = !isSupported
    ? "Speech recognition isn't supported in this environment"
    : isListening
      ? "Stop recording"
      : "Start recording";

  return (
    <div className={cn("relative flex items-center gap-1", className)}>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={handleToggle}
        disabled={disabled}
        title={micTitle}
        aria-pressed={isListening}
        className={cn(
          "h-8 w-8 transition-colors",
          isListening
            ? "text-red-400 bg-red-500/10 hover:bg-red-500/20"
            : "text-white/50 hover:text-white/80",
          buttonClassName
        )}
      >
        {isListening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
        {isListening && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
        )}
      </Button>

      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={disabled}
        title={autoSend ? "Auto-send on silence" : "Manual send"}
        onClick={() => setAutoSend((prev) => !prev)}
        className={cn(
          "h-8 w-8 text-white/50 hover:text-white/80",
          autoSend && "text-emerald-300",
          autoSendButtonClassName
        )}
      >
        <Zap className="size-3.5" />
      </Button>

      {showPreview && statusText && (
        <div
          className={cn(
            "absolute right-0 z-20 max-w-[18rem] rounded-md border border-white/10 bg-background/90 px-2 py-1 text-[10px] shadow-sm backdrop-blur",
            previewPosition === "top" ? "bottom-full mb-1" : "top-full mt-1",
            error ? "text-destructive" : "text-emerald-300"
          )}
        >
          {statusText}
        </div>
      )}
    </div>
  );
};
