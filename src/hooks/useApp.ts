import { useEffect, useState } from "react";
import { useTitles } from "@/hooks";
import { listen } from "@tauri-apps/api/event";
import { safeLocalStorage, migrateLocalStorageToSQLite } from "@/lib";
import { getShortcutsConfig } from "@/lib/storage";
import { invoke } from "@tauri-apps/api/core";
import { detectPlatformKey } from "@/components/updater";

export const useApp = () => {
  const [isHidden, setIsHidden] = useState(false);
  useTitles();

  const [updateAvailable, setUpdateAvailable] = useState<{
    version: string;
    downloadUrl: string;
  } | null>(null);

  // Listen for updates discovered by the silent background updater
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setupListener = async () => {
      try {
        unlisten = await listen<{ version: string; downloadUrl: string }>(
          "deskify://update-available",
          (event) => {
            console.log("[Updater] Update event received:", event.payload?.version);
            setUpdateAvailable(event.payload);
          }
        );
      } catch (err) {
        console.error("Failed to setup update listener:", err);
      }
    };
    setupListener();

    const handler = (e: CustomEvent) => {
      if (e.detail) setUpdateAvailable(e.detail);
    };
    window.addEventListener("updateAvailable", handler as EventListener);
    return () => {
      window.removeEventListener("updateAvailable", handler as EventListener);
      if (unlisten) unlisten();
    };
  }, []);

  /** Open the download URL in the default browser. */
  const applyUpdate = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      if (updateAvailable?.downloadUrl) {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(updateAvailable.downloadUrl);
        console.log("[Updater] Opened download URL in browser");
        return { success: true };
      }
      // Fallback: open the downloads page
      await openDownloadPage();
      return { success: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[Updater] Failed to open download:", msg);
      return { success: false, error: msg || "Failed to open download" };
    }
  };

  /** Fallback: open the download page in the browser. */
  const openDownloadPage = async () => {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl("https://deskify.site/download");
    } catch (e) {
      console.error("[Updater] Failed to open download page:", e);
    }
  };

  // Manual update check (used from DevOptions settings panel)
  const checkForUpdate = async () => {
    try {
      const res = await fetch(
        "https://github.com/1nird/Deskify/releases/latest/download/latest.json"
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json?.version) {
        let platformKey = detectPlatformKey();
        let entry = platformKey ? json.platforms?.[platformKey] : null;
        if (!entry && platformKey === "darwin-aarch64") {
          entry = json.platforms?.["darwin-x86_64"];
        }
        const downloadUrl: string = entry?.url ?? "";
        setUpdateAvailable({ version: json.version, downloadUrl });
        return { version: json.version, downloadUrl };
      }
      return null;
    } catch (e) {
      console.error("[Updater] Manual check failed:", e);
      throw e;
    }
  };

  // Initialize shortcuts from storage on startup
  useEffect(() => {
    const initializeShortcuts = async () => {
      try {
        const config = getShortcutsConfig();
        await invoke("update_shortcuts", { config });
      } catch (error) {
        console.error("Failed to initialize shortcuts:", error);
      }
    };
    initializeShortcuts();
  }, []);

  // Migrate localStorage chat history to SQLite on startup
  useEffect(() => {
    const runMigration = async () => {
      try {
        const migrationKey = "chat_history_migrated_to_sqlite";
        if (safeLocalStorage.getItem(migrationKey) === "true") return;

        const result = await migrateLocalStorageToSQLite();
        if (result.success && result.migratedCount > 0) {
          console.log(`Migrated ${result.migratedCount} conversations to SQLite`);
        }
      } catch (error) {
        console.error("Migration failed:", error);
      }
    };
    runMigration();
  }, []);

  const handleSelectConversation = (conversation: any) => {
    window.dispatchEvent(
      new CustomEvent("conversationSelected", {
        detail: { id: conversation.id },
      })
    );
  };

  const handleNewConversation = () => {
    localStorage.setItem("deskify-new-conversation", String(Date.now()));
    window.dispatchEvent(new CustomEvent("newConversation"));
  };

  // Windows hide/show toggle for shortcuts
  useEffect(() => {
    const unlistenPromise = listen<boolean>("toggle-window-visibility", (event) => {
      const platform = navigator.platform.toLowerCase();
      if (typeof event.payload === "boolean" && platform.includes("win")) {
        setIsHidden(event.payload);
        const popover = document.getElementById("popover-content");
        if (popover) {
          popover.style.setProperty("display", "none", "important");
          popover.setAttribute("data-state", "closed");
          document.querySelectorAll('[data-slot="popover-trigger"]').forEach((trigger) => {
            trigger.setAttribute("data-state", "closed");
          });
        }
      }
    });
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const handleError = (event: Event | CustomEvent<Array<[string, string, string]>>) => {
      const detail = (event as CustomEvent<Array<[string, string, string]>>)?.detail ?? [];
      if (!detail.length) return;
      const formatted = detail
        .map(([action, key, error]) => ({ action, key, error }))
        .filter(({ action, key }) => action && key);
      if (formatted.length) {
        console.warn("Shortcuts could not be registered:", formatted);
      }
    };
    window.addEventListener("shortcutRegistrationError", handleError as EventListener);
    return () => window.removeEventListener("shortcutRegistrationError", handleError as EventListener);
  }, []);

  return {
    isHidden,
    updateAvailable,
    setUpdateAvailable,
    checkForUpdate,
    applyUpdate,
    openDownloadPage,
    handleSelectConversation,
    handleNewConversation,
  };
};
