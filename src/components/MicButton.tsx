import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Mic, MicOff, Zap } from "lucide-react";
import { Button } from "@/components/ui";
import { useLiveTranscription } from "@/hooks";
import { cn } from "@/lib/utils";
import { getMicSilenceTimeout } from "@/lib/storage";
import { useMicVAD } from "@ricky0123/vad-react";

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
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTranscriptRef = useRef("");
  const vadActiveRef = useRef(false);

  // VAD: voice activity detection for accurate speech start/end
  const vad = useMicVAD({
    startOnLoad: false,
    onSpeechStart: () => {
      // User started speaking — cancel any pending silence timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    },
    onSpeechEnd: () => {
      // VAD detected speech ended. If auto-send is on, start silence countdown.
      // During this countdown, if speech resumes, timer is cancelled.
      if (autoSend && isListening && transcript.trim()) {
        const timeoutMs = getMicSilenceTimeout();
        silenceTimerRef.current = setTimeout(() => {
          stop();
        }, timeoutMs);
      }
    },
    onVADMisfire: () => {
      // Brief false positive — clear any pending auto-send timer as a safety net
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    },
  });

  // Track VAD state (must run before fallback timer to avoid race condition)
  useEffect(() => {
    vadActiveRef.current = !vad.errored && !vad.loading && vad.listening;
  }, [vad.errored, vad.loading, vad.listening]);

  // Fallback silence timer (used when VAD fails to load):
  // auto-stop & send when transcript stops changing for the configured timeout
  useEffect(() => {
    if (!isListening || !autoSend || !transcript.trim()) return;
    // Only use fallback timer if VAD is not active
    if (vadActiveRef.current) return;

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }

    if (transcript !== lastTranscriptRef.current) {
      lastTranscriptRef.current = transcript;
      const timeoutMs = getMicSilenceTimeout();
      silenceTimerRef.current = setTimeout(() => {
        stop();
      }, timeoutMs);
    }

    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, [isListening, autoSend, transcript, stop]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const wasListening = wasListeningRef.current;
    if (wasListening && !isListening) {
      const finalText = transcript.trim();
      // Clear any pending silence timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (!error && finalText && autoSend && onAutoSend) {
        onAutoSend(finalText);
      } else if (!error && finalText) {
        onTranscript(finalText);
      }
      reset();
      lastTranscriptRef.current = "";
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

  const handleToggle = useCallback(() => {
    if (disabled) return;
    if (isListening) {
      // Clear any pending silence/auto-send timer when manually stopping
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      stop();
      // Pause VAD
      try { vad.pause(); } catch { /* VAD may not be started */ }
    } else {
      lastTranscriptRef.current = "";
      start();
      // Start VAD (ignores error if VAD fails — falls back to timer)
      try { vad.start(); } catch { /* gracefully fall back to manual timer */ }
    }
  }, [disabled, isListening, stop, start, vad]);

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
          <span
            className={cn(
              "absolute top-1 right-1 h-2 w-2 rounded-full animate-pulse",
              vad.userSpeaking ? "bg-emerald-400" : "bg-red-500"
            )}
          />
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
