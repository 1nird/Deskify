import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type TranscriptionMode = "microphone" | "system";

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = {
  error: string;
  message?: string;
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

const getSpeechRecognitionConstructor = (): SpeechRecognitionConstructor | null => {
  if (typeof window === "undefined") return null;
  const win = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
};

const errorMessageForSpeech = (error: string) => {
  switch (error) {
    case "no-speech":
      return "No speech was detected. Try again.";
    case "audio-capture":
      return "No microphone was found or it is unavailable.";
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked. Allow access to continue.";
    case "network":
      return "Speech recognition failed due to a network error.";
    case "aborted":
      return "Speech recognition was stopped.";
    default:
      return `Speech recognition error: ${error}`;
  }
};

export const useLiveTranscription = (initialMode: TranscriptionMode = "microphone") => {
  const [mode, setMode] = useState<TranscriptionMode>(initialMode);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalTranscriptRef = useRef("");

  const recognitionConstructor = useMemo(
    () => getSpeechRecognitionConstructor(),
    []
  );

  const isSupported = Boolean(recognitionConstructor);
  const systemAudioSupported = false;

  const buildRecognition = useCallback(() => {
    if (!recognitionConstructor) return null;
    const recognition = new recognitionConstructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onresult = (event) => {
      let interim = "";
      let finalText = finalTranscriptRef.current;

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result?.[0]?.transcript ?? "";
        if (result.isFinal) {
          finalText = `${finalText} ${text}`.trim();
        } else {
          interim = `${interim} ${text}`.trim();
        }
      }

      finalTranscriptRef.current = finalText;
      const combined = [finalText, interim].filter(Boolean).join(" ").trim();
      setTranscript(combined);
    };

    recognition.onerror = (event) => {
      setError(errorMessageForSpeech(event.error));
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    return recognition;
  }, [recognitionConstructor]);

  const start = useCallback(() => {
    if (isListening) return;
    if (mode === "system") {
      setError(
        "System audio capture requires a native loopback helper. Use Microphone for now."
      );
      return;
    }
    if (!recognitionConstructor) {
      setError("Speech recognition is not supported in this environment.");
      return;
    }

    const recognition = recognitionRef.current || buildRecognition();
    if (!recognition) {
      setError("Speech recognition could not be initialized.");
      return;
    }

    recognitionRef.current = recognition;
    setError(null);
    setTranscript("");
    finalTranscriptRef.current = "";

    try {
      recognition.start();
      setIsListening(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to start speech recognition."
      );
      setIsListening(false);
    }
  }, [buildRecognition, isListening, mode, recognitionConstructor]);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to stop speech recognition."
      );
      setIsListening(false);
    }
  }, []);

  const reset = useCallback(() => {
    setTranscript("");
    finalTranscriptRef.current = "";
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  return {
    mode,
    setMode,
    isListening,
    transcript,
    error,
    start,
    stop,
    reset,
    isSupported,
    systemAudioSupported,
  };
};
