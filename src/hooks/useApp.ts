import { useEffect, useState } from "react";
import { useTitles } from "@/hooks";
import { check } from "@tauri-apps/plugin-updater";
import { listen, emit } from "@tauri-apps/api/event";
import { safeLocalStorage, migrateLocalStorageToSQLite } from "@/lib";
import { getShortcutsConfig } from "@/lib/storage";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { compareSemver, detectPlatformKey } from "@/components/updater";


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

  // Listen for updates discovered by the silent background updater (any window)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setupListener = async () => {
      try {
        unlisten = await listen<any>("deskify://update-available", async (event) => {
          const payload = event.payload;
          console.log("[Updater] Global update event received:", payload);

          // If the event has a real Tauri update object (from check()), use it directly
          if (payload && typeof payload.downloadAndInstall === 'function') {
            setUpdateAvailable(payload);
            return;
          }

          // Otherwise payload is { version } from custom fallback — try check() first
          try {
            const found = await check();
            if (found) {
              console.log("[Updater] Plugin check() found update:", found.version);
              setUpdateAvailable(found);
              return;
            }
          } catch (err) {
            console.log("[Updater] Plugin check() failed (expected in local test mode), using payload version");
          }

          // Fallback: use the version from the event payload to show update UI
          if (payload?.version) {
            setUpdateAvailable({ version: payload.version, _customFallback: true });
          }
        });
      } catch (err) {
        console.error("Failed to setup global update listener:", err);
      }
    };
    setupListener();

    const handler = (e: CustomEvent) => {
      if (e.detail) {
        setUpdateAvailable(e.detail);
      }
    };
    window.addEventListener('updateAvailable', handler as EventListener);
    return () => {
      window.removeEventListener('updateAvailable', handler as EventListener);
      if (unlisten) unlisten();
    };
  }, []);


  /** Custom fallback: fetch latest.json + download installer via Rust, bypassing the updater plugin. */
  const applyCustomUpdateFallback = async (
    onProgress?: (pct: number) => void
  ): Promise<{ success: boolean; error?: string }> => {
    const startedAt = Date.now();
    console.log("[Updater:Custom:Manual] ===== Manual custom update fallback started =====");

    try {
      // ── Step 1: Fetch latest.json ──
      console.log("[Updater:Custom:Manual] Step 1/5: Fetching latest.json from GitHub...");
      onProgress?.(5);
      const res = await fetch(
        "https://github.com/1nird/Deskify/releases/latest/download/latest.json"
      );
      console.log(
        `[Updater:Custom:Manual]   HTTP ${res.status} ${res.statusText} (${res.headers.get("content-type")})`
      );
      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
      }

      // ── Step 2: Parse JSON and extract version ──
      const json = await res.json();
      const latestVersion = json?.version;
      if (!latestVersion) {
        console.error("[Updater:Custom:Manual] ❌ latest.json missing 'version' field.");
        return { success: false, error: "latest.json missing version" };
      }

      const availablePlatforms = json.platforms ? Object.keys(json.platforms) : [];
      console.log(
        `[Updater:Custom:Manual]   latest.json version: v${latestVersion}`
      );
      console.log(
        `[Updater:Custom:Manual]   Available platforms: [${availablePlatforms.join(", ")}]`
      );

      // ── Step 3: Compare versions ──
      const currentVersion = await getVersion();
      const cmp = compareSemver(latestVersion, currentVersion);
      console.log(
        `[Updater:Custom:Manual] Step 2/5: Version comparison — current: v${currentVersion}, latest: v${latestVersion}`
      );
      console.log(
        `[Updater:Custom:Manual]   semver compare result: ${cmp} (${cmp > 0 ? "UPDATE AVAILABLE ✅" : cmp < 0 ? "downgrade?" : "up to date"})`
      );

      if (cmp <= 0) {
        console.log("[Updater:Custom:Manual] ✅ Already on the latest version — nothing to do.");
        return { success: false, error: "You are on the latest version." };
      }

      // ── Step 4: Detect platform and find matching entry ──
      console.log("[Updater:Custom:Manual] Step 3/5: Detecting platform...");
      console.log(`[Updater:Custom:Manual]   navigator.platform: ${navigator.platform}`);
      console.log(
        `[Updater:Custom:Manual]   userAgent: ${navigator.userAgent.substring(0, 120)}...`
      );

      let platformKey = detectPlatformKey();
      console.log(
        `[Updater:Custom:Manual]   Detected platform key: ${platformKey ?? "null (unknown OS)"}`
      );

      let entry = platformKey ? json.platforms?.[platformKey] : null;

      // macOS fallback
      if (!entry && platformKey === "darwin-aarch64") {
        console.log(
          "[Updater:Custom:Manual]   ⚠️ No entry for darwin-aarch64 — falling back to darwin-x86_64..."
        );
        platformKey = "darwin-x86_64";
        entry = json.platforms?.[platformKey];
        console.log(
          `[Updater:Custom:Manual]   Fallback platform entry: ${entry ? "found ✅" : "not found ❌"}`
        );
      }

      if (!entry?.url) {
        console.error(
          `[Updater:Custom:Manual] ❌ No download URL for platform key "${platformKey ?? "unknown"}".`
        );
        console.error(
          `[Updater:Custom:Manual]   Available keys: [${availablePlatforms.join(", ")}]`
        );
        return { success: false, error: `No download for platform ${platformKey}` };
      }

      const downloadUrl = entry.url;
      const signature = (entry as any).signature;
      console.log(
        `[Updater:Custom:Manual] Step 4/5: Platform entry found — ${platformKey}`
      );
      console.log(
        `[Updater:Custom:Manual]   Download URL: ${downloadUrl}`
      );
      console.log(
        `[Updater:Custom:Manual]   Signature present: ${typeof signature === "string" ? `yes (${signature.replace(/\s/g, "").length} chars)` : "no"}`
      );

      onProgress?.(10);

      emit("deskify://update-available", { version: latestVersion }).catch(console.error);

      // ── Step 5: Call Rust command ──
      console.log(
        "[Updater:Custom:Manual] Step 5/5: Invoking Rust download_and_run_installer..."
      );
      console.log(`[Updater:Custom:Manual]   URL: ${downloadUrl}`);

      const invokeStart = Date.now();
      await invoke("download_and_run_installer", { url: downloadUrl });
      const invokeElapsed = Date.now() - invokeStart;
      console.log(
        `[Updater:Custom:Manual] ✅ Rust command SUCCEEDED (took ${invokeElapsed}ms) — installer launched.`
      );

      onProgress?.(90);

      const totalElapsed = Date.now() - startedAt;
      console.log(
        `[Updater:Custom:Manual] ===== Manual custom update fallback COMPLETE (total: ${totalElapsed}ms) =====`
      );
      return { success: true };
    } catch (e) {
      const totalElapsed = Date.now() - startedAt;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        `[Updater:Custom:Manual] ❌ FAILED after ${totalElapsed}ms: ${msg}`
      );
      console.error("[Updater:Custom:Manual]   Full error:", e);
      return { success: false, error: msg || "Custom update failed." };
    }
  };

  const applyUpdate = async (
    onProgress?: (pct: number) => void
  ): Promise<{ success: boolean; error?: string }> => {
    console.log("[Updater] Starting update installation...");
    try {
      const freshUpdate = await check();
      if (!freshUpdate) {
        // Try custom fallback in case check() returned null but there IS an update
        return await applyCustomUpdateFallback(onProgress);
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

      // Fallback on signature parse errors
      if (msg.includes("Invalid symbol")) {
        console.log("[Updater] Signature error — trying custom fallback...");
        return await applyCustomUpdateFallback(onProgress);
      }

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
