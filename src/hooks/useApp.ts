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

  // Auto-update check on app launch
  const checkForUpdate = async () => {
    try {
      const update = await check();
      // If there is an update object, store it; otherwise clear any previous state.
      setUpdateAvailable(update ?? null);
    } catch (e) {
      console.error('Update check failed:', e);
      setUpdateAvailable(null);
    }
  };

  // Run on mount
  useEffect(() => {
    checkForUpdate();
  }, []);

  const applyUpdate = async (): Promise<boolean> => {
    console.log("[Updater] Starting update installation...");
    try {
      // Method 1: Fresh check to avoid React proxy / state-binding unbinding issues
      console.log("[Updater] Method 1: Checking for fresh update instance...");
      const freshUpdate = await check();
      if (freshUpdate) {
        console.log("[Updater] Fresh update instance found! Downloading and installing...");
        await freshUpdate.downloadAndInstall((event) => {
          console.log("[Updater] progress event:", event);
        });
        console.log("[Updater] Download and install complete. Relaunching...");
        await relaunch();
        return true;
      } else {
        console.warn("[Updater] Fresh check returned null.");
      }
    } catch (e) {
      console.error("[Updater] Method 1 fresh update attempt failed:", e);
    }

    // Method 2: Fallback to the state-held update object if fresh check didn't work
    if (updateAvailable) {
      try {
        console.log("[Updater] Method 2: Falling back to state-held update object...");
        // Re-bind to ensure context isn't lost
        const boundFn = updateAvailable.downloadAndInstall.bind(updateAvailable);
        await boundFn();
        console.log("[Updater] Fallback install complete. Relaunching...");
        await relaunch();
        return true;
      } catch (e) {
        console.error("[Updater] Method 2 fallback update attempt failed:", e);
      }
    }

    console.error("[Updater] Both update methods failed. Check permissions or network.");
    return false;
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
    handleSelectConversation,
    handleNewConversation,
  };
};
