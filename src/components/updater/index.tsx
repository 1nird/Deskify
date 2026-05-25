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
 * background, then relaunch. The installer wizard will appear on Windows (NSIS
 * limitation — Tauri v2 does not support silent NSIS installs). After the
 * wizard completes, the updated app launches automatically.
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
        // Notify other components (AuthGate) about the available update
        window.dispatchEvent(new CustomEvent('updateAvailable', { detail: found }));
        await found.downloadAndInstall((event) => {
          if (event.event === "Started") {
            console.log("[Updater] Download started...");
          } else if (event.event === "Progress") {
            const downloaded = (event.data as any)?.downloaded ?? 0;
            const total = (event.data as any)?.total;
            const pct = total && total > 0 ? Math.min(99, Math.round((downloaded / total) * 100)) : 0;
            if (pct > 0) console.log(`[Updater] Download progress: ${pct}%`);
          } else if (event.event === "Finished") {
            console.log("[Updater] Download complete — launching installer…");
          }
        });
        console.log("[Updater] Installer launched — restarting after install…");
        await relaunch();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("[Updater] Silent update skipped:", msg);
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
