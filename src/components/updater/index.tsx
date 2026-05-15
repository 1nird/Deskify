import { useEffect, useRef } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/** Avoid duplicate updater checks when multiple windows mount. */
const UPDATER_CHECK_DEDUP_MS = 90_000;
const UPDATER_CHECK_STORAGE_KEY = "deskify_updater_last_check_ms";

function shouldSkipUpdaterCheckDueToDedup(): boolean {
  try {
    const raw = localStorage.getItem(UPDATER_CHECK_STORAGE_KEY);
    const last = raw ? parseInt(raw, 10) : 0;
    if (Number.isNaN(last)) return false;
    return Date.now() - last < UPDATER_CHECK_DEDUP_MS;
  } catch {
    return false;
  }
}

function markUpdaterCheckStarted() {
  try {
    localStorage.setItem(UPDATER_CHECK_STORAGE_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/**
 * Discord-style updater: check shortly after startup, download + install in the
 * background, then relaunch. No floating UI on the chat overlay (or elsewhere).
 */
export const Updater = () => {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const run = async () => {
      if (shouldSkipUpdaterCheckDueToDedup()) return;
      markUpdaterCheckStarted();

      try {
        const found = await check({ timeout: 60_000 });
        if (!found) {
          console.log("[Updater] App is up to date.");
          return;
        }

        console.log(`[Updater] Update ${found.version} available — downloading…`);
        await found.downloadAndInstall((event) => {
          if (event.event === "Finished") {
            console.log("[Updater] Install staged; restarting…");
          }
        });
        await relaunch();
      } catch (e) {
        console.warn("[Updater] Silent update skipped:", e);
      }
    };

    const t = window.setTimeout(() => void run(), 2500);
    return () => clearTimeout(t);
  }, []);

  return null;
};

/** Optional: manual check from Settings later — same silent pipeline, no UI. */
export async function checkAndApplyUpdateSilently(): Promise<boolean> {
  try {
    const found = await check({ timeout: 30_000 });
    if (!found) return false;
    await found.downloadAndInstall();
    await relaunch();
    return true;
  } catch (e) {
    console.warn("[Updater] Manual check failed:", e);
    return false;
  }
}
