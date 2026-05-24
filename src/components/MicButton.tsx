import { useEffect, useMemo, useRef } from "react";
import { ChevronDown, Mic, MicOff } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui";
import { useLiveTranscription, TranscriptionMode } from "@/hooks";
import { cn } from "@/lib/utils";

type MicButtonProps = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  menuButtonClassName?: string;
  showPreview?: boolean;
  previewPosition?: "top" | "bottom";
};

export const MicButton = ({
  onTranscript,
  disabled = false,
  className,
  buttonClassName,
  menuButtonClassName,
  showPreview = true,
  previewPosition = "bottom",
}: MicButtonProps) => {
  const {
    isListening,
    transcript,
    start,
    stop,
    mode,
    setMode,
    error,
    reset,
    isSupported,
    systemAudioSupported,
  } = useLiveTranscription();

  const wasListeningRef = useRef(false);

  useEffect(() => {
    const wasListening = wasListeningRef.current;
    if (wasListening && !isListening) {
      const finalText = transcript.trim();
      if (!error && finalText) {
        onTranscript(finalText);
      }
      reset();
    }
    wasListeningRef.current = isListening;
  }, [error, isListening, onTranscript, reset, transcript]);

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

  const handleModeChange = (value: string) => {
    if (isListening) stop();
    setMode(value as TranscriptionMode);
    reset();
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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={disabled}
            title="Select audio source"
            className={cn(
              "h-8 w-8 text-white/50 hover:text-white/80",
              menuButtonClassName
            )}
          >
            <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuRadioGroup value={mode} onValueChange={handleModeChange}>
            <DropdownMenuRadioItem value="microphone">
              Microphone
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              System Audio (Beta)
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          {!systemAudioSupported && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                System audio needs a native loopback helper in v5.2.
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

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
