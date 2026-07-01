import { useEffect, useState } from "react";
import { useTitles } from "@/hooks";
import { check } from "@tauri-apps/plugin-updater";
import { listen } from "@tauri-apps/api/event";
import { safeLocalStorage, migrateLocalStorageToSQLite } from "@/lib";
import { getShortcutsConfig } from "@/lib/storage";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { compareSemver, detectPlatformKey } from "@/components/updater";

export const useApp = () => {
  const [isHidden, setIsHidden] = useState(false);
  useTitles();

  const [updateAvailable, setUpdateAvailable] = useState<any>(null);

  /** Manual update check (called from DevOptions settings panel). */
  const checkForUpdate = async () => {
    try {
      const update = await check();
      setUpdateAvailable(update ?? null);
      return update ?? null;
    } catch (e) {
      console.error("Update check failed:", e);
      setUpdateAvailable(null);
      throw e;
    }
  };

  // Listen for updates discovered by the silent background updater (any window)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setupListener = async () => {
      try {
        unlisten = await listen<any>("deskify://update-available", async (event) => {
          const payload = event.payload;
          console.log("[Updater] Update event received:", payload?.version);

          // Try the plugin's check() to get the full update object (with downloadAndInstall)
          try {
            const found = await check();
            if (found) {
              setUpdateAvailable(found);
              return;
            }
          } catch {
            // check() failed (e.g. signature error) — fall through to use payload version
          }

          // Use the version from the event payload
          if (payload?.version) {
            setUpdateAvailable({ version: payload.version, _customFallback: true });
          }
        });
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

  /** Custom fallback: fetch latest.json + download via Rust, bypassing the updater plugin. */
  const applyCustomUpdateFallback = async (
    onProgress?: (pct: number) => void
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      onProgress?.(5);
      const res = await fetch(
        "https://github.com/1nird/Deskify/releases/latest/download/latest.json"
      );
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` };

      const json = await res.json();
      const latestVersion = json?.version;
      if (!latestVersion) return { success: false, error: "latest.json missing version" };

      const currentVersion = await getVersion();
      if (compareSemver(latestVersion, currentVersion) <= 0) {
        return { success: false, error: "Already on the latest version" };
      }

      let platformKey = detectPlatformKey();
      let entry = platformKey ? json.platforms?.[platformKey] : null;

      if (!entry && platformKey === "darwin-aarch64") {
        platformKey = "darwin-x86_64";
        entry = json.platforms?.[platformKey];
      }

      if (!entry?.url) {
        return { success: false, error: `No download for ${platformKey}` };
      }

      onProgress?.(10);

      console.log(`[Updater] Downloading v${latestVersion} from ${entry.url}`);
      await invoke("download_and_run_installer", { url: entry.url });

      onProgress?.(90);
      console.log("[Updater] Installer launched successfully");
      return { success: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[Updater] Custom update failed:", msg);
      return { success: false, error: msg || "Update failed" };
    }
  };

  /** Apply the update: download and install, then relaunch. */
  const applyUpdate = async (
    onProgress?: (pct: number) => void
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const update = await check();
      if (!update) return await applyCustomUpdateFallback(onProgress);

      console.log(`[Updater] Downloading update ${update.version}...`);
      await update.downloadAndInstall((event) => {
        if (event.event === "Progress") {
          const downloaded = (event.data as any)?.downloaded ?? 0;
          const total = (event.data as any)?.total;
          if (total && total > 0) {
            onProgress?.(Math.min(99, Math.round((downloaded / total) * 100)));
          }
        } else if (event.event === "Finished") {
          onProgress?.(100);
        }
      });

      console.log("[Updater] Install complete, relaunching...");
      await relaunch();
      return { success: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[Updater] Update failed:", msg);

      // Fallback on signature errors
      if (msg.includes("Invalid symbol") || msg.includes("signature")) {
        console.log("[Updater] Signature error — trying custom fallback...");
        return await applyCustomUpdateFallback(onProgress);
      }

      return { success: false, error: msg || "Update failed" };
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
