import {
  AI_PROVIDERS,
  DEFAULT_SYSTEM_PROMPT,
  REFRESH_INTERVAL_MS,
  SCREENSHOT_AUTO_PROMPT_DEFAULT,
  STORAGE_KEYS,
} from "@/config";
import { getPlatform, safeLocalStorage, trackAppStart } from "@/lib";
import {
  getCustomizableState,
  setCustomizableState,
  updateAppIconVisibility,
  updateAlwaysOnTop,
  updateAutostart,
  CustomizableState,
  DEFAULT_CUSTOMIZABLE_STATE,
  CursorType,
  updateCursorType,
} from "@/lib/storage";
import {
  AppUserProfile,
  IContextType,
  ScreenshotConfig,
  TYPE_PROVIDER,
} from "@/types";
import curl2Json from "@bany/curl-to-json";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { enable, disable } from "@tauri-apps/plugin-autostart";
import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

const validateAndProcessCurlProviders = (
  providersJson: string,
  providerType: "AI"
): TYPE_PROVIDER[] => {
  try {
    const parsed = JSON.parse(providersJson);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((p) => {
        try {
          curl2Json(p.curl);
          return true;
        } catch (e) {
          return false;
        }
      })
      .map((p) => {
        const provider = { ...p, isCustom: true };
        return provider;
      });
  } catch (e) {
    console.warn(`Failed to parse custom ${providerType} providers`, e);
    return [];
  }
};

function parseStoredUser(raw: string | null): AppUserProfile | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const p = parsed as Record<string, unknown>;
    const email = p.email != null ? String(p.email).trim() : "";
    const name = p.name != null ? String(p.name).trim() : "";
    if (!email) return null;
    const picture =
      typeof p.picture === "string" && p.picture.trim() !== ""
        ? p.picture.trim()
        : undefined;
    const plan =
      typeof p.plan === "string" && p.plan.trim() !== ""
        ? p.plan.trim()
        : undefined;
    const source =
      p.source === "google" || p.source === "website"
        ? p.source
        : undefined;
    const isPaid = typeof p.isPaid === "boolean" ? p.isPaid : undefined;
    return {
      email,
      name: name || email,
      ...(picture ? { picture } : {}),
      ...(plan ? { plan } : {}),
      ...(source ? { source } : {}),
      ...(typeof isPaid === "boolean" ? { isPaid } : {}),
    };
  } catch {
    return null;
  }
}

// Create the context
const AppContext = createContext<IContextType | undefined>(undefined);

// Create the provider component
export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [systemPrompt, setSystemPrompt] = useState<string>(
    safeLocalStorage.getItem(STORAGE_KEYS.SYSTEM_PROMPT) ||
    DEFAULT_SYSTEM_PROMPT
  );

  // AI Providers
  const [customAiProviders, setCustomAiProviders] = useState<TYPE_PROVIDER[]>(
    []
  );
  const [selectedAIProvider, setSelectedAIProvider] = useState<{
    provider: string;
    variables: Record<string, string>;
  }>(() => {
    const stored = safeLocalStorage.getItem(STORAGE_KEYS.SELECTED_AI_PROVIDER);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.provider) return parsed;
      } catch (e) { }
    }
    return {
      provider: "gemini",
      variables: {
        API_KEY: "AIzaSyDTQrsnOv8F3gi5DyrV0_mvr04PncMlM70",
        MODEL: "gemini-2.5-flash-lite"
      },
    };
  });

  const [screenshotConfiguration, setScreenshotConfiguration] =
    useState<ScreenshotConfig>({
      mode: "auto",
      autoPrompt: SCREENSHOT_AUTO_PROMPT_DEFAULT,
      displayPrompt: "Assist",
      enabled: true,
    });

  // Unified Customizable State
  const [customizable, setCustomizable] = useState<CustomizableState>(
    DEFAULT_CUSTOMIZABLE_STATE
  );

  const [supportsImages, setSupportsImagesState] = useState<boolean>(() => {
    const stored = safeLocalStorage.getItem(STORAGE_KEYS.SUPPORTS_IMAGES);
    return stored === null ? true : stored === "true";
  });

  const [showDashboardOnLaunch, setShowDashboardOnLaunchState] = useState<boolean>(() => {
    const stored = safeLocalStorage.getItem(STORAGE_KEYS.DASHBOARD_ON_LAUNCH);
    return stored === null ? true : stored === "true";
  });

  const [credits, setCredits] = useState<number>(() => {
    const stored = safeLocalStorage.getItem(STORAGE_KEYS.CREDITS);
    if (stored == null) return 0;
    const n = parseInt(stored, 10);
    return Number.isNaN(n) ? 0 : n;
  });

  const [lastRefresh, setLastRefresh] = useState<number>(() => {
    const stored = safeLocalStorage.getItem(STORAGE_KEYS.LAST_REFRESH);
    if (stored == null) return 0;
    const n = parseInt(stored, 10);
    return Number.isNaN(n) ? 0 : n;
  });

  const [user, setUser] = useState<AppUserProfile | null>(() =>
    parseStoredUser(safeLocalStorage.getItem(STORAGE_KEYS.USER))
  );

  useEffect(() => {
    safeLocalStorage.setItem(STORAGE_KEYS.CREDITS, String(credits));
  }, [credits]);

  useEffect(() => {
    safeLocalStorage.setItem(STORAGE_KEYS.LAST_REFRESH, String(lastRefresh));
  }, [lastRefresh]);

  useEffect(() => {
    if (user === null) {
      safeLocalStorage.removeItem(STORAGE_KEYS.USER);
      return;
    }
    safeLocalStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  }, [user]);

  // Wrapper to sync supportsImages to localStorage
  const setSupportsImages = (value: boolean) => {
    setSupportsImagesState(value);
    safeLocalStorage.setItem(STORAGE_KEYS.SUPPORTS_IMAGES, String(value));
  };

  const setShowDashboardOnLaunch = (value: boolean) => {
    setShowDashboardOnLaunchState(value);
    safeLocalStorage.setItem(STORAGE_KEYS.DASHBOARD_ON_LAUNCH, String(value));
  };

  // Function to load AI, system prompt and screenshot config data from storage
  const loadData = () => {
    const savedSystemPrompt = safeLocalStorage.getItem(STORAGE_KEYS.SYSTEM_PROMPT);
    const resolvedSystemPrompt =
      savedSystemPrompt && savedSystemPrompt.trim()
        ? savedSystemPrompt
        : DEFAULT_SYSTEM_PROMPT;
    setSystemPrompt(resolvedSystemPrompt);
    safeLocalStorage.setItem(STORAGE_KEYS.SYSTEM_PROMPT, resolvedSystemPrompt);

    // Load screenshot configuration
    const savedScreenshotConfig = safeLocalStorage.getItem(
      STORAGE_KEYS.SCREENSHOT_CONFIG
    );
    if (savedScreenshotConfig) {
      try {
        const parsed = JSON.parse(savedScreenshotConfig);
        if (typeof parsed === "object" && parsed !== null) {
          const mode = parsed.mode === "manual" ? "manual" : "auto";
          const autoPrompt =
            typeof parsed.autoPrompt === "string" && parsed.autoPrompt.trim()
              ? parsed.autoPrompt
              : SCREENSHOT_AUTO_PROMPT_DEFAULT;
          const displayPrompt =
            typeof parsed.displayPrompt === "string" && parsed.displayPrompt.trim()
              ? parsed.displayPrompt
              : "Assist";

          setScreenshotConfiguration({
            mode,
            autoPrompt,
            displayPrompt,
            enabled: parsed.enabled !== undefined ? parsed.enabled : true,
          });
        }
      } catch {
        console.warn("Failed to parse screenshot configuration");
      }
    }

    // Load custom AI providers
    const savedAi = safeLocalStorage.getItem(STORAGE_KEYS.CUSTOM_AI_PROVIDERS);
    let aiList: TYPE_PROVIDER[] = [];
    if (savedAi) {
      aiList = validateAndProcessCurlProviders(savedAi, "AI");
    }
    setCustomAiProviders(aiList);

    // Load customizable state
    const customizableState = getCustomizableState();
    setCustomizable(customizableState);

    updateCursor(customizableState.cursor.type || "auto");

    // Apply content protection based on saved cursor type
    const isProtected = (customizableState.cursor.type || "auto") === "invisible";
    invoke("set_content_protected", { protected: isProtected }).catch(() => { });

    const stored = safeLocalStorage.getItem(STORAGE_KEYS.CUSTOMIZABLE);
    if (!stored) {
      setCustomizableState(customizableState);
    } else {
      try {
        const parsed = JSON.parse(stored);
        if (!parsed.autostart) {
          setCustomizableState(customizableState);
          updateCursor(customizableState.cursor.type || "invisible");
        }
      } catch (error) {
        console.debug("Failed to check customizable state schema:", error);
      }
    }
  };

  const updateCursor = (type: CursorType | undefined) => {
    try {
      const currentWindow = getCurrentWindow();
      const platform = getPlatform();
      if (platform === "linux") {
        document.documentElement.style.setProperty("--cursor-type", "default");
        return;
      }
      const windowLabel = currentWindow.label;

      if (windowLabel === "dashboard") {
        document.documentElement.style.setProperty("--cursor-type", "default");
        return;
      }

      const safeType = type || "auto";
      const cursorValue = type === "invisible" ? "none" : safeType;
      document.documentElement.style.setProperty("--cursor-type", cursorValue);
    } catch (error) {
      document.documentElement.style.setProperty("--cursor-type", "default");
    }
  };

  // Load data on mount
  useEffect(() => {
    const initializeApp = async () => {
      try {
        const appVersion = await invoke<string>("get_app_version");
        const storage = await invoke<{
          instance_id: string;
        }>("secure_storage_get");
        await trackAppStart(appVersion, storage.instance_id || "");
      } catch (error) {
        console.debug("Failed to track app start:", error);
      }
    };

    const checkCreditRefresh = () => {
      const authRaw = safeLocalStorage.getItem(STORAGE_KEYS.AUTH_SESSION);
      if (!authRaw) return;
      try {
        const parsed = JSON.parse(authRaw) as {
          mode?: string;
          googleProfile?: unknown;
        };
        if (parsed.mode !== "google") return;
        const lastRaw = safeLocalStorage.getItem(STORAGE_KEYS.LAST_REFRESH);
        const last = lastRaw != null ? parseInt(lastRaw, 10) : 0;
        const lastSafe = Number.isNaN(last) ? 0 : last;
        const now = Date.now();
        if (now - lastSafe < REFRESH_INTERVAL_MS) return;
        
        // Since credit system is disabled (ENABLE_CREDIT_SYSTEM = false), 
        // we just reset to 0 or some base value if ever enabled.
        setCredits(0);
        setLastRefresh(now);
      } catch {
        /* ignore */
      }
    };

    loadData();
    checkCreditRefresh();
    void initializeApp();

    // Force migration to Gemini API or ensure Gemini has the correct key
    const stored = safeLocalStorage.getItem(STORAGE_KEYS.SELECTED_AI_PROVIDER);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.provider === "openrouter" || (parsed.provider === "gemini" && !parsed.variables?.API_KEY)) {
          setSelectedAIProvider({
            provider: "gemini",
            variables: {
              API_KEY: "AIzaSyDTQrsnOv8F3gi5DyrV0_mvr04PncMlM70",
              MODEL: "gemini-2.5-flash-lite"
            }
          });
        }
      } catch (e) { }
    }
  }, []);

  // Handle customizable settings on state changes
  useEffect(() => {
    const applyCustomizableSettings = async () => {
      try {
        await Promise.all([
          invoke("set_app_icon_visibility", {
            visible: true,
          }),
          invoke("set_always_on_top", {
            enabled: customizable.alwaysOnTop.isEnabled,
          }),
        ]);
      } catch (error) {
        console.error("Failed to apply customizable settings:", error);
      }
    };

    applyCustomizableSettings();
  }, [customizable]);

  useEffect(() => {
    const initializeAutostart = async () => {
      try {
        const autostartInitialized = safeLocalStorage.getItem(
          STORAGE_KEYS.AUTOSTART_INITIALIZED
        );

        if (!autostartInitialized) {
          const autostartEnabled = customizable?.autostart?.isEnabled ?? false;

          if (autostartEnabled) {
            await enable();
          } else {
            await disable();
          }

          safeLocalStorage.setItem(STORAGE_KEYS.AUTOSTART_INITIALIZED, "true");
        }
      } catch (error) {
        console.debug("Autostart initialization skipped:", error);
      }
    };

    initializeAutostart();
  }, []);

  // Listen for app icon hide/show events
  useEffect(() => {
    const handleAppIconVisibility = async (isVisible: boolean) => {
      try {
        await invoke("set_app_icon_visibility", { visible: isVisible });
      } catch (error) {
        console.error("Failed to set app icon visibility:", error);
      }
    };

    const unlistenHide = listen("handle-app-icon-on-hide", async () => {
      // Intentionally left blank as stealth mode is disabled
    });

    const unlistenShow = listen("handle-app-icon-on-show", async () => {
      await handleAppIconVisibility(true);
    });

    return () => {
      unlistenHide.then((fn) => fn());
      unlistenShow.then((fn) => fn());
    };
  }, []);

  // Listen to storage events for real-time sync
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.SUPPORTS_IMAGES && e.newValue !== null) {
        setSupportsImagesState(e.newValue === "true");
      }

      if (e.key === STORAGE_KEYS.CREDITS && e.newValue !== null) {
        const n = parseInt(e.newValue, 10);
        if (!Number.isNaN(n)) setCredits(n);
      }
      if (e.key === STORAGE_KEYS.LAST_REFRESH && e.newValue !== null) {
        const n = parseInt(e.newValue, 10);
        if (!Number.isNaN(n)) setLastRefresh(n);
      }
      if (e.key === STORAGE_KEYS.USER) {
        setUser(parseStoredUser(e.newValue));
      }

      if (
        e.key === STORAGE_KEYS.CUSTOM_AI_PROVIDERS ||
        e.key === STORAGE_KEYS.SELECTED_AI_PROVIDER ||
        e.key === STORAGE_KEYS.SYSTEM_PROMPT ||
        e.key === STORAGE_KEYS.SCREENSHOT_CONFIG ||
        e.key === STORAGE_KEYS.CUSTOMIZABLE
      ) {
        loadData();
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Check if the current AI provider supports images
  useEffect(() => {
    const provider = allAiProviders.find(
      (p) => p.id === selectedAIProvider.provider
    );
    if (provider) {
      const hasImageSupport = provider.curl?.includes("{{IMAGE}}") ?? false;
      setSupportsImages(hasImageSupport);
    } else {
      setSupportsImages(true);
    }
  }, [selectedAIProvider.provider]);

  // Sync selected AI to localStorage
  useEffect(() => {
    if (selectedAIProvider.provider) {
      safeLocalStorage.setItem(
        STORAGE_KEYS.SELECTED_AI_PROVIDER,
        JSON.stringify(selectedAIProvider)
      );
    }
  }, [selectedAIProvider]);

  // Computed all AI providers
  const allAiProviders: TYPE_PROVIDER[] = [
    ...AI_PROVIDERS,
    ...customAiProviders,
  ];

  const onSetSelectedAIProvider = ({
    provider,
    variables,
  }: {
    provider: string;
    variables: Record<string, string>;
  }) => {
    if (provider && !allAiProviders.some((p) => p.id === provider)) {
      console.warn(`Invalid AI provider ID: ${provider}`);
      return;
    }

    // Update supportsImages immediately when provider changes
    const selectedProvider = allAiProviders.find((p) => p.id === provider);
    if (selectedProvider) {
      const hasImageSupport =
        selectedProvider.curl?.includes("{{IMAGE}}") ?? false;
      setSupportsImages(hasImageSupport);
    } else {
      setSupportsImages(true);
    }

    setSelectedAIProvider((prev) => ({
      ...prev,
      provider,
      variables,
    }));
  };

  // Toggle handlers
  const toggleAppIconVisibility = async (isVisible: boolean) => {
    const newState = updateAppIconVisibility(isVisible);
    setCustomizable(newState);
    try {
      await invoke("set_app_icon_visibility", { visible: isVisible });
      loadData();
    } catch (error) {
      console.error("Failed to toggle app icon visibility:", error);
    }
  };

  const toggleAlwaysOnTop = async (isEnabled: boolean) => {
    const newState = updateAlwaysOnTop(isEnabled);
    setCustomizable(newState);
    try {
      await invoke("set_always_on_top", { enabled: isEnabled });
      loadData();
    } catch (error) {
      console.error("Failed to toggle always on top:", error);
    }
  };

  const toggleAutostart = async (isEnabled: boolean) => {
    const newState = updateAutostart(isEnabled);
    setCustomizable(newState);
    try {
      if (isEnabled) {
        await enable();
      } else {
        await disable();
      }
      loadData();
    } catch (error) {
      console.error("Failed to toggle autostart:", error);
      const revertedState = updateAutostart(!isEnabled);
      setCustomizable(revertedState);
    }
  };

  const setCursorType = (type: CursorType) => {
    setCustomizable((prev) => ({ ...prev, cursor: { type } }));
    updateCursor(type);
    updateCursorType(type);
    // detectable (auto) = NOT content protected, undetectable (invisible) = content protected (hidden)
    const isProtected = type === "invisible";
    invoke("set_content_protected", { protected: isProtected }).catch((e) =>
      console.warn("Failed to set content protection:", e)
    );
    loadData();
  };

  // Create the context value
  const value: IContextType = {
    systemPrompt,
    setSystemPrompt,
    allAiProviders,
    customAiProviders,
    selectedAIProvider,
    onSetSelectedAIProvider,
    screenshotConfiguration,
    setScreenshotConfiguration,
    customizable,
    toggleAppIconVisibility,
    toggleAlwaysOnTop,
    toggleAutostart,
    loadData,
    setCursorType,
    supportsImages,
    setSupportsImages,
    showDashboardOnLaunch,
    setShowDashboardOnLaunch,
    credits,
    setCredits,
    lastRefresh,
    setLastRefresh,
    user,
    setUser,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// Create a hook to access the context
export const useApp = () => {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error("useApp must be used within a AppProvider");
  }

  return context;
};
