import { useState, useCallback, useRef, useEffect } from "react";
import { useWindowResize } from "./useWindow";
import { useGlobalShortcuts } from "@/hooks";
import { useSelectedModel } from "@/components";
import {
  CREDITS_PER_MESSAGE,
  ENABLE_CREDIT_SYSTEM,
  MAX_FILES,
  STORAGE_KEYS,
} from "@/config";
import { useApp, useAuth } from "@/contexts";
import {
  fetchAIResponse,
  saveConversation,
  getConversationById,
  generateConversationTitle,
  shouldUseDeskifyAPI,
  MESSAGE_ID_OFFSET,
  deleteConversation,
  generateConversationId,
  generateMessageId,
  generateRequestId,
  getResponseSettings,
  safeLocalStorage,
  getActiveSystemPrompt,
} from "@/lib";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Types for completion
interface AttachedFile {
  id: string;
  name: string;
  type: string;
  base64: string;
  size: number;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  attachedFiles?: AttachedFile[];
}

interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface CompletionState {
  input: string;
  response: string;
  isLoading: boolean;
  error: string | null;
  attachedFiles: AttachedFile[];
  currentConversationId: string | null;
  conversationHistory: ChatMessage[];
  screenshotSent: boolean;
}

export const useCompletion = (isChatPanelExpanded: boolean = true) => {
  const {
    selectedAIProvider,
    allAiProviders,
    screenshotConfiguration,
    setScreenshotConfiguration,
    credits,
    setCredits,
  } = useApp();
  const { } = useAuth();
  const globalShortcuts = useGlobalShortcuts();
  const selectedModel = useSelectedModel();

  const [state, setState] = useState<CompletionState>({
    input: "",
    response: "",
    isLoading: false,
    error: null,
    attachedFiles: [],
    currentConversationId: null,
    conversationHistory: [],
    screenshotSent: false,
  });
  const [micOpen, setMicOpen] = useState(false);
  const [enableVAD, setEnableVAD] = useState(false);
  const [messageHistoryOpen, setMessageHistoryOpen] = useState(false);
  const [isFilesPopoverOpen, setIsFilesPopoverOpen] = useState(false);
  const [isScreenshotLoading, setIsScreenshotLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isProcessingScreenshotRef = useRef(false);
  const screenshotConfigRef = useRef(screenshotConfiguration);
  const hasCheckedPermissionRef = useRef(false);
  const screenshotInitiatedByThisContext = useRef(false);

  const { resizeWindow } = useWindowResize();

  const onScreenshotsEnabledChange = useCallback(
    (enabled: boolean) => {
      setScreenshotConfiguration((prev) => {
        const next = { ...prev, enabled };
        safeLocalStorage.setItem(
          STORAGE_KEYS.SCREENSHOT_CONFIG,
          JSON.stringify(next)
        );
        return next;
      });
    },
    [setScreenshotConfiguration]
  );

  useEffect(() => {
    screenshotConfigRef.current = screenshotConfiguration;
  }, [screenshotConfiguration]);

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const currentRequestIdRef = useRef<string | null>(null);

  const setInput = useCallback((value: string) => {
    setState((prev) => ({ ...prev, input: value }));
  }, []);

  const handleClearChat = useCallback(() => {
    setState((prev) => ({
      ...prev,
      input: "",
      response: "",
      error: null,
      attachedFiles: [],
      currentConversationId: null,
      conversationHistory: [],
    }));
  }, []);

  const handleDeleteCurrentConversation = useCallback(async () => {
    if (!state.currentConversationId) return;
    try {
      await deleteConversation(state.currentConversationId);
      handleClearChat();
      // Emit event so other windows (like dashboard) refresh
      window.dispatchEvent(
        new CustomEvent("conversationDeleted", {
          detail: state.currentConversationId,
        })
      );
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      setState((prev) => ({ ...prev, error: "Failed to delete conversation" }));
    }
  }, [state.currentConversationId, handleClearChat]);

  const handleScrollChatUp = useCallback(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollBy({ top: -100, behavior: "smooth" });
    }
  }, []);

  const handleScrollChatDown = useCallback(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollBy({ top: 100, behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    globalShortcuts.registerCustomShortcutCallback("clear_chat", handleClearChat);
    globalShortcuts.registerCustomShortcutCallback("scroll_chat_up", handleScrollChatUp);
    globalShortcuts.registerCustomShortcutCallback("scroll_chat_down", handleScrollChatDown);

    return () => {
      globalShortcuts.unregisterCustomShortcutCallback("clear_chat");
      globalShortcuts.unregisterCustomShortcutCallback("scroll_chat_up");
      globalShortcuts.unregisterCustomShortcutCallback("scroll_chat_down");
    };
  }, [globalShortcuts, handleClearChat, handleScrollChatUp, handleScrollChatDown]);

  const setResponse = useCallback((value: string) => {
    setState((prev) => ({ ...prev, response: value }));
  }, []);

  const addFile = useCallback(async (file: File) => {
    try {
      const base64 = await fileToBase64(file);
      const attachedFile: AttachedFile = {
        id: Date.now().toString(),
        name: file.name,
        type: file.type,
        base64,
        size: file.size,
      };

      setState((prev) => ({
        ...prev,
        attachedFiles: [...prev.attachedFiles, attachedFile],
      }));
    } catch (error) {
      console.error("Failed to process file:", error);
    }
  }, []);

  const removeFile = useCallback((fileId: string) => {
    setState((prev) => ({
      ...prev,
      attachedFiles: prev.attachedFiles.filter((f) => f.id !== fileId),
    }));
  }, []);

  const clearFiles = useCallback(() => {
    setState((prev) => ({ ...prev, attachedFiles: [] }));
  }, []);

  const submit = useCallback(
    async (speechText?: string) => {
      let input = speechText || state.input;

      if (!input.trim()) {
        input = "Analyze the screen and provide immediate assistance as my Deskify copilot. Focus on being maximally useful and providing clear, actionable next steps based on what is visible.";
      }

      if (speechText) {
        setState((prev) => ({
          ...prev,
          input: speechText,
        }));
      }

      const debitCredits =
        ENABLE_CREDIT_SYSTEM;
      if (debitCredits && credits < CREDITS_PER_MESSAGE) {
        setState((prev) => ({
          ...prev,
          error:
            "You're out of credits for this session. They refresh every 24 hours.",
        }));
        return;
      }

      // Generate unique request ID
      const requestId = generateRequestId();
      currentRequestIdRef.current = requestId;

      // Cancel any existing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      try {
        // Prepare message history for the AI
        const messageHistory = state.conversationHistory.map((msg) => {
          if (msg.role === "user" && msg.attachedFiles && msg.attachedFiles.length > 0) {
            const contentParts: any[] = [{ type: "text", text: msg.content }];
            for (const file of msg.attachedFiles) {
              if (file.type.startsWith("image/")) {
                contentParts.push({
                  type: "image_url",
                  image_url: { url: `data:image/png;base64,${file.base64}` },
                });
              }
            }
            return { role: msg.role, content: contentParts as any };
          }
          return {
            role: msg.role,
            content: msg.content,
          };
        });

        // Build enhanced system prompt with model information
        const baseSystemPrompt = getActiveSystemPrompt();
        let enhancedSystemPrompt = baseSystemPrompt;
        
        enhancedSystemPrompt += `\n\n[CRITICAL SYSTEM OVERRIDE: IDENTITY INSTRUCTION]
You are Deskify, a lightning-fast, privacy-first AI desktop assistant.
You provide access to a collection of different AI models.
When asked who you are, what model you are, or who created you, you must ONLY reply that you are Deskify, an AI assistant providing a collection of AI models.
Do not claim to be Gemini, ChatGPT, Claude, or any specific model.
Answer naturally, be helpful, and pay close attention to the chat history.`;
        
        // Check if a premium model is selected
        const isPremiumModel = selectedModel.id !== "gemini-3-flash";
        if (isPremiumModel) {
          enhancedSystemPrompt += `Take your time to reason through problems thoroughly and provide the most accurate, well-thought-out responses. Use extended thinking and reasoning steps where beneficial. Provide deep analysis and comprehensive solutions.`;
        }

        // Handle image attachments
        const imagesBase64: string[] = [];
        if (state.attachedFiles.length > 0) {
          state.attachedFiles.forEach((file) => {
            if (file.type.startsWith("image/")) {
              imagesBase64.push(file.base64);
            }
          });
        }

        // Auto-capture screenshot when enabled (and not manual-only flow)
        let screenshotSent = false;
        const config = screenshotConfigRef.current;
        if (
          config.enabled &&
          config.mode !== "manual" &&
          imagesBase64.length === 0
        ) {
          try {
            const base64 = (await invoke("capture_to_base64")) as string;
            
            if (base64) {
              imagesBase64.push(base64);
              screenshotSent = true;
            }
          } catch (e) {
            console.error("Auto-capture failed:", e);
          }
        }

        let fullResponse = "";

        const useDeskifyAPI = await shouldUseDeskifyAPI();
        // Check if AI provider is configured
        if (!selectedAIProvider.provider && !useDeskifyAPI) {
          setState((prev) => ({
            ...prev,
            error: "Please select an AI provider in settings",
          }));
          return;
        }

        const provider = allAiProviders.find(
          (p) => p.id === selectedAIProvider.provider
        );
        if (!provider && !useDeskifyAPI) {
          setState((prev) => ({
            ...prev,
            error: "Invalid provider selected",
          }));
          return;
        }

        // Clear previous response and set loading state
        setState((prev) => ({
          ...prev,
          isLoading: true,
          error: null,
          response: "",
          screenshotSent,
        }));

        try {
          // Use the fetchAIResponse function with signal
          for await (const chunk of fetchAIResponse({
            provider: useDeskifyAPI ? undefined : provider,
            selectedProvider: selectedAIProvider,
            allAiProviders,
            systemPrompt: enhancedSystemPrompt || undefined,
            history: messageHistory,
            userMessage: input,
            imagesBase64,
            signal,
          })) {
            // Only update if this is still the current request
            if (currentRequestIdRef.current !== requestId) {
              return; // Request was superseded, stop processing
            }

            // Check if request was aborted
            if (signal.aborted) {
              return; // Request was cancelled, stop processing
            }

            fullResponse += chunk;
            setState((prev) => ({
              ...prev,
              response: prev.response + chunk,
            }));
          }
        } catch (e: any) {
          // Only show error if this is still the current request and not aborted
          if (currentRequestIdRef.current === requestId && !signal.aborted) {
            setState((prev) => ({
              ...prev,
              isLoading: false,
              error: e.message || "An error occurred",
            }));
          }
          return;
        }

        // Only proceed if this is still the current request
        if (currentRequestIdRef.current !== requestId || signal.aborted) {
          return;
        }

        setState((prev) => ({ ...prev, isLoading: false }));

        // Focus input after AI response is complete
        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);

        // Save the conversation after successful completion
        if (fullResponse) {
          // Re-construct attached files to include any auto-captured screenshot
          const allAttachedFiles = [...state.attachedFiles];
          if (screenshotSent && imagesBase64.length > 0) {
            allAttachedFiles.push({
              id: Date.now().toString(),
              name: `screenshot_${Date.now()}.png`,
              type: "image/png",
              base64: imagesBase64[imagesBase64.length - 1],
              size: imagesBase64[imagesBase64.length - 1].length,
            });
          }

          await saveCurrentConversation(
            input,
            fullResponse,
            allAttachedFiles
          );
          if (debitCredits) {
            setCredits(Math.max(0, credits - CREDITS_PER_MESSAGE));
          }
          // Clear input and attached files after saving
          setState((prev) => ({
            ...prev,
            input: "",
            attachedFiles: [],
          }));
        }
      } catch (error) {
        // Only show error if not aborted
        if (!signal?.aborted && currentRequestIdRef.current === requestId) {
          setState((prev) => ({
            ...prev,
            error: error instanceof Error ? error.message : "An error occurred",
            isLoading: false,
          }));
        }
      }
    },
    [
      state.input,
      state.attachedFiles,
      selectedAIProvider,
      allAiProviders,
      state.conversationHistory,
      credits,
      setCredits,
    ]
  );

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    currentRequestIdRef.current = null;
    setState((prev) => ({ ...prev, isLoading: false }));
  }, []);

  const reset = useCallback(() => {
    cancel();
    setState((prev) => ({
      ...prev,
      input: "",
      response: "",
      error: null,
      attachedFiles: [],
    }));
  }, [cancel]);

  // Helper function to convert file to base64
  const fileToBase64 = useCallback(async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = (reader.result as string)?.split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = reject;
    });
  }, []);

  // Note: saveConversation, getConversationById, and generateConversationTitle
  // are now imported from lib/database/chat-history.action.ts

  const loadConversation = useCallback((conversation: ChatConversation) => {
    setState((prev) => ({
      ...prev,
      currentConversationId: conversation.id,
      conversationHistory: conversation.messages,
      input: "",
      response: "",
      error: null,
      isLoading: false,
    }));
  }, []);

  const startNewConversation = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentConversationId: null,
      conversationHistory: [],
      input: "",
      response: "",
      error: null,
      isLoading: false,
      attachedFiles: [],
    }));
    setMessageHistoryOpen(false);
  }, []);

  const saveCurrentConversation = useCallback(
    async (
      userMessage: string,
      assistantResponse: string,
      _attachedFiles: AttachedFile[]
    ) => {
      // Validate inputs
      if (!userMessage || !assistantResponse) {
        console.error("Cannot save conversation: missing message content");
        return;
      }

      const conversationId =
        state.currentConversationId || generateConversationId("chat");
      const timestamp = Date.now();

      const userMsg: ChatMessage = {
        id: generateMessageId("user", timestamp),
        role: "user",
        content: userMessage,
        timestamp,
        attachedFiles: _attachedFiles.length > 0 ? _attachedFiles : undefined,
      };

      const assistantMsg: ChatMessage = {
        id: generateMessageId("assistant", timestamp + MESSAGE_ID_OFFSET),
        role: "assistant",
        content: assistantResponse,
        timestamp: timestamp + MESSAGE_ID_OFFSET,
      };

      const newMessages = [...state.conversationHistory, userMsg, assistantMsg];

      // Get existing conversation if updating
      let existingConversation = null;
      if (state.currentConversationId) {
        try {
          existingConversation = await getConversationById(
            state.currentConversationId
          );
        } catch (error) {
          console.error("Failed to get existing conversation:", error);
        }
      }

      const title =
        state.conversationHistory.length === 0
          ? generateConversationTitle(userMessage)
          : existingConversation?.title ||
            generateConversationTitle(userMessage);

      const conversation: ChatConversation = {
        id: conversationId,
        title,
        messages: newMessages,
        createdAt: existingConversation?.createdAt || timestamp,
        updatedAt: timestamp,
      };

      try {
        await saveConversation(conversation);

        setState((prev) => ({
          ...prev,
          currentConversationId: conversationId,
          conversationHistory: newMessages,
        }));
      } catch (error) {
        console.error("Failed to save conversation:", error);
        // Show error to user
        setState((prev) => ({
          ...prev,
          error: "Failed to save conversation. Please try again.",
        }));
      }
    },
    [state.currentConversationId, state.conversationHistory]
  );

  // Listen for conversation events from the main ChatHistory component
  useEffect(() => {
    const handleConversationSelected = async (event: any) => {
      console.log(event, "event");
      // Only the conversation ID is passed through the event
      const { id } = event.detail;
      console.log(id, "id");
      if (!id || typeof id !== "string") {
        console.error("No conversation ID provided");
        setState((prev) => ({
          ...prev,
          error: "Invalid conversation selected",
        }));
        return;
      }
      console.log(id, "id");
      try {
        // Fetch the full conversation from SQLite
        const conversation = await getConversationById(id);

        if (conversation) {
          loadConversation(conversation);
        } else {
          console.error(`Conversation ${id} not found in database`);
          setState((prev) => ({
            ...prev,
            error: "Conversation not found. It may have been deleted.",
          }));
        }
      } catch (error) {
        console.error("Failed to load conversation:", error);
        setState((prev) => ({
          ...prev,
          error: "Failed to load conversation. Please try again.",
        }));
      }
    };

    const handleNewConversation = () => {
      startNewConversation();
    };

    const handleConversationDeleted = (event: any) => {
      const deletedId = event.detail;
      // If the currently active conversation was deleted, start a new one
      if (state.currentConversationId === deletedId) {
        startNewConversation();
      }
    };

    const handleStorageChange = async (e: StorageEvent) => {
      if (e.key === "deskify-new-conversation" && e.newValue) {
        startNewConversation();
      }

      if (e.key === "deskify-conversation-deleted" && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          const { id } = data;
          if (id === state.currentConversationId) {
            startNewConversation();
          }
        } catch (error) {
          console.error("Failed to parse conversation deletion:", error);
        }
      }

      if (e.key === "deskify-conversation-selected" && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          const { id } = data;
          if (id && typeof id === "string") {
            const conversation = await getConversationById(id);
            if (conversation) {
              loadConversation(conversation);
            }
          }
        } catch (error) {
          console.error("Failed to parse conversation selection:", error);
        }
      }
    };

    window.addEventListener("conversationSelected", handleConversationSelected);
    window.addEventListener("newConversation", handleNewConversation);
    window.addEventListener("conversationDeleted", handleConversationDeleted);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener(
        "conversationSelected",
        handleConversationSelected
      );
      window.removeEventListener("newConversation", handleNewConversation);
      window.removeEventListener(
        "conversationDeleted",
        handleConversationDeleted
      );
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [loadConversation, startNewConversation, state.currentConversationId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const MAX_FILES = 6;

    files.forEach((file) => {
      if (
        file.type.startsWith("image/") &&
        state.attachedFiles.length < MAX_FILES
      ) {
        addFile(file);
      }
    });

    // Reset input so same file can be selected again
    e.target.value = "";
  };

  const handleScreenshotSubmit = useCallback(
    async (base64: string, prompt?: string) => {
      if (state.attachedFiles.length >= MAX_FILES) {
        setState((prev) => ({
          ...prev,
          error: `You can only upload ${MAX_FILES} files`,
        }));
        return;
      }

      try {
        if (prompt) {
          const debitCredits =
            ENABLE_CREDIT_SYSTEM;
          if (debitCredits && credits < CREDITS_PER_MESSAGE) {
            setState((prev) => ({
              ...prev,
              error:
                "You're out of credits for this session. They refresh every 24 hours.",
            }));
            return;
          }
          // Auto mode: Submit directly to AI with screenshot
          const attachedFile: AttachedFile = {
            id: Date.now().toString(),
            name: `screenshot_${Date.now()}.png`,
            type: "image/png",
            base64: base64,
            size: base64.length,
          };

          // Generate unique request ID
          const requestId = generateRequestId();
          currentRequestIdRef.current = requestId;

          // Cancel any existing request
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
          }

          abortControllerRef.current = new AbortController();
          const signal = abortControllerRef.current.signal;

          try {
            // Prepare message history for the AI
            const messageHistory = state.conversationHistory.map((msg) => ({
              role: msg.role,
              content: msg.content,
            }));

            let fullResponse = "";

            const useDeskifyAPI = await shouldUseDeskifyAPI();
            // Check if AI provider is configured
            if (!selectedAIProvider.provider && !useDeskifyAPI) {
              setState((prev) => ({
                ...prev,
                error: "Please select an AI provider in settings",
              }));
              return;
            }

            const provider = allAiProviders.find(
              (p) => p.id === selectedAIProvider.provider
            );
            if (!provider && !useDeskifyAPI) {
              setState((prev) => ({
                ...prev,
                error: "Invalid provider selected",
              }));
              return;
            }

            // Clear previous response and set loading state
            // Show the user-friendly label, not the full internal directive
            const userVisibleLabel = screenshotConfiguration.displayPrompt || prompt;
            setState((prev) => ({
              ...prev,
              input: userVisibleLabel,
              isLoading: true,
              error: null,
              response: "",
            }));

            // Use the fetchAIResponse function with image and signal
            const activeSystemPrompt = getActiveSystemPrompt();
            for await (const chunk of fetchAIResponse({
              provider: useDeskifyAPI ? undefined : provider,
              selectedProvider: selectedAIProvider,
              allAiProviders,
              systemPrompt: activeSystemPrompt || undefined,
              history: messageHistory,
              userMessage: prompt,
              imagesBase64: [base64],
              signal,
            })) {
              // Only update if this is still the current request
              if (currentRequestIdRef.current !== requestId || signal.aborted) {
                return; // Request was superseded or cancelled
              }

              fullResponse += chunk;
              setState((prev) => ({
                ...prev,
                response: prev.response + chunk,
              }));
            }

            // Only proceed if this is still the current request
            if (currentRequestIdRef.current !== requestId || signal.aborted) {
              return;
            }

            setState((prev) => ({ ...prev, isLoading: false }));

            // Focus input after screenshot AI response is complete
            setTimeout(() => {
              inputRef.current?.focus();
            }, 100);

            // Save the conversation after successful completion
            if (fullResponse) {
              await saveCurrentConversation(userVisibleLabel, fullResponse, [
                attachedFile,
              ]);
              if (debitCredits) {
                setCredits(Math.max(0, credits - CREDITS_PER_MESSAGE));
              }
              // Clear input after saving
              setState((prev) => ({
                ...prev,
                input: "",
              }));
            }
          } catch (e: any) {
            // Only show error if this is still the current request and not aborted
            if (currentRequestIdRef.current === requestId && !signal.aborted) {
              setState((prev) => ({
                ...prev,
                error: e.message || "An error occurred",
              }));
            }
          } finally {
            // Only update loading state if this is still the current request
            if (currentRequestIdRef.current === requestId && !signal.aborted) {
              setState((prev) => ({ ...prev, isLoading: false }));
            }
          }
        } else {
          // Manual mode: Add to attached files
          const attachedFile: AttachedFile = {
            id: Date.now().toString(),
            name: `screenshot_${Date.now()}.png`,
            type: "image/png",
            base64: base64,
            size: base64.length,
          };

          setState((prev) => ({
            ...prev,
            attachedFiles: [...prev.attachedFiles, attachedFile],
          }));
        }
      } catch (error) {
        console.error("Failed to process screenshot:", error);
        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error
              ? error.message
              : "An error occurred processing screenshot",
          isLoading: false,
        }));
      }
    },
    [
      state.attachedFiles.length,
      state.conversationHistory,
      selectedAIProvider,
      allAiProviders,
      saveCurrentConversation,
      inputRef,
      credits,
      setCredits,
    ]
  );

  const onRemoveAllFiles = () => {
    clearFiles();
    setIsFilesPopoverOpen(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!state.isLoading && state.input.trim()) {
        submit();
      }
    }
  };

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      // Check if clipboard contains images
      const items = e.clipboardData?.items;
      if (!items) return;

      const hasImages = Array.from(items).some((item) =>
        item.type.startsWith("image/")
      );

      // If we have images, prevent default text pasting and process images
      if (hasImages) {
        e.preventDefault();

        const processedFiles: File[] = [];

        Array.from(items).forEach((item) => {
          if (
            item.type.startsWith("image/") &&
            state.attachedFiles.length + processedFiles.length < MAX_FILES
          ) {
            const file = item.getAsFile();
            if (file) {
              processedFiles.push(file);
            }
          }
        });

        // Process all files
        await Promise.all(processedFiles.map((file) => addFile(file)));
      }
    },
    [state.attachedFiles.length, addFile]
  );

  const isPopoverOpen =
    state.isLoading ||
    state.response !== "" ||
    state.error !== null ||
    (messageHistoryOpen && state.conversationHistory.length > 0);

  const popoverChromeExpanded =
    isChatPanelExpanded &&
    (isPopoverOpen || micOpen || messageHistoryOpen || isFilesPopoverOpen);

  const collapsedWindowHeight = !isChatPanelExpanded ? 92 : 184;

  useEffect(() => {
    resizeWindow(popoverChromeExpanded, collapsedWindowHeight);
  }, [
    popoverChromeExpanded,
    collapsedWindowHeight,
    micOpen,
    messageHistoryOpen,
    resizeWindow,
    isFilesPopoverOpen,
    isChatPanelExpanded,
  ]);

  /** Portaled popovers must close when the chat shell is hidden */
  useEffect(() => {
    if (!isChatPanelExpanded) {
      setIsFilesPopoverOpen(false);
      setMessageHistoryOpen(false);
      setMicOpen(false);
    }
  }, [isChatPanelExpanded]);

  // Auto scroll to bottom when response updates
  useEffect(() => {
    const responseSettings = getResponseSettings();
    if (
      state.response &&
      scrollAreaRef.current &&
      responseSettings.autoScroll
    ) {
      const scrollElement = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollElement) {
        scrollElement.scrollTo({
          top: scrollElement.scrollHeight,
          behavior: "smooth",
        });
      }
    }
  }, [state.response]);

  // Keyboard arrow key support for scrolling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPopoverOpen || !isChatPanelExpanded) return;

      const activeScrollRef = scrollAreaRef.current || scrollAreaRef.current;
      const scrollElement = activeScrollRef?.querySelector(
        "[data-radix-scroll-area-viewport]"
      ) as HTMLElement;

      if (!scrollElement) return;

      const scrollAmount = 100; // pixels to scroll

      if (e.key === "ArrowDown") {
        e.preventDefault();
        scrollElement.scrollBy({ top: scrollAmount, behavior: "smooth" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        scrollElement.scrollBy({ top: -scrollAmount, behavior: "smooth" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPopoverOpen, isChatPanelExpanded, scrollAreaRef]);

  const captureScreenshot = useCallback(
    async (mode: "default" | "selection" = "default") => {
      if (!handleScreenshotSubmit) return;

      const config = screenshotConfigRef.current;
      screenshotInitiatedByThisContext.current = true;
      setIsScreenshotLoading(true);

      try {
        // Check screen recording permission on macOS
        const platform = navigator.platform.toLowerCase();
        if (platform.includes("mac") && !hasCheckedPermissionRef.current) {
          const {
            checkScreenRecordingPermission,
            requestScreenRecordingPermission,
          } = await import("tauri-plugin-macos-permissions-api");

          const hasPermission = await checkScreenRecordingPermission();

          if (!hasPermission) {
            // Request permission
            await requestScreenRecordingPermission();

            // Wait a moment and check again
            await new Promise((resolve) => setTimeout(resolve, 2000));

            const hasPermissionNow = await checkScreenRecordingPermission();

            if (!hasPermissionNow) {
              setState((prev) => ({
                ...prev,
                error:
                  "Screen Recording permission required. Please enable it by going to System Settings > Privacy & Security > Screen & System Audio Recording. If you don't see Deskify in the list, click the '+' button to add it. If it's already listed, make sure it's enabled. Then restart the app.",
              }));
              setIsScreenshotLoading(false);
              screenshotInitiatedByThisContext.current = false;
              return;
            }
          }
          hasCheckedPermissionRef.current = true;
        }

        const shouldForceSelection = mode === "selection";

        if (config.enabled && !shouldForceSelection) {
          const base64 = await invoke("capture_to_base64");

          if (config.mode === "auto") {
            const finalPrompt = state.input.trim()
              ? state.input.trim()
              : config.autoPrompt;
            await handleScreenshotSubmit(base64 as string, finalPrompt);
          } else if (config.mode === "manual") {
            await handleScreenshotSubmit(base64 as string);
          }
          screenshotInitiatedByThisContext.current = false;
        } else {
          isProcessingScreenshotRef.current = false;
          await invoke("start_screen_capture");
        }
      } catch (error) {
        console.error("Screenshot capture failed:", error);

        setState((prev) => ({
          ...prev,
          error: `Failed to capture screenshot: ${error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error)}`,
        }));
        isProcessingScreenshotRef.current = false;
        screenshotInitiatedByThisContext.current = false;
      } finally {
        if (config.enabled) {
          setIsScreenshotLoading(false);
        }
      }
    },
    [handleScreenshotSubmit]
  );

  useEffect(() => {
    let unlisten: any;

    const setupListener = async () => {
      unlisten = await listen("captured-selection", async (event: any) => {
        if (!screenshotInitiatedByThisContext.current) {
          return;
        }

        if (isProcessingScreenshotRef.current) {
          return;
        }

        isProcessingScreenshotRef.current = true;
        const base64 = event.payload;
        const config = screenshotConfigRef.current;

        try {
          const window = getCurrentWindow();
          await window.show();
          await window.setFocus();

          if (config.mode === "auto") {
            // Auto mode: Submit directly to AI with the configured prompt
            await handleScreenshotSubmit(base64 as string, config.autoPrompt);
          } else if (config.mode === "manual") {
            // Manual mode: Add to attached files without prompt
            await handleScreenshotSubmit(base64 as string);
          }
        } catch (error) {
          console.error("Error processing selection:", error);
        } finally {
          setIsScreenshotLoading(false);
          screenshotInitiatedByThisContext.current = false;
          setTimeout(() => {
            isProcessingScreenshotRef.current = false;
          }, 100);
        }
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [handleScreenshotSubmit]);

  useEffect(() => {
    const unlisten = listen("capture-closed", async () => {
      setIsScreenshotLoading(false);
      isProcessingScreenshotRef.current = false;
      screenshotInitiatedByThisContext.current = false;
      const window = getCurrentWindow();
      await window.show();
      await window.setFocus();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const toggleRecording = useCallback(() => {
    setEnableVAD(!enableVAD);
    setMicOpen(!micOpen);
  }, [enableVAD, micOpen]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      currentRequestIdRef.current = null;
    };
  }, []);

  // register callbacks for global shortcuts
  useEffect(() => {
    globalShortcuts.registerAudioCallback(toggleRecording);
    globalShortcuts.registerInputRef(inputRef.current);
    globalShortcuts.registerScreenshotCallback(captureScreenshot);
  }, [
    globalShortcuts.registerAudioCallback,
    globalShortcuts.registerInputRef,
    globalShortcuts.registerScreenshotCallback,
    toggleRecording,
    captureScreenshot,
    inputRef,
  ]);

  return {
    input: state.input,
    setInput,
    response: state.response,
    setResponse,
    isLoading: state.isLoading,
    error: state.error,
    attachedFiles: state.attachedFiles,
    addFile,
    removeFile,
    clearFiles,
    submit,
    cancel,
    reset,
    setState,
    enableVAD,
    setEnableVAD,
    micOpen,
    setMicOpen,
    currentConversationId: state.currentConversationId,
    conversationHistory: state.conversationHistory,
    loadConversation,
    startNewConversation,
    handleDeleteCurrentConversation,
    messageHistoryOpen,
    setMessageHistoryOpen,
    screenshotConfiguration,
    setScreenshotConfiguration,
    handleScreenshotSubmit,
    handleFileSelect,
    handleKeyPress,
    handlePaste,
    isPopoverOpen,
    scrollAreaRef,
    resizeWindow,
    isFilesPopoverOpen,
    setIsFilesPopoverOpen,
    onRemoveAllFiles,
    inputRef,
    captureScreenshot,
    isScreenshotLoading,
    screenshotSent: state.screenshotSent,
    onScreenshotsEnabledChange,
  };
};
