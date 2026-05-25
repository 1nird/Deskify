import { useEffect, useState } from "react";
import { useTitles } from "@/hooks";
import { check } from "@tauri-apps/plugin-updater";
import { listen } from "@tauri-apps/api/event";
import { safeLocalStorage, migrateLocalStorageToSQLite } from "@/lib";
import { getShortcutsConfig } from "@/lib/storage";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";


export const useApp = () => {
  const [isHidden, setIsHidden] = useState(false);
  // Initialize title management
  useTitles();

  const [updateAvailable, setUpdateAvailable] = useState<any>(null);

  // Manual update check (called from settings or AuthGate).
  // The silent background check is handled by updater/index.tsx with dedup logic.
  const checkForUpdate = async () => {
    try {
      const update = await check();
      setUpdateAvailable(update ?? null);
      return update ?? null;
    } catch (e) {
      console.error('Update check failed:', e);
      setUpdateAvailable(null);
      throw e;
    }
  };

  // Listen for updates discovered by the silent background updater
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail) {
        setUpdateAvailable(e.detail);
      }
    };
    window.addEventListener('updateAvailable', handler as EventListener);
    return () => window.removeEventListener('updateAvailable', handler as EventListener);
  }, []);

  const applyUpdate = async (
    onProgress?: (pct: number) => void
  ): Promise<{ success: boolean; error?: string }> => {
    console.log("[Updater] Starting update installation...");
    try {
      const freshUpdate = await check();
      if (!freshUpdate) {
        return { success: false, error: "No update available. You are on the latest version." };
      }

      console.log(`[Updater] Update ${freshUpdate.version} found — downloading…`);

      await freshUpdate.downloadAndInstall((event) => {
        if (event.event === "Started") {
          console.log("[Updater] Download started...");
        } else if (event.event === "Progress") {
          const downloaded = (event.data as any)?.downloaded ?? 0;
          const total = (event.data as any)?.total;
          const pct = total && total > 0 ? Math.min(99, Math.round((downloaded / total) * 100)) : 0;
          if (pct > 0) {
            console.log(`[Updater] Download progress: ${pct}%`);
            onProgress?.(pct);
          }
        } else if (event.event === "Finished") {
          console.log("[Updater] Download complete, launching installer...");
          onProgress?.(100);
        }
      });

      console.log("[Updater] Install staged — relaunching…");
      await relaunch();
      return { success: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[Updater] Auto-update failed:", e);
      return { success: false, error: msg || "Update failed. Check your connection and try again." };
    }
  };

  /** Fallback: open the download page in the browser if auto-update fails. */
  const openDownloadPage = async () => {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl("https://deskify.site/download");
    } catch (e) {
      console.error("[Updater] Failed to open download page:", e);
    }
  };
  // Initialize shortcuts from localStorage on app startup
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

  // Migrate localStorage chat history to SQLite on app startup
  useEffect(() => {
    const runMigration = async () => {
      try {
        // Early exit: Check if migration already completed
        const migrationKey = "chat_history_migrated_to_sqlite";
        const alreadyMigrated =
          safeLocalStorage.getItem(migrationKey) === "true";

        if (alreadyMigrated) {
          return; // Migration already complete, skip
        }

        const result = await migrateLocalStorageToSQLite();

        if (result.success) {
          if (result.migratedCount > 0) {
            console.log(
              `Successfully migrated ${result.migratedCount} conversations to SQLite`
            );
          }
        } else if (result.error) {
          // Migration failed - log error
          console.error("Migration error:", result.error);
        }
      } catch (error) {
        // Critical error during migration
        console.error("Critical migration failure:", error);
      }
    };
    runMigration();
  }, []);

  const handleSelectConversation = (conversation: any) => {
    // useCompletion will fetch the full conversation from SQLite by id
    window.dispatchEvent(
      new CustomEvent("conversationSelected", {
        detail: { id: conversation.id },
      })
    );
  };

  const handleNewConversation = () => {
    // Trigger new conversation event
    localStorage.setItem("deskify-new-conversation", String(Date.now()));
    window.dispatchEvent(new CustomEvent("newConversation"));
  };

  // WINDOWS HIDE/SHOW TOGGLE WINDOW WORKAROUND FOR SHORTCUTS
  useEffect(() => {
    const unlistenPromise = listen<boolean>(
      "toggle-window-visibility",
      (event) => {
        const platform = navigator.platform.toLowerCase();
        if (typeof event.payload === "boolean" && platform.includes("win")) {
          setIsHidden(event.payload);
          // find popover open and close it
          const popover = document.getElementById("popover-content");
          // set display to none, change data-state to closed
          if (popover) {
            popover.style.setProperty("display", "none", "important");
            // update the data-state to closed
            popover.setAttribute("data-state", "closed");

            // Also find and update the popover trigger's data-state
            const popoverTriggers = document.querySelectorAll(
              '[data-slot="popover-trigger"]'
            );
            popoverTriggers.forEach((trigger) => {
              trigger.setAttribute("data-state", "closed");
            });
          }
        }
      }
    );

    return () => {
      unlistenPromise.then((unlistenFn) => unlistenFn());
    };
  }, []);

  useEffect(() => {
    const handleShortcutRegistrationError = (
      event: Event | CustomEvent<Array<[string, string, string]>>
    ) => {
      const detail =
        (event as CustomEvent<Array<[string, string, string]>>)?.detail ?? [];

      if (!detail.length) {
        return;
      }

      const formatted = detail
        .map(([action, key, error]) => ({ action, key, error }))
        .filter(({ action, key }) => action && key);

      if (!formatted.length) {
        return;
      }

      console.warn(
        "Some shortcuts could not be registered:",
        formatted.map(({ action, key, error }) => ({
          action,
          key,
          error,
        }))
      );
    };

    window.addEventListener(
      "shortcutRegistrationError",
      handleShortcutRegistrationError as EventListener
    );

    return () => {
      window.removeEventListener(
        "shortcutRegistrationError",
        handleShortcutRegistrationError as EventListener
      );
    };
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
